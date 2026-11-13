import { SCHEMA } from './schema.js';
import { renderPage, robots, sitemap, pingIndexNow } from './seo.js';

/* ---------- helpers ---------- */
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
const now = () => Math.floor(Date.now() / 1000);
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const rid = (n = 11) => [...crypto.getRandomValues(new Uint8Array(n))].map((x) => ALPHA[x % ALPHA.length]).join('');
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100000 }, key, 256);
  return hex(bits);
}
const safeEqual = (a, b) => {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
};

let schemaReady = null;
function ensureSchema(env) {
  if (!schemaReady) {
    schemaReady = env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s))).catch((e) => { schemaReady = null; throw e; });
  }
  return schemaReady;
}
export const all = async (env, sql, ...args) => (await env.DB.prepare(sql).bind(...args).all()).results;
export const one = (env, sql, ...args) => env.DB.prepare(sql).bind(...args).first();
const run = (env, sql, ...args) => env.DB.prepare(sql).bind(...args).run();
const stmt = (env, sql, ...args) => env.DB.prepare(sql).bind(...args);

const media = (key) => (key ? '/media/' + key : null);
const RESERVED = new Set(['admin', 'api', 'media', 'video', 'tag', 'discover', 'upload', 'inbox', 'settings', 'messages',
  'following', 'search', 'terms', 'privacy', 'guidelines', 'login', 'signup', 'support', 'help', 'about', 'official']);
const USERNAME_RE = /^[a-z0-9_.]{3,24}$/;

/* ---------- auth ---------- */
function cookie(request, name) {
  const m = (request.headers.get('cookie') || '').match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
  return m ? m[1] : null;
}
async function getUser(env, request) {
  const sid = cookie(request, 'sid');
  if (!sid) return null;
  return one(env,
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?1 AND s.expires_at > ?2`,
    await sha256(sid), now());
}
async function startSession(env, request, userId) {
  const sid = rid(40);
  const maxAge = 60 * 60 * 24 * 30;
  await run(env, `INSERT INTO sessions (token, user_id, expires_at) VALUES (?1, ?2, ?3)`, await sha256(sid), userId, now() + maxAge);
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return { 'set-cookie': `sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}` };
}
const isAdmin = (env, user) =>
  !!user && (user.id === 1 || (env.ADMIN_USERNAMES || '').split(',').map((s) => s.trim().toLowerCase()).includes(user.username));
const selfShape = (env, u) => ({
  id: u.id, username: u.username, display_name: u.display_name, bio: u.bio, avatar: media(u.avatar_key),
  email: u.email, is_admin: isAdmin(env, u),
});

/* ---------- shapes ---------- */
// ?1 is always the viewer's user id (0 when signed out).
const VSEL = `SELECT v.*, u.username, u.display_name, u.avatar_key,
  EXISTS(SELECT 1 FROM likes WHERE user_id = ?1 AND video_id = v.id) AS liked,
  EXISTS(SELECT 1 FROM bookmarks WHERE user_id = ?1 AND video_id = v.id) AS saved,
  EXISTS(SELECT 1 FROM follows WHERE follower_id = ?1 AND followee_id = v.user_id) AS following
  FROM videos v JOIN users u ON u.id = v.user_id`;
const VISIBLE = `(v.privacy = 'public' OR v.user_id = ?1)`;
const NOT_BLOCKED = `v.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?1)`;
const mapVideo = (r) => ({
  id: r.id, caption: r.caption, src: media(r.video_key), poster: media(r.thumb_key), duration: r.duration,
  privacy: r.privacy, allow_comments: !!r.allow_comments, views: r.views, likes: r.likes_count,
  comments: r.comments_count, shares: r.shares_count, saves: r.bookmarks_count, created_at: r.created_at,
  liked: !!r.liked, saved: !!r.saved,
  author: { id: r.user_id, username: r.username, display_name: r.display_name, avatar: media(r.avatar_key), following: !!r.following },
});
const mapUser = (r) => ({
  id: r.id, username: r.username, display_name: r.display_name, bio: r.bio || '', avatar: media(r.avatar_key),
  followers: r.followers ?? undefined, following: !!r.is_following,
});
const USEL = `SELECT u.id, u.username, u.display_name, u.bio, u.avatar_key,
  (SELECT COUNT(*) FROM follows WHERE followee_id = u.id) AS followers,
  EXISTS(SELECT 1 FROM follows WHERE follower_id = ?1 AND followee_id = u.id) AS is_following
  FROM users u`;

const parseTags = (text) =>
  [...new Set([...text.matchAll(/#([\p{L}\p{N}_]{1,50})/gu)].map((m) => m[1].toLowerCase()))].slice(0, 10);
const parseMentions = (text) =>
  [...new Set([...text.matchAll(/@([a-z0-9_.]{3,24})/gi)].map((m) => m[1].toLowerCase()))].slice(0, 5);
const likeEscape = (s) => '%' + s.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
const page = (url, size = 12) => ({ limit: size, offset: Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0) });

async function notify(env, userId, actorId, type, videoId = null, commentId = null) {
  if (userId === actorId) return;
  const blocked = await one(env, `SELECT 1 AS x FROM blocks WHERE blocker_id = ?1 AND blocked_id = ?2`, userId, actorId);
  if (blocked) return;
  await run(env, `INSERT INTO notifications (user_id, actor_id, type, video_id, comment_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    userId, actorId, type, videoId, commentId, now());
}
async function removeVideos(env, videos) {
  if (!videos.length) return;
  const keys = videos.flatMap((v) => [v.video_key, v.thumb_key]).filter(Boolean);
  for (let i = 0; i < keys.length; i += 500) await env.MEDIA.delete(keys.slice(i, i + 500));
  const batch = [];
  for (const v of videos) {
    for (const t of ['likes', 'bookmarks', 'views', 'video_tags', 'notifications', 'reports']) {
      batch.push(stmt(env, `DELETE FROM ${t} WHERE video_id = ?1`, v.id));
    }
    batch.push(stmt(env, `DELETE FROM comment_likes WHERE comment_id IN (SELECT id FROM comments WHERE video_id = ?1)`, v.id));
    batch.push(stmt(env, `DELETE FROM comments WHERE video_id = ?1`, v.id));
    batch.push(stmt(env, `DELETE FROM videos WHERE id = ?1`, v.id));
  }
  for (let i = 0; i < batch.length; i += 90) await env.DB.batch(batch.slice(i, i + 90));
}

/* ---------- uploads + media ---------- */
const UPLOAD_KINDS = {
  video: { max: 95 * 1024 * 1024, types: { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' } },
  thumb: { max: 2 * 1024 * 1024, types: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } },
  avatar: { max: 2 * 1024 * 1024, types: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } },
};
export const maxVideoMb = (env) => Math.min(95, Math.max(1, Number(env.MAX_VIDEO_MB) || 95));
async function handleUpload(env, request, url, user) {
  const kind = url.searchParams.get('kind');
  const spec = UPLOAD_KINDS[kind];
  if (!spec) throw new HttpError(400, 'Unknown upload type.');
  const type = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const ext = spec.types[type];
  if (!ext) throw new HttpError(415, kind === 'video' ? 'Use an MP4, WebM or MOV video.' : 'Use a JPG, PNG or WebP image.');
  const size = parseInt(request.headers.get('content-length') || '0', 10);
  if (!size) throw new HttpError(411, 'The file is empty.');
  const max = kind === 'video' ? maxVideoMb(env) * 1048576 : spec.max;
  if (size > max) throw new HttpError(413, `That file is too large. The limit is ${Math.round(max / 1048576)} MB.`);
  if (kind === 'video') {
    const r = await one(env, `SELECT COUNT(*) AS n FROM uploads WHERE user_id = ?1 AND kind = 'video' AND created_at > ?2`, user.id, now() - 86400);
    if (r.n >= 30) throw new HttpError(429, 'You have reached the daily upload limit. Try again tomorrow.');
  }
  const key = `${kind}/${user.id}/${rid(20)}.${ext}`;
  await env.MEDIA.put(key, request.body, {
    httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' },
  });
  await run(env, `INSERT INTO uploads (key, user_id, kind, created_at) VALUES (?1, ?2, ?3, ?4)`, key, user.id, kind, now());
  return json({ key });
}
async function ownUpload(env, user, key, kind) {
  if (!key) return null;
  const row = await one(env, `SELECT key FROM uploads WHERE key = ?1 AND user_id = ?2 AND kind = ?3`, String(key), user.id, kind);
  if (!row) throw new HttpError(400, 'That upload could not be found. Try uploading again.');
  return row.key;
}
async function serveMedia(env, request, key) {
  if (!env.MEDIA) return new Response('Storage is not set up', { status: 503 });
  let obj;
  try {
    obj = await env.MEDIA.get(key, { range: request.headers, onlyIf: request.headers });
  } catch {
    obj = await env.MEDIA.get(key);
  }
  if (!obj) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('accept-ranges', 'bytes');
  if (!headers.has('cache-control')) headers.set('cache-control', 'public, max-age=31536000, immutable');
  if (!('body' in obj) || !obj.body) return new Response(null, { status: 304, headers });
  let status = 200;
  if (obj.range && request.headers.get('range')) {
    const offset = obj.range.offset ?? (obj.range.suffix ? obj.size - obj.range.suffix : 0);
    const length = obj.range.length ?? obj.size - offset;
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    headers.set('content-length', String(length));
    status = 206;
  } else {
    headers.set('content-length', String(obj.size));
  }
  return new Response(request.method === 'HEAD' ? null : obj.body, { status, headers });
}

/* ---------- API ---------- */
const routes = [];
const route = (method, pattern, handler, opts = {}) => routes.push({ method, pattern, handler, ...opts });
const body = async (request) => {
  try { return (await request.json()) || {}; } catch { return {}; }
};
const text = (v, max) => String(v ?? '').trim().slice(0, max);

// --- accounts
route('POST', /^\/auth\/signup$/, async ({ env, request }) => {
  const b = await body(request);
  const username = text(b.username, 40).toLowerCase().replace(/^@/, '');
  const email = text(b.email, 200).toLowerCase();
  const password = String(b.password || '');
  if (!USERNAME_RE.test(username) || RESERVED.has(username)) {
    throw new HttpError(400, 'Usernames are 3 to 24 characters: letters, numbers, underscores and dots.');
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  if (password.length < 8) throw new HttpError(400, 'Passwords need at least 8 characters.');
  if (!b.age_ok) throw new HttpError(400, 'You must be 13 or older to join.');
  const taken = await one(env, `SELECT username, email FROM users WHERE username = ?1 OR email = ?2`, username, email);
  if (taken) throw new HttpError(409, taken.username === username ? 'That username is taken.' : 'An account with that email already exists.');
  const salt = rid(16);
  const res = await run(env,
    `INSERT INTO users (username, email, pass_hash, salt, display_name, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    username, email, await hashPassword(password, salt), salt, text(b.display_name, 40) || username, now());
  const user = await one(env, `SELECT * FROM users WHERE id = ?1`, res.meta.last_row_id);
  return json({ user: selfShape(env, user) }, 200, await startSession(env, request, user.id));
});
route('POST', /^\/auth\/login$/, async ({ env, request }) => {
  const b = await body(request);
  const id = text(b.login, 200).toLowerCase().replace(/^@/, '');
  const user = await one(env, `SELECT * FROM users WHERE username = ?1 OR email = ?1`, id);
  const ok = user && safeEqual(await hashPassword(String(b.password || ''), user.salt), user.pass_hash);
  if (!ok) throw new HttpError(401, 'That username or password is not right.');
  return json({ user: selfShape(env, user) }, 200, await startSession(env, request, user.id));
});
route('POST', /^\/auth\/logout$/, async ({ env, request }) => {
  const sid = cookie(request, 'sid');
  if (sid) await run(env, `DELETE FROM sessions WHERE token = ?1`, await sha256(sid));
  return json({ ok: true }, 200, { 'set-cookie': 'sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' });
});
route('GET', /^\/me$/, async ({ env, user }) => {
  if (!user) return json({ user: null });
  const c = await one(env,
    `SELECT (SELECT COUNT(*) FROM notifications WHERE user_id = ?1 AND seen = 0) AS n,
            (SELECT COUNT(*) FROM messages WHERE recipient_id = ?1 AND seen = 0) AS m`, user.id);
  return json({ user: selfShape(env, user), unread: { activity: c.n, messages: c.m } });
});
route('PATCH', /^\/me$/, async ({ env, request, user }) => {
  const b = await body(request);
  let username = user.username;
  if (b.username !== undefined) {
    username = text(b.username, 40).toLowerCase().replace(/^@/, '');
    if (username !== user.username) {
      if (!USERNAME_RE.test(username) || RESERVED.has(username)) throw new HttpError(400, 'Usernames are 3 to 24 characters: letters, numbers, underscores and dots.');
      if (await one(env, `SELECT 1 AS x FROM users WHERE username = ?1`, username)) throw new HttpError(409, 'That username is taken.');
    }
  }
  const avatar = b.avatar_key !== undefined ? await ownUpload(env, user, b.avatar_key, 'avatar') : user.avatar_key;
  if (avatar !== user.avatar_key && user.avatar_key) await env.MEDIA.delete(user.avatar_key);
  await run(env, `UPDATE users SET username = ?1, display_name = ?2, bio = ?3, avatar_key = ?4 WHERE id = ?5`,
    username, b.display_name !== undefined ? text(b.display_name, 40) || username : user.display_name,
    b.bio !== undefined ? text(b.bio, 160) : user.bio, avatar, user.id);
  return json({ user: selfShape(env, await one(env, `SELECT * FROM users WHERE id = ?1`, user.id)) });
}, { auth: true });
route('POST', /^\/me\/password$/, async ({ env, request, user }) => {
  const b = await body(request);
  if (!safeEqual(await hashPassword(String(b.current || ''), user.salt), user.pass_hash)) throw new HttpError(401, 'Your current password is not right.');
  if (String(b.next || '').length < 8) throw new HttpError(400, 'Passwords need at least 8 characters.');
  const salt = rid(16);
  await run(env, `UPDATE users SET pass_hash = ?1, salt = ?2 WHERE id = ?3`, await hashPassword(String(b.next), salt), salt, user.id);
  return json({ ok: true });
}, { auth: true });
route('DELETE', /^\/me$/, async ({ env, request, user }) => {
  const b = await body(request);
  if (!safeEqual(await hashPassword(String(b.password || ''), user.salt), user.pass_hash)) throw new HttpError(401, 'Your password is not right.');
  await deleteAccount(env, user);
  return json({ ok: true }, 200, { 'set-cookie': 'sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' });
}, { auth: true });

async function deleteAccount(env, user) {
  await removeVideos(env, await all(env, `SELECT id, video_key, thumb_key FROM videos WHERE user_id = ?1`, user.id));
  const id = user.id;
  await env.DB.batch([
    stmt(env, `UPDATE videos SET likes_count = likes_count - 1 WHERE id IN (SELECT video_id FROM likes WHERE user_id = ?1)`, id),
    stmt(env, `UPDATE videos SET bookmarks_count = bookmarks_count - 1 WHERE id IN (SELECT video_id FROM bookmarks WHERE user_id = ?1)`, id),
    stmt(env, `UPDATE comments SET likes_count = likes_count - 1 WHERE id IN (SELECT comment_id FROM comment_likes WHERE user_id = ?1)`, id),
    stmt(env, `DELETE FROM comment_likes WHERE user_id = ?1 OR comment_id IN (SELECT id FROM comments WHERE user_id = ?1 OR parent_id IN (SELECT id FROM comments WHERE user_id = ?1))`, id),
    stmt(env, `DELETE FROM comments WHERE parent_id IN (SELECT id FROM comments WHERE user_id = ?1)`, id),
    stmt(env, `DELETE FROM comments WHERE user_id = ?1`, id),
    stmt(env, `UPDATE videos SET comments_count = (SELECT COUNT(*) FROM comments WHERE video_id = videos.id)`),
    stmt(env, `DELETE FROM likes WHERE user_id = ?1`, id),
    stmt(env, `DELETE FROM bookmarks WHERE user_id = ?1`, id),
    stmt(env, `DELETE FROM views WHERE user_id = ?1`, id),
    stmt(env, `DELETE FROM follows WHERE follower_id = ?1 OR followee_id = ?1`, id),
    stmt(env, `DELETE FROM blocks WHERE blocker_id = ?1 OR blocked_id = ?1`, id),
    stmt(env, `DELETE FROM notifications WHERE user_id = ?1 OR actor_id = ?1`, id),
    stmt(env, `DELETE FROM messages WHERE sender_id = ?1 OR recipient_id = ?1`, id),
    stmt(env, `DELETE FROM reports WHERE reporter_id = ?1`, id),
    stmt(env, `DELETE FROM uploads WHERE user_id = ?1`, id),
    stmt(env, `DELETE FROM sessions WHERE user_id = ?1`, id),
    stmt(env, `DELETE FROM users WHERE id = ?1`, id),
  ]);
  if (user.avatar_key) await env.MEDIA.delete(user.avatar_key);
}

// --- uploads
route('PUT', /^\/upload$/, ({ env, request, url, user }) => handleUpload(env, request, url, user), { auth: true });

// --- feed
route('GET', /^\/feed$/, async ({ env, url, user }) => {
  const uid = user?.id || 0;
  const { offset } = page(url);
  const limit = 6;
  const since = parseInt(url.searchParams.get('since') || '0', 10) || now();
  const first = url.searchParams.get('first');
  let rows;
  if (url.searchParams.get('type') === 'following') {
    if (!user) return json({ videos: [], done: true });
    rows = await all(env,
      `${VSEL} WHERE v.privacy = 'public' AND v.user_id IN (SELECT followee_id FROM follows WHERE follower_id = ?1)
       ORDER BY v.created_at DESC LIMIT ?2 OFFSET ?3`, uid, limit, offset);
  } else {
    // Ranked by engagement with a recency decay; videos this viewer already watched before this session go last.
    rows = await all(env,
      `${VSEL} LEFT JOIN views w ON w.user_id = ?1 AND w.video_id = v.id AND w.created_at < ?2
       WHERE v.privacy = 'public' AND ${NOT_BLOCKED} AND v.id != ?5
       ORDER BY (w.video_id IS NOT NULL) ASC,
         (v.likes_count * 3 + v.comments_count * 4 + v.shares_count * 5 + v.bookmarks_count * 4 + v.views * 0.2 + 5.0)
           / ((?2 - v.created_at) / 3600.0 + 6.0) DESC, v.created_at DESC
       LIMIT ?3 OFFSET ?4`, uid, since, limit, offset, first || '');
    if (first && offset === 0) {
      const f = await one(env, `${VSEL} WHERE v.id = ?2 AND ${VISIBLE}`, uid, first);
      if (f) rows.unshift(f);
    }
  }
  return json({ videos: rows.map(mapVideo), done: rows.length < limit, since });
});

// --- videos
route('POST', /^\/videos$/, async ({ env, request, url, user, ctx }) => {
  const b = await body(request);
  const videoKey = await ownUpload(env, user, b.video_key, 'video');
  if (!videoKey) throw new HttpError(400, 'Choose a video to post.');
  if (await one(env, `SELECT 1 AS x FROM videos WHERE video_key = ?1`, videoKey)) throw new HttpError(409, 'That video is already posted.');
  const thumbKey = await ownUpload(env, user, b.thumb_key, 'thumb');
  const caption = text(b.caption, 2200);
  const id = rid(11);
  const privacy = b.privacy === 'private' ? 'private' : 'public';
  const tags = parseTags(caption);
  await env.DB.batch([
    stmt(env, `INSERT INTO videos (id, user_id, caption, video_key, thumb_key, duration, privacy, allow_comments, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
      id, user.id, caption, videoKey, thumbKey, Math.max(0, Number(b.duration) || 0), privacy, b.allow_comments === false ? 0 : 1, now()),
    ...tags.map((t) => stmt(env, `INSERT OR IGNORE INTO video_tags (video_id, tag) VALUES (?1, ?2)`, id, t)),
  ]);
  if (privacy === 'public') {
    for (const name of parseMentions(caption)) {
      const m = await one(env, `SELECT id FROM users WHERE username = ?1`, name);
      if (m) await notify(env, m.id, user.id, 'mention', id);
    }
    ctx.waitUntil(pingIndexNow(env, url, [`/video/${id}`, `/@${user.username}`]));
  }
  return json({ video: mapVideo(await one(env, `${VSEL} WHERE v.id = ?2`, user.id, id)) });
}, { auth: true });
route('GET', /^\/videos\/([\w-]+)$/, async ({ env, user, params }) => {
  const v = await one(env, `${VSEL} WHERE v.id = ?2 AND ${VISIBLE}`, user?.id || 0, params[0]);
  if (!v) throw new HttpError(404, 'This video is not available.');
  return json({ video: mapVideo(v) });
});
route('PATCH', /^\/videos\/([\w-]+)$/, async ({ env, request, user, params }) => {
  const v = await one(env, `SELECT * FROM videos WHERE id = ?1 AND user_id = ?2`, params[0], user.id);
  if (!v) throw new HttpError(404, 'This video is not available.');
  const b = await body(request);
  const caption = b.caption !== undefined ? text(b.caption, 2200) : v.caption;
  const privacy = b.privacy !== undefined ? (b.privacy === 'private' ? 'private' : 'public') : v.privacy;
  const allow = b.allow_comments !== undefined ? (b.allow_comments ? 1 : 0) : v.allow_comments;
  await env.DB.batch([
    stmt(env, `UPDATE videos SET caption = ?1, privacy = ?2, allow_comments = ?3 WHERE id = ?4`, caption, privacy, allow, v.id),
    stmt(env, `DELETE FROM video_tags WHERE video_id = ?1`, v.id),
    ...parseTags(caption).map((t) => stmt(env, `INSERT OR IGNORE INTO video_tags (video_id, tag) VALUES (?1, ?2)`, v.id, t)),
  ]);
  return json({ video: mapVideo(await one(env, `${VSEL} WHERE v.id = ?2`, user.id, v.id)) });
}, { auth: true });
route('DELETE', /^\/videos\/([\w-]+)$/, async ({ env, user, params }) => {
  const v = await one(env, `SELECT * FROM videos WHERE id = ?1`, params[0]);
  if (!v || (v.user_id !== user.id && !isAdmin(env, user))) throw new HttpError(404, 'This video is not available.');
  await removeVideos(env, [v]);
  return json({ ok: true });
}, { auth: true });

async function toggle(env, request, table, counter, user, videoId, notifType) {
  const v = await one(env, `SELECT id, user_id FROM videos v WHERE id = ?2 AND ${VISIBLE}`, user.id, videoId);
  if (!v) throw new HttpError(404, 'This video is not available.');
  const on = (await body(request)).on !== false;
  if (on) {
    const r = await run(env, `INSERT OR IGNORE INTO ${table} (user_id, video_id, created_at) VALUES (?1, ?2, ?3)`, user.id, v.id, now());
    if (r.meta.changes) {
      await run(env, `UPDATE videos SET ${counter} = ${counter} + 1 WHERE id = ?1`, v.id);
      if (notifType) await notify(env, v.user_id, user.id, notifType, v.id);
    }
  } else {
    const r = await run(env, `DELETE FROM ${table} WHERE user_id = ?1 AND video_id = ?2`, user.id, v.id);
    if (r.meta.changes) await run(env, `UPDATE videos SET ${counter} = MAX(0, ${counter} - 1) WHERE id = ?1`, v.id);
  }
  const c = await one(env, `SELECT ${counter} AS n FROM videos WHERE id = ?1`, v.id);
  return json({ on, count: c.n });
}
route('POST', /^\/videos\/([\w-]+)\/like$/, ({ env, request, user, params }) => toggle(env, request, 'likes', 'likes_count', user, params[0], 'like'), { auth: true });
route('POST', /^\/videos\/([\w-]+)\/save$/, ({ env, request, user, params }) => toggle(env, request, 'bookmarks', 'bookmarks_count', user, params[0]), { auth: true });
route('POST', /^\/videos\/([\w-]+)\/view$/, async ({ env, user, params }) => {
  const r = await run(env, `UPDATE videos SET views = views + 1 WHERE id = ?1`, params[0]);
  if (user && r.meta.changes) await run(env, `INSERT OR IGNORE INTO views (user_id, video_id, created_at) VALUES (?1, ?2, ?3)`, user.id, params[0], now());
  return json({ ok: true });
});
route('POST', /^\/videos\/([\w-]+)\/share$/, async ({ env, params }) => {
  await run(env, `UPDATE videos SET shares_count = shares_count + 1 WHERE id = ?1 AND privacy = 'public'`, params[0]);
  return json({ ok: true });
});
route('POST', /^\/videos\/([\w-]+)\/report$/, async ({ env, request, user, params }) => {
  const v = await one(env, `SELECT id FROM videos WHERE id = ?1`, params[0]);
  if (!v) throw new HttpError(404, 'This video is not available.');
  const reason = text((await body(request)).reason, 300) || 'Other';
  const dup = await one(env, `SELECT 1 AS x FROM reports WHERE reporter_id = ?1 AND video_id = ?2 AND resolved = 0`, user.id, v.id);
  if (!dup) await run(env, `INSERT INTO reports (reporter_id, video_id, reason, created_at) VALUES (?1, ?2, ?3, ?4)`, user.id, v.id, reason, now());
  return json({ ok: true });
}, { auth: true });

// --- comments
const CSEL = `SELECT c.*, u.username, u.display_name, u.avatar_key,
  EXISTS(SELECT 1 FROM comment_likes WHERE user_id = ?1 AND comment_id = c.id) AS liked
  FROM comments c JOIN users u ON u.id = c.user_id`;
const mapComment = (r) => ({
  id: r.id, body: r.body, parent_id: r.parent_id, likes: r.likes_count, liked: !!r.liked, created_at: r.created_at,
  author: { id: r.user_id, username: r.username, display_name: r.display_name, avatar: media(r.avatar_key) },
});
route('GET', /^\/videos\/([\w-]+)\/comments$/, async ({ env, user, params }) => {
  const uid = user?.id || 0;
  const v = await one(env, `SELECT id FROM videos v WHERE id = ?2 AND ${VISIBLE}`, uid, params[0]);
  if (!v) throw new HttpError(404, 'This video is not available.');
  const rows = await all(env,
    `${CSEL} WHERE c.video_id = ?2 AND c.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?1)
     ORDER BY c.created_at ASC LIMIT 500`, uid, v.id);
  const top = [];
  const byId = new Map();
  for (const r of rows) {
    const c = { ...mapComment(r), replies: [] };
    byId.set(c.id, c);
    if (c.parent_id && byId.has(c.parent_id)) byId.get(c.parent_id).replies.push(c);
    else if (!c.parent_id) top.push(c);
  }
  top.sort((a, b) => b.likes - a.likes || b.created_at - a.created_at);
  return json({ comments: top });
});
route('POST', /^\/videos\/([\w-]+)\/comments$/, async ({ env, request, user, params }) => {
  const v = await one(env, `SELECT id, user_id, allow_comments FROM videos v WHERE id = ?2 AND ${VISIBLE}`, user.id, params[0]);
  if (!v) throw new HttpError(404, 'This video is not available.');
  if (!v.allow_comments) throw new HttpError(403, 'Comments are turned off for this video.');
  const b = await body(request);
  const txt = text(b.body, 500);
  if (!txt) throw new HttpError(400, 'Write something first.');
  let parent = null;
  if (b.parent_id) {
    parent = await one(env, `SELECT id, user_id, parent_id FROM comments WHERE id = ?1 AND video_id = ?2`, Number(b.parent_id), v.id);
    if (!parent) throw new HttpError(404, 'That comment was deleted.');
  }
  const parentId = parent ? parent.parent_id || parent.id : null;
  const res = await run(env, `INSERT INTO comments (video_id, user_id, parent_id, body, created_at) VALUES (?1, ?2, ?3, ?4, ?5)`,
    v.id, user.id, parentId, txt, now());
  const id = res.meta.last_row_id;
  await run(env, `UPDATE videos SET comments_count = comments_count + 1 WHERE id = ?1`, v.id);
  const told = new Set([user.id]);
  if (parent && !told.has(parent.user_id)) { told.add(parent.user_id); await notify(env, parent.user_id, user.id, 'reply', v.id, id); }
  if (!told.has(v.user_id)) { told.add(v.user_id); await notify(env, v.user_id, user.id, 'comment', v.id, id); }
  for (const name of parseMentions(txt)) {
    const m = await one(env, `SELECT id FROM users WHERE username = ?1`, name);
    if (m && !told.has(m.id)) { told.add(m.id); await notify(env, m.id, user.id, 'mention', v.id, id); }
  }
  return json({ comment: { ...mapComment(await one(env, `${CSEL} WHERE c.id = ?2`, user.id, id)), replies: [] } });
}, { auth: true });
route('DELETE', /^\/comments\/(\d+)$/, async ({ env, user, params }) => {
  const c = await one(env, `SELECT c.*, v.user_id AS owner_id FROM comments c JOIN videos v ON v.id = c.video_id WHERE c.id = ?1`, Number(params[0]));
  if (!c || (c.user_id !== user.id && c.owner_id !== user.id && !isAdmin(env, user))) throw new HttpError(404, 'That comment was deleted.');
  const n = await one(env, `SELECT COUNT(*) AS n FROM comments WHERE id = ?1 OR parent_id = ?1`, c.id);
  await env.DB.batch([
    stmt(env, `DELETE FROM comment_likes WHERE comment_id IN (SELECT id FROM comments WHERE id = ?1 OR parent_id = ?1)`, c.id),
    stmt(env, `DELETE FROM notifications WHERE comment_id IN (SELECT id FROM comments WHERE id = ?1 OR parent_id = ?1)`, c.id),
    stmt(env, `DELETE FROM comments WHERE id = ?1 OR parent_id = ?1`, c.id),
    stmt(env, `UPDATE videos SET comments_count = MAX(0, comments_count - ?1) WHERE id = ?2`, n.n, c.video_id),
  ]);
  return json({ ok: true, removed: n.n });
}, { auth: true });
route('POST', /^\/comments\/(\d+)\/like$/, async ({ env, request, user, params }) => {
  const id = Number(params[0]);
  if (!(await one(env, `SELECT 1 AS x FROM comments WHERE id = ?1`, id))) throw new HttpError(404, 'That comment was deleted.');
  const on = (await body(request)).on !== false;
  const r = on
    ? await run(env, `INSERT OR IGNORE INTO comment_likes (user_id, comment_id) VALUES (?1, ?2)`, user.id, id)
    : await run(env, `DELETE FROM comment_likes WHERE user_id = ?1 AND comment_id = ?2`, user.id, id);
  if (r.meta.changes) await run(env, `UPDATE comments SET likes_count = MAX(0, likes_count + ?1) WHERE id = ?2`, on ? 1 : -1, id);
  const c = await one(env, `SELECT likes_count AS n FROM comments WHERE id = ?1`, id);
  return json({ on, count: c.n });
}, { auth: true });

// --- people
const findUser = async (env, name) => {
  const u = await one(env, `SELECT * FROM users WHERE username = ?1`, String(name).toLowerCase());
  if (!u) throw new HttpError(404, 'This account does not exist.');
  return u;
};
route('GET', /^\/users\/([a-z0-9_.]+)$/i, async ({ env, user, params }) => {
  const u = await findUser(env, params[0]);
  const uid = user?.id || 0;
  const s = await one(env,
    `SELECT (SELECT COUNT(*) FROM follows WHERE followee_id = ?1) AS followers,
            (SELECT COUNT(*) FROM follows WHERE follower_id = ?1) AS following,
            (SELECT COALESCE(SUM(likes_count), 0) FROM videos WHERE user_id = ?1) AS likes,
            (SELECT COUNT(*) FROM videos WHERE user_id = ?1 AND (privacy = 'public' OR user_id = ?2)) AS videos,
            EXISTS(SELECT 1 FROM follows WHERE follower_id = ?2 AND followee_id = ?1) AS is_following,
            EXISTS(SELECT 1 FROM follows WHERE follower_id = ?1 AND followee_id = ?2) AS follows_me,
            EXISTS(SELECT 1 FROM blocks WHERE blocker_id = ?2 AND blocked_id = ?1) AS blocked`, u.id, uid);
  return json({
    user: {
      id: u.id, username: u.username, display_name: u.display_name, bio: u.bio, avatar: media(u.avatar_key),
      followers: s.followers, following_count: s.following, likes: s.likes, videos: s.videos,
      following: !!s.is_following, follows_me: !!s.follows_me, blocked: !!s.blocked, is_me: u.id === uid, created_at: u.created_at,
    },
  });
});
route('GET', /^\/users\/([a-z0-9_.]+)\/videos$/i, async ({ env, url, user, params }) => {
  const u = await findUser(env, params[0]);
  const uid = user?.id || 0;
  const { limit, offset } = page(url, 18);
  const tab = url.searchParams.get('tab') || 'videos';
  let rows;
  if (tab === 'videos') {
    rows = await all(env, `${VSEL} WHERE v.user_id = ?2 AND ${VISIBLE} ORDER BY v.created_at DESC LIMIT ?3 OFFSET ?4`, uid, u.id, limit, offset);
  } else {
    if (u.id !== uid) throw new HttpError(403, 'Only the account owner can see this.');
    const t = tab === 'saved' ? 'bookmarks' : 'likes';
    rows = await all(env, `${VSEL} JOIN ${t} x ON x.video_id = v.id AND x.user_id = ?2 WHERE ${VISIBLE} ORDER BY x.created_at DESC LIMIT ?3 OFFSET ?4`, uid, u.id, limit, offset);
  }
  return json({ videos: rows.map(mapVideo), done: rows.length < limit });
});
route('GET', /^\/users\/([a-z0-9_.]+)\/(followers|following)$/i, async ({ env, url, user, params }) => {
  const u = await findUser(env, params[0]);
  const { limit, offset } = page(url, 30);
  const join = params[1] === 'followers'
    ? `JOIN follows f ON f.follower_id = u.id AND f.followee_id = ?2`
    : `JOIN follows f ON f.followee_id = u.id AND f.follower_id = ?2`;
  const rows = await all(env, `${USEL} ${join} ORDER BY f.created_at DESC LIMIT ?3 OFFSET ?4`, user?.id || 0, u.id, limit, offset);
  return json({ users: rows.map(mapUser), done: rows.length < limit });
});
route('POST', /^\/users\/([a-z0-9_.]+)\/follow$/i, async ({ env, request, user, params }) => {
  const u = await findUser(env, params[0]);
  if (u.id === user.id) throw new HttpError(400, 'You cannot follow yourself.');
  const on = (await body(request)).on !== false;
  if (on) {
    if (await one(env, `SELECT 1 AS x FROM blocks WHERE (blocker_id = ?1 AND blocked_id = ?2) OR (blocker_id = ?2 AND blocked_id = ?1)`, u.id, user.id)) {
      throw new HttpError(403, 'You cannot follow this account.');
    }
    const r = await run(env, `INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?1, ?2, ?3)`, user.id, u.id, now());
    if (r.meta.changes) await notify(env, u.id, user.id, 'follow');
  } else {
    await run(env, `DELETE FROM follows WHERE follower_id = ?1 AND followee_id = ?2`, user.id, u.id);
  }
  const c = await one(env, `SELECT COUNT(*) AS n FROM follows WHERE followee_id = ?1`, u.id);
  return json({ on, count: c.n });
}, { auth: true });
route('POST', /^\/users\/([a-z0-9_.]+)\/block$/i, async ({ env, request, user, params }) => {
  const u = await findUser(env, params[0]);
  if (u.id === user.id) throw new HttpError(400, 'You cannot block yourself.');
  const on = (await body(request)).on !== false;
  if (on) {
    await env.DB.batch([
      stmt(env, `INSERT OR IGNORE INTO blocks (blocker_id, blocked_id) VALUES (?1, ?2)`, user.id, u.id),
      stmt(env, `DELETE FROM follows WHERE (follower_id = ?1 AND followee_id = ?2) OR (follower_id = ?2 AND followee_id = ?1)`, user.id, u.id),
    ]);
  } else {
    await run(env, `DELETE FROM blocks WHERE blocker_id = ?1 AND blocked_id = ?2`, user.id, u.id);
  }
  return json({ on });
}, { auth: true });

// --- discover + search
route('GET', /^\/discover$/, async ({ env, user }) => {
  const uid = user?.id || 0;
  let tags = await all(env,
    `SELECT t.tag, COUNT(*) AS n FROM video_tags t JOIN videos v ON v.id = t.video_id
     WHERE v.privacy = 'public' AND v.created_at > ?1 GROUP BY t.tag ORDER BY n DESC, t.tag LIMIT 16`, now() - 14 * 86400);
  if (tags.length < 6) {
    tags = await all(env,
      `SELECT t.tag, COUNT(*) AS n FROM video_tags t JOIN videos v ON v.id = t.video_id
       WHERE v.privacy = 'public' GROUP BY t.tag ORDER BY n DESC, t.tag LIMIT 16`);
  }
  const creators = await all(env,
    `${USEL} WHERE u.id != ?1 AND EXISTS(SELECT 1 FROM videos WHERE user_id = u.id AND privacy = 'public')
     AND u.id NOT IN (SELECT followee_id FROM follows WHERE follower_id = ?1)
     AND u.id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?1)
     ORDER BY followers DESC, u.id DESC LIMIT 10`, uid);
  const videos = await all(env,
    `${VSEL} WHERE v.privacy = 'public' AND ${NOT_BLOCKED}
     ORDER BY (v.likes_count * 3 + v.comments_count * 4 + v.shares_count * 5 + v.views * 0.2) DESC, v.created_at DESC LIMIT 18`, uid);
  return json({ tags, creators: creators.map(mapUser), videos: videos.map(mapVideo) });
});
route('GET', /^\/tags\/([^/]+)$/, async ({ env, url, user, params }) => {
  const tag = decodeURIComponent(params[0]).toLowerCase();
  const { limit, offset } = page(url, 18);
  const rows = await all(env,
    `${VSEL} JOIN video_tags t ON t.video_id = v.id AND t.tag = ?2 WHERE v.privacy = 'public' AND ${NOT_BLOCKED}
     ORDER BY v.likes_count DESC, v.created_at DESC LIMIT ?3 OFFSET ?4`, user?.id || 0, tag, limit, offset);
  const c = await one(env, `SELECT COUNT(*) AS n FROM video_tags t JOIN videos v ON v.id = t.video_id WHERE t.tag = ?1 AND v.privacy = 'public'`, tag);
  return json({ tag, count: c.n, videos: rows.map(mapVideo), done: rows.length < limit });
});
route('GET', /^\/search$/, async ({ env, url, user }) => {
  const q = text(url.searchParams.get('q'), 80).replace(/^[#@]/, '');
  if (!q) return json({ users: [], videos: [], tags: [] });
  const uid = user?.id || 0;
  const like = likeEscape(q.toLowerCase());
  const [users, videos, tags] = await Promise.all([
    all(env, `${USEL} WHERE (u.username LIKE ?2 ESCAPE '\\' OR LOWER(u.display_name) LIKE ?2 ESCAPE '\\') ORDER BY followers DESC LIMIT 12`, uid, like),
    all(env,
      `${VSEL} WHERE v.privacy = 'public' AND ${NOT_BLOCKED} AND (LOWER(v.caption) LIKE ?2 ESCAPE '\\'
        OR v.id IN (SELECT video_id FROM video_tags WHERE tag LIKE ?2 ESCAPE '\\'))
       ORDER BY v.likes_count DESC, v.created_at DESC LIMIT 24`, uid, like),
    all(env,
      `SELECT t.tag, COUNT(*) AS n FROM video_tags t JOIN videos v ON v.id = t.video_id
       WHERE v.privacy = 'public' AND t.tag LIKE ?1 ESCAPE '\\' GROUP BY t.tag ORDER BY n DESC LIMIT 12`, like),
  ]);
  return json({ users: users.map(mapUser), videos: videos.map(mapVideo), tags });
});

// --- activity
route('GET', /^\/notifications$/, async ({ env, user }) => {
  const rows = await all(env,
    `SELECT n.*, u.username, u.display_name, u.avatar_key, v.thumb_key, c.body AS comment_body,
       EXISTS(SELECT 1 FROM follows WHERE follower_id = ?1 AND followee_id = n.actor_id) AS is_following
     FROM notifications n JOIN users u ON u.id = n.actor_id
     LEFT JOIN videos v ON v.id = n.video_id LEFT JOIN comments c ON c.id = n.comment_id
     WHERE n.user_id = ?1 ORDER BY n.id DESC LIMIT 60`, user.id);
  await run(env, `UPDATE notifications SET seen = 1 WHERE user_id = ?1 AND seen = 0`, user.id);
  return json({
    notifications: rows.map((r) => ({
      id: r.id, type: r.type, seen: !!r.seen, created_at: r.created_at, video_id: r.video_id, poster: media(r.thumb_key),
      comment: r.comment_body || null,
      actor: { username: r.username, display_name: r.display_name, avatar: media(r.avatar_key), following: !!r.is_following },
    })),
  });
}, { auth: true });

// --- messages
route('GET', /^\/conversations$/, async ({ env, user }) => {
  const rows = await all(env,
    `SELECT m.id, m.body, m.created_at, m.sender_id, u.username, u.display_name, u.avatar_key,
       (SELECT COUNT(*) FROM messages WHERE sender_id = u.id AND recipient_id = ?1 AND seen = 0) AS unread
     FROM messages m
     JOIN (SELECT MAX(id) AS id, CASE WHEN sender_id = ?1 THEN recipient_id ELSE sender_id END AS other
           FROM messages WHERE sender_id = ?1 OR recipient_id = ?1 GROUP BY other) t ON t.id = m.id
     JOIN users u ON u.id = t.other ORDER BY m.id DESC LIMIT 60`, user.id);
  return json({
    conversations: rows.map((r) => ({
      user: { username: r.username, display_name: r.display_name, avatar: media(r.avatar_key) },
      last: { body: r.body, created_at: r.created_at, mine: r.sender_id === user.id }, unread: r.unread,
    })),
  });
}, { auth: true });
route('GET', /^\/messages\/([a-z0-9_.]+)$/i, async ({ env, url, user, params }) => {
  const u = await findUser(env, params[0]);
  const after = parseInt(url.searchParams.get('after') || '0', 10) || 0;
  const rows = await all(env,
    `SELECT * FROM (SELECT id, sender_id, body, created_at FROM messages
       WHERE ((sender_id = ?1 AND recipient_id = ?2) OR (sender_id = ?2 AND recipient_id = ?1)) AND id > ?3
       ORDER BY id DESC LIMIT 200) ORDER BY id ASC`, user.id, u.id, after);
  await run(env, `UPDATE messages SET seen = 1 WHERE sender_id = ?1 AND recipient_id = ?2 AND seen = 0`, u.id, user.id);
  return json({
    user: { username: u.username, display_name: u.display_name, avatar: media(u.avatar_key) },
    messages: rows.map((r) => ({ id: r.id, body: r.body, created_at: r.created_at, mine: r.sender_id === user.id })),
  });
}, { auth: true });
route('POST', /^\/messages\/([a-z0-9_.]+)$/i, async ({ env, request, user, params }) => {
  const u = await findUser(env, params[0]);
  if (u.id === user.id) throw new HttpError(400, 'You cannot message yourself.');
  if (await one(env, `SELECT 1 AS x FROM blocks WHERE (blocker_id = ?1 AND blocked_id = ?2) OR (blocker_id = ?2 AND blocked_id = ?1)`, u.id, user.id)) {
    throw new HttpError(403, 'You cannot message this account.');
  }
  const txt = text((await body(request)).body, 1000);
  if (!txt) throw new HttpError(400, 'Write something first.');
  const recent = await one(env, `SELECT COUNT(*) AS n FROM messages WHERE sender_id = ?1 AND created_at > ?2`, user.id, now() - 60);
  if (recent.n >= 30) throw new HttpError(429, 'You are sending messages too fast. Wait a minute.');
  const t = now();
  const r = await run(env, `INSERT INTO messages (sender_id, recipient_id, body, created_at) VALUES (?1, ?2, ?3, ?4)`, user.id, u.id, txt, t);
  return json({ message: { id: r.meta.last_row_id, body: txt, created_at: t, mine: true } });
}, { auth: true });

// --- moderation
route('GET', /^\/admin\/reports$/, async ({ env, user }) => {
  if (!isAdmin(env, user)) throw new HttpError(403, 'Admins only.');
  const rows = await all(env,
    `SELECT r.id, r.reason, r.created_at, r.video_id, v.caption, v.thumb_key, ru.username AS reporter, vu.username AS owner
     FROM reports r JOIN videos v ON v.id = r.video_id JOIN users ru ON ru.id = r.reporter_id JOIN users vu ON vu.id = v.user_id
     WHERE r.resolved = 0 ORDER BY r.id DESC LIMIT 100`);
  return json({ reports: rows.map((r) => ({ ...r, poster: media(r.thumb_key), thumb_key: undefined })) });
}, { auth: true });
route('POST', /^\/admin\/reports\/(\d+)$/, async ({ env, request, user, params }) => {
  if (!isAdmin(env, user)) throw new HttpError(403, 'Admins only.');
  const r = await one(env, `SELECT * FROM reports WHERE id = ?1`, Number(params[0]));
  if (!r) throw new HttpError(404, 'That report is gone.');
  if ((await body(request)).action === 'remove') {
    const v = await one(env, `SELECT * FROM videos WHERE id = ?1`, r.video_id);
    if (v) await removeVideos(env, [v]);
  } else {
    await run(env, `UPDATE reports SET resolved = 1 WHERE video_id = ?1`, r.video_id);
  }
  return json({ ok: true });
}, { auth: true });

async function handleApi(env, request, url, ctx) {
  if (!env.DB) throw new HttpError(503, 'The database is not connected yet.');
  await ensureSchema(env);
  const path = url.pathname.slice(4);
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== url.host) throw new HttpError(403, 'Cross-site requests are not allowed.');
  }
  for (const r of routes) {
    if (r.method !== request.method) continue;
    const m = path.match(r.pattern);
    if (!m) continue;
    const user = await getUser(env, request);
    if (r.auth && !user) throw new HttpError(401, 'Log in to do that.');
    if (r.method !== 'GET' && !env.MEDIA && /upload|videos$|^\/me$/.test(path)) throw new HttpError(503, 'Video storage is not connected yet.');
    return r.handler({ env, request, url, user, ctx, params: m.slice(1) });
  }
  throw new HttpError(404, 'Not found.');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path.startsWith('/api/')) return await handleApi(env, request, url, ctx);
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
      if (path.startsWith('/media/')) return await serveMedia(env, request, decodeURIComponent(path.slice(7)));
      if (path === '/robots.txt') return robots(env, url);
      if (path === '/sitemap.xml') { await ensureSchema(env); return await sitemap(env, url); }
      if (env.INDEXNOW_KEY && path === `/${env.INDEXNOW_KEY}.txt`) return new Response(env.INDEXNOW_KEY, { headers: { 'content-type': 'text/plain' } });
      if (/\.[a-z0-9]{2,5}$/i.test(path) && !path.startsWith('/@')) return env.ASSETS.fetch(request);
      if (env.DB) await ensureSchema(env);
      return await renderPage(env, request, url);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e.stack || e);
      if (path.startsWith('/api/')) return json({ error: 'Something went wrong on our side. Try again.' }, 500);
      return new Response('Something went wrong. Try again.', { status: 500 });
    }
  },
};
