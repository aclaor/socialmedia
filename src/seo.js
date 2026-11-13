import { all, one } from './index.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
const iso = (t) => new Date(t * 1000).toISOString();
const isoDuration = (s) => `PT${Math.max(1, Math.round(s || 1))}S`;
const siteName = (env) => env.SITE_NAME || 'Clipleey';
const PRIVATE_PATHS = /^\/(upload|inbox|settings|following|search|messages)(\/|$)/;

const videoLinks = (rows) =>
  rows.length
    ? `<ul>${rows.map((v) => `<li><a href="/video/${v.id}">${esc(clip(v.caption, 90) || `Video by @${v.username}`)}</a> by <a href="/@${esc(v.username)}">@${esc(v.username)}</a></li>`).join('')}</ul>`
    : '';

const TEXT_PAGES = {
  '/terms': ['Terms of use', 'The rules for using this site.'],
  '/privacy': ['Privacy policy', 'What this site collects and how it is used.'],
  '/guidelines': ['Community guidelines', 'What is and is not allowed in videos, comments and messages.'],
};

async function describe(env, url) {
  const site = siteName(env);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const origin = url.origin;
  const base = { status: 200, canonical: origin + path, type: 'website', jsonld: [], ssr: '', noindex: false };
  let m;

  if (path === '/') {
    const rows = env.DB ? await all(env, `SELECT v.id, v.caption, u.username FROM videos v JOIN users u ON u.id = v.user_id WHERE v.privacy = 'public' ORDER BY v.created_at DESC LIMIT 30`) : [];
    return {
      ...base, title: `${site}: watch and share short videos`,
      desc: `${site} is a place to watch, make and share short videos. Follow creators, like and comment, and post your own clips in seconds.`,
      jsonld: [{ '@context': 'https://schema.org', '@type': 'WebSite', name: site, url: origin + '/',
        potentialAction: { '@type': 'SearchAction', target: `${origin}/discover?q={search_term_string}`, 'query-input': 'required name=search_term_string' } }],
      ssr: `<h1>${esc(site)}: watch and share short videos</h1><p>Follow creators, like and comment, and post your own clips.</p><p><a href="/discover">Discover trending videos</a></p>${videoLinks(rows)}`,
    };
  }
  if ((m = path.match(/^\/video\/([\w-]+)$/))) {
    const v = env.DB && await one(env,
      `SELECT v.*, u.username, u.display_name FROM videos v JOIN users u ON u.id = v.user_id WHERE v.id = ?1 AND v.privacy = 'public'`, m[1]);
    if (!v) return { ...base, status: 404, noindex: true, title: `Video not available | ${site}`, desc: 'This video is private or was removed.', ssr: '<h1>This video is not available</h1><p><a href="/">Watch other videos</a></p>' };
    const tags = await all(env, `SELECT tag FROM video_tags WHERE video_id = ?1`, v.id);
    const name = clip(v.caption, 70) || `Video by @${v.username}`;
    const desc = clip(`${v.caption || name} · ${v.likes_count} likes, ${v.comments_count} comments. Watch more from ${v.display_name} (@${v.username}) on ${site}.`, 200);
    const poster = v.thumb_key ? `${origin}/media/${v.thumb_key}` : null;
    return {
      ...base, type: 'video.other', title: `${name} | @${v.username} on ${site}`, desc, image: poster,
      video: `${origin}/media/${v.video_key}`,
      jsonld: [{
        '@context': 'https://schema.org', '@type': 'VideoObject', name, description: clip(v.caption, 300) || name,
        uploadDate: iso(v.created_at), duration: isoDuration(v.duration), contentUrl: `${origin}/media/${v.video_key}`,
        ...(poster ? { thumbnailUrl: [poster] } : {}), url: origin + path,
        author: { '@type': 'Person', name: v.display_name, url: `${origin}/@${v.username}` },
        interactionStatistic: [
          { '@type': 'InteractionCounter', interactionType: { '@type': 'WatchAction' }, userInteractionCount: v.views },
          { '@type': 'InteractionCounter', interactionType: { '@type': 'LikeAction' }, userInteractionCount: v.likes_count },
          { '@type': 'InteractionCounter', interactionType: { '@type': 'CommentAction' }, userInteractionCount: v.comments_count },
        ],
      }],
      ssr: `<article><h1>${esc(name)}</h1><p>${esc(v.caption)}</p><p>By <a href="/@${esc(v.username)}">${esc(v.display_name)} (@${esc(v.username)})</a></p>
        <p>${v.views} views, ${v.likes_count} likes, ${v.comments_count} comments</p>
        <p>${tags.map((t) => `<a href="/tag/${encodeURIComponent(t.tag)}">#${esc(t.tag)}</a>`).join(' ')}</p></article>`,
    };
  }
  if ((m = path.match(/^\/@([a-z0-9_.]+)$/i))) {
    const u = env.DB && await one(env, `SELECT * FROM users WHERE username = ?1`, m[1].toLowerCase());
    if (!u) return { ...base, status: 404, noindex: true, title: `Account not found | ${site}`, desc: 'This account does not exist.', ssr: '<h1>This account does not exist</h1><p><a href="/">Go to the home feed</a></p>' };
    const rows = await all(env, `SELECT v.id, v.caption, ?2 AS username FROM videos v WHERE v.user_id = ?1 AND v.privacy = 'public' ORDER BY v.created_at DESC LIMIT 30`, u.id, u.username);
    const s = await one(env, `SELECT (SELECT COUNT(*) FROM follows WHERE followee_id = ?1) AS followers, (SELECT COALESCE(SUM(likes_count), 0) FROM videos WHERE user_id = ?1) AS likes`, u.id);
    const image = u.avatar_key ? `${origin}/media/${u.avatar_key}` : null;
    return {
      ...base, type: 'profile', canonical: `${origin}/@${u.username}`, image,
      title: `${u.display_name} (@${u.username}) | ${site}`,
      desc: clip(`${u.display_name} (@${u.username}) on ${site}. ${s.followers} followers, ${s.likes} likes. ${u.bio}`, 200),
      noindex: rows.length === 0,
      jsonld: [{
        '@context': 'https://schema.org', '@type': 'ProfilePage', dateCreated: iso(u.created_at),
        mainEntity: {
          '@type': 'Person', name: u.display_name, alternateName: '@' + u.username, description: u.bio, url: `${origin}/@${u.username}`,
          ...(image ? { image } : {}),
          interactionStatistic: [{ '@type': 'InteractionCounter', interactionType: { '@type': 'FollowAction' }, userInteractionCount: s.followers }],
        },
      }],
      ssr: `<h1>${esc(u.display_name)} (@${esc(u.username)})</h1><p>${esc(u.bio)}</p><p>${s.followers} followers, ${s.likes} likes</p>${videoLinks(rows)}`,
    };
  }
  if ((m = path.match(/^\/tag\/([^/]+)$/))) {
    let tag = '';
    try { tag = decodeURIComponent(m[1]).toLowerCase(); } catch { /* bad encoding */ }
    const rows = env.DB && tag ? await all(env,
      `SELECT v.id, v.caption, u.username FROM videos v JOIN users u ON u.id = v.user_id JOIN video_tags t ON t.video_id = v.id AND t.tag = ?1
       WHERE v.privacy = 'public' ORDER BY v.likes_count DESC, v.created_at DESC LIMIT 30`, tag) : [];
    return {
      ...base, canonical: `${origin}/tag/${encodeURIComponent(tag)}`, noindex: rows.length === 0,
      title: `#${tag} videos | ${site}`, desc: `Watch the most liked #${tag} videos on ${site}.`,
      ssr: `<h1>#${esc(tag)}</h1><p>${rows.length ? `Popular #${esc(tag)} videos` : 'No videos use this hashtag yet.'}</p>${videoLinks(rows)}`,
    };
  }
  if (path === '/discover') {
    const q = url.searchParams.get('q');
    const tags = env.DB ? await all(env, `SELECT t.tag, COUNT(*) AS n FROM video_tags t JOIN videos v ON v.id = t.video_id WHERE v.privacy = 'public' GROUP BY t.tag ORDER BY n DESC LIMIT 30`) : [];
    const rows = env.DB ? await all(env, `SELECT v.id, v.caption, u.username FROM videos v JOIN users u ON u.id = v.user_id WHERE v.privacy = 'public' ORDER BY v.likes_count DESC, v.created_at DESC LIMIT 30`) : [];
    return {
      ...base, noindex: !!q, title: `Discover trending videos, hashtags and creators | ${site}`,
      desc: `See what is trending on ${site}: popular hashtags, creators to follow and the most liked short videos.`,
      ssr: `<h1>Discover</h1><p>${tags.map((t) => `<a href="/tag/${encodeURIComponent(t.tag)}">#${esc(t.tag)}</a>`).join(' ')}</p>${videoLinks(rows)}`,
    };
  }
  if (TEXT_PAGES[path]) {
    const [title, desc] = TEXT_PAGES[path];
    return { ...base, title: `${title} | ${site}`, desc, ssr: `<h1>${esc(title)}</h1><p>${esc(desc)}</p>` };
  }
  if (PRIVATE_PATHS.test(path)) return { ...base, noindex: true, title: site, desc: '' };
  return { ...base, status: 404, noindex: true, title: `Page not found | ${site}`, desc: 'This page does not exist.', ssr: '<h1>Page not found</h1><p><a href="/">Go to the home feed</a></p>' };
}

export async function renderPage(env, request, url) {
  const site = siteName(env);
  const d = await describe(env, url);
  const image = d.image || `${url.origin}/og.png`;
  const head = [
    `<title>${esc(d.title)}</title>`,
    d.desc && `<meta name="description" content="${esc(d.desc)}">`,
    `<meta name="robots" content="${d.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-video-preview:-1'}">`,
    !d.noindex && `<link rel="canonical" href="${esc(d.canonical)}">`,
    `<meta property="og:site_name" content="${esc(site)}">`,
    `<meta property="og:type" content="${d.type}">`,
    `<meta property="og:title" content="${esc(d.title)}">`,
    d.desc && `<meta property="og:description" content="${esc(d.desc)}">`,
    `<meta property="og:url" content="${esc(d.canonical)}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    d.video && `<meta property="og:video" content="${esc(d.video)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(d.title)}">`,
    d.desc && `<meta name="twitter:description" content="${esc(d.desc)}">`,
    `<meta name="twitter:image" content="${esc(image)}">`,
    env.GOOGLE_SITE_VERIFICATION && `<meta name="google-site-verification" content="${esc(env.GOOGLE_SITE_VERIFICATION)}">`,
    env.BING_SITE_VERIFICATION && `<meta name="msvalidate.01" content="${esc(env.BING_SITE_VERIFICATION)}">`,
    ...d.jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`),
    `<script>window.__BOOT__=${JSON.stringify({ site }).replace(/</g, '\\u003c')}</script>`,
  ].filter(Boolean).join('\n');

  const shell = await env.ASSETS.fetch(new Request(new URL('/', url), { headers: { accept: 'text/html' } }));
  const html = (await shell.text()).replace('<!--SEO-->', () => head).replace('<!--SSR-->', () => d.ssr);
  return new Response(request.method === 'HEAD' ? null : html, {
    status: d.status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' },
  });
}

export function robots(env, url) {
  return new Response(
    `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /upload\nDisallow: /inbox\nDisallow: /settings\nDisallow: /messages/\nDisallow: /following\n\nSitemap: ${url.origin}/sitemap.xml\n`,
    { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}

export async function sitemap(env, url) {
  const o = url.origin;
  const out = [];
  const add = (loc, lastmod, extra = '') => out.push(`<url><loc>${esc(o + loc)}</loc>${lastmod ? `<lastmod>${iso(lastmod).slice(0, 10)}</lastmod>` : ''}${extra}</url>`);
  add('/'); add('/discover'); add('/guidelines'); add('/terms'); add('/privacy');
  if (env.DB) {
    const videos = await all(env, `SELECT v.id, v.caption, v.video_key, v.thumb_key, v.duration, v.created_at, v.views, u.username FROM videos v JOIN users u ON u.id = v.user_id WHERE v.privacy = 'public' ORDER BY v.created_at DESC LIMIT 20000`);
    for (const v of videos) {
      const title = clip(v.caption, 90) || `Video by @${v.username}`;
      const extra = v.thumb_key
        ? `<video:video><video:thumbnail_loc>${esc(`${o}/media/${v.thumb_key}`)}</video:thumbnail_loc><video:title>${esc(title)}</video:title><video:description>${esc(clip(v.caption, 1000) || title)}</video:description><video:content_loc>${esc(`${o}/media/${v.video_key}`)}</video:content_loc><video:duration>${Math.max(1, Math.round(v.duration || 1))}</video:duration><video:publication_date>${iso(v.created_at)}</video:publication_date></video:video>`
        : '';
      add(`/video/${v.id}`, v.created_at, extra);
    }
    const users = await all(env, `SELECT u.username, MAX(v.created_at) AS t FROM users u JOIN videos v ON v.user_id = u.id AND v.privacy = 'public' GROUP BY u.id ORDER BY t DESC LIMIT 10000`);
    for (const u of users) add(`/@${u.username}`, u.t);
    const tags = await all(env, `SELECT t.tag, MAX(v.created_at) AS t FROM video_tags t JOIN videos v ON v.id = t.video_id AND v.privacy = 'public' GROUP BY t.tag ORDER BY COUNT(*) DESC LIMIT 5000`);
    for (const t of tags) add(`/tag/${encodeURIComponent(t.tag)}`, t.t);
  }
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n${out.join('\n')}\n</urlset>\n`,
    { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=900' } });
}

export async function pingIndexNow(env, url, paths) {
  if (!env.INDEXNOW_KEY || url.hostname === 'localhost' || url.hostname === '127.0.0.1') return;
  try {
    await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: url.host, key: env.INDEXNOW_KEY, keyLocation: `${url.origin}/${env.INDEXNOW_KEY}.txt`, urlList: paths.map((p) => url.origin + p) }),
    });
  } catch { /* best effort */ }
}
