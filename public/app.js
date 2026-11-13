/* Clipleey web app. Plain JavaScript, no build step. */
const SITE = (window.__BOOT__ && window.__BOOT__.site) || 'Clipleey';
const root = document.getElementById('app');

/* ---------- tiny helpers ---------- */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid);
  return el;
}
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'content-type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Try again.'), { status: res.status });
  return data;
}
const count = (n) => {
  n = Number(n) || 0;
  if (n < 1000) return String(n);
  if (n < 1e6) return (n / 1e3).toFixed(n < 1e4 ? 1 : 0).replace(/\.0$/, '') + 'K';
  return (n / 1e6).toFixed(n < 1e7 ? 1 : 0).replace(/\.0$/, '') + 'M';
};
const ago = (t) => {
  const s = Math.max(1, Math.floor(Date.now() / 1000 - t));
  if (s < 60) return 'now';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  if (s < 604800) return Math.floor(s / 86400) + 'd';
  return new Date(t * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: s > 31536000 ? 'numeric' : undefined });
};
const ICONS = {
  home: '<path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4.500v-6h-5v6H5a1 1 0 0 1-1-1z"/>',
  friends: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.4-3.6 3-5.5 6.5-5.500s6.1 1.9 6.5 5.5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17.5 14c2.3.2 3.7 1.6 4 4"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.500a2.2 2.2 0 0 0 4 0"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20.500c.6-4 3.7-6 8-6s7.4 2 8 6"/>',
  heart: '<path d="M12 20.500S3.5 15.3 3.5 9.200A4.7 4.7 0 0 1 12 6.500a4.7 4.7 0 0 1 8.5 2.700c0 6.1-8.5 11.3-8.5 11.300z"/>',
  chat: '<path d="M20.5 11.500a8.5 8 0 0 1-12.3 7.100L3.5 20l1.3-4.300A8.5 8 0 1 1 20.5 11.500z"/>',
  bookmark: '<path d="M6.5 4h11a1 1 0 0 1 1 1v15.500l-6.5-4.5-6.5 4.500V5a1 1 0 0 1 1-1z"/>',
  share: '<path d="M13 5.5 20.5 12 13 18.500v-4c-5 0-8 1.5-9.5 4.5.3-5.5 3.5-9.3 9.5-9.800z"/>',
  sound: '<path d="M4 9.500v5h3.500l5 4v-13l-5 4z"/><path d="M16 9a4.5 4.5 0 0 1 0 6M18.5 6.500a8 8 0 0 1 0 11"/>',
  muted: '<path d="M4 9.500v5h3.500l5 4v-13l-5 4z"/><path d="m16.5 9.5 5 5m0-5-5 5"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  play: '<path d="M8 5.500v13l11-6.500z"/>',
  send: '<path d="M4 12 20.5 4 15 20.500l-3-6.500z"/><path d="m12 14 4-5"/>',
  back: '<path d="M14.5 5 7.5 12l7 7"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.500V8a4 4 0 0 1 8 0v2.5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.500M12 18.500V21M3 12h2.500M18.5 12H21M5.6 5.600l1.8 1.800M16.6 16.600l1.8 1.800M5.6 18.400l1.8-1.800M16.6 7.400l1.8-1.8"/>',
  camera: '<rect x="3" y="7" width="13" height="11" rx="2"/><path d="m16 11 5-3v9l-5-3z"/>',
};
const FILLED = new Set(['play', 'heart-on', 'bookmark-on']);
function icon(name, cls = '') {
  const base = name.replace('-on', '');
  const fill = FILLED.has(name) ? 'currentColor' : 'none';
  return h('span', { class: 'ic ' + cls, 'aria-hidden': 'true', html: `<svg viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[base]}</svg>` });
}
function avatar(u, size = 40) {
  const el = h('span', { class: 'avatar', style: `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px` });
  if (u.avatar) el.append(h('img', { src: u.avatar, alt: '', loading: 'lazy' }));
  else {
    let hash = 0;
    for (const c of u.username || '?') hash = (hash * 31 + c.charCodeAt(0)) % 360;
    el.style.background = `hsl(${hash} 55% 42%)`;
    el.textContent = (u.display_name || u.username || '?').trim()[0].toUpperCase();
  }
  return el;
}
function rich(text) {
  const out = [];
  let last = 0;
  for (const m of String(text || '').matchAll(/(^|\s)([#@])([\p{L}\p{N}_.]{1,50})/gu)) {
    const start = m.index + m[1].length;
    out.push(text.slice(last, start));
    const word = m[2] === '#' ? m[3].split('.')[0] : m[3].replace(/\.+$/, '');
    if (!word) continue;
    out.push(h('a', { href: m[2] === '#' ? '/tag/' + encodeURIComponent(word.toLowerCase()) : '/@' + word.toLowerCase(), class: 'tag' }, m[2] + word));
    last = start + 1 + word.length;
  }
  out.push(String(text || '').slice(last));
  return out;
}
function toast(msg) {
  document.querySelector('.toast')?.remove();
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}
const fill = (el, ...kids) => el.append(...kids.flat(Infinity).filter((k) => k != null && k !== false));
const fail = (e) => toast(e.message || 'Something went wrong. Try again.');

/* ---------- state ---------- */
let me = null;
let unread = { activity: 0, messages: 0 };
let muted = store.get('muted', true);
let cleanup = [];
const onLeave = (fn) => cleanup.push(fn);

/* ---------- sheets (dialogs) ---------- */
function sheet(title, content, opts = {}) {
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); opts.onClose?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const wrap = h('div', { class: 'sheet-wrap ' + (opts.side ? 'side' : ''), onclick: (e) => { if (e.target === wrap) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-label': title },
      h('header', { class: 'sheet-head' }, h('h2', {}, title),
        h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, icon('x'))),
      h('div', { class: 'sheet-body' }, content)));
  document.addEventListener('keydown', onKey);
  document.body.append(wrap);
  return close;
}
function menu(title, items) {
  let close;
  const list = h('div', { class: 'menu' }, items.filter(Boolean).map((it) =>
    h('button', { class: 'menu-item' + (it.danger ? ' danger' : ''), onclick: () => { close(); it.run(); } }, it.label)));
  close = sheet(title, list);
}
function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint && h('span', { class: 'field-hint' }, hint));
}

/* ---------- auth ---------- */
function needAuth() {
  if (me) return true;
  authSheet('login');
  return false;
}
function authSheet(mode) {
  let close;
  const err = h('p', { class: 'form-error', role: 'alert' });
  const build = () => {
    const signup = mode === 'signup';
    const username = h('input', { name: 'username', autocomplete: 'username', required: true, placeholder: signup ? 'yourname' : 'Username or email', autocapitalize: 'none' });
    const email = h('input', { name: 'email', type: 'email', autocomplete: 'email', required: true, placeholder: 'you@example.com' });
    const password = h('input', { name: 'password', type: 'password', autocomplete: signup ? 'new-password' : 'current-password', required: true, minlength: signup ? 8 : null });
    const age = h('input', { type: 'checkbox', required: true });
    const submit = h('button', { class: 'btn primary wide', type: 'submit' }, signup ? 'Create account' : 'Log in');
    return h('form', {
      class: 'form',
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        submit.disabled = true;
        try {
          const r = signup
            ? await api('/auth/signup', { method: 'POST', body: { username: username.value, email: email.value, password: password.value, age_ok: age.checked } })
            : await api('/auth/login', { method: 'POST', body: { login: username.value, password: password.value } });
          me = r.user;
          close();
          toast(signup ? `Welcome to ${SITE}, @${me.username}` : `Logged in as @${me.username}`);
          boot(true);
        } catch (ex) { err.textContent = ex.message; submit.disabled = false; }
      },
    },
    field(signup ? 'Username' : 'Username or email', username, signup && 'Letters, numbers, underscores and dots.'),
    signup && field('Email', email),
    field('Password', password, signup && 'At least 8 characters.'),
    signup && h('label', { class: 'check' }, age, h('span', {}, 'I am 13 or older and agree to the ', h('a', { href: '/terms', target: '_blank' }, 'terms'), ' and ', h('a', { href: '/guidelines', target: '_blank' }, 'community guidelines'), '.')),
    err, submit,
    h('p', { class: 'form-switch' }, signup ? 'Already have an account? ' : 'New here? ',
      h('button', { type: 'button', class: 'link', onclick: () => { close(); authSheet(signup ? 'login' : 'signup'); } }, signup ? 'Log in' : 'Create an account')));
  };
  close = sheet(mode === 'signup' ? `Join ${SITE}` : `Log in to ${SITE}`, build());
}

/* ---------- shell ---------- */
const view = h('main', { id: 'view' });
const nav = h('nav', { class: 'nav', 'aria-label': 'Main' });
function drawNav() {
  const path = location.pathname;
  const badge = unread.activity + unread.messages;
  const item = (href, ic, label, extra) => h('a', { href, class: 'nav-item' + (extra?.cls || '') + ((extra?.match || ((p) => p === href))(path) ? ' active' : ''), 'aria-label': label },
    icon(ic), h('span', { class: 'nav-label' }, label), extra?.badge ? h('span', { class: 'badge' }, extra.badge > 99 ? '99+' : extra.badge) : null);
  nav.replaceChildren(
    h('a', { href: '/', class: 'logo', 'aria-label': SITE + ' home' }, h('img', { src: '/favicon.svg', alt: '', width: 30, height: 30 }), h('span', {}, SITE.toLowerCase())),
    item('/', 'home', 'For you'),
    item('/following', 'friends', 'Following'),
    item('/discover', 'compass', 'Discover', { match: (p) => p === '/discover' || p.startsWith('/tag/') }),
    item('/upload', 'plus', 'Post', { cls: ' post' }),
    item('/inbox', 'bell', 'Inbox', { badge, match: (p) => p === '/inbox' || p.startsWith('/messages/') }),
    me ? h('a', { href: '/@' + me.username, class: 'nav-item' + (path === '/@' + me.username ? ' active' : ''), 'aria-label': 'Profile' }, avatar(me, 26), h('span', { class: 'nav-label' }, 'Profile'))
       : h('button', { class: 'nav-item', onclick: () => authSheet('login'), 'aria-label': 'Log in' }, icon('user'), h('span', { class: 'nav-label' }, 'Log in')),
    h('div', { class: 'nav-foot' },
      !me && h('button', { class: 'btn primary wide', onclick: () => authSheet('signup') }, 'Create account'),
      h('p', {}, h('a', { href: '/guidelines' }, 'Guidelines'), h('a', { href: '/terms' }, 'Terms'), h('a', { href: '/privacy' }, 'Privacy'))));
}

/* ---------- video actions ---------- */
function followButton(user, cls = 'btn small') {
  if (me && me.username === user.username) return null;
  const btn = h('button', { class: cls });
  const draw = () => { btn.textContent = user.following ? 'Following' : 'Follow'; btn.classList.toggle('primary', !user.following); };
  btn.onclick = async (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!needAuth()) return;
    user.following = !user.following; draw();
    try { await api(`/users/${user.username}/follow`, { method: 'POST', body: { on: user.following } }); }
    catch (ex) { user.following = !user.following; draw(); fail(ex); }
  };
  draw();
  return btn;
}
async function shareVideo(v) {
  const url = `${location.origin}/video/${v.id}`;
  const title = v.caption || `Video by @${v.author.username}`;
  const counted = () => api(`/videos/${v.id}/share`, { method: 'POST' }).catch(() => {});
  const link = (label, href) => h('a', { class: 'menu-item', href, target: '_blank', rel: 'noopener', onclick: counted }, label);
  const enc = encodeURIComponent;
  let close;
  close = sheet('Share this video', h('div', { class: 'menu' },
    h('button', { class: 'menu-item', onclick: async () => {
      try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { prompt('Copy this link', url); }
      counted(); close();
    } }, 'Copy link'),
    navigator.share && h('button', { class: 'menu-item', onclick: () => { navigator.share({ title, url }).then(counted).catch(() => {}); close(); } }, 'Share with another app'),
    link('WhatsApp', `https://wa.me/?text=${enc(title + ' ' + url)}`),
    link('X', `https://x.com/intent/post?text=${enc(title)}&url=${enc(url)}`),
    link('Facebook', `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`),
    link('Telegram', `https://t.me/share/url?url=${enc(url)}&text=${enc(title)}`),
    link('Email', `mailto:?subject=${enc(title)}&body=${enc(url)}`)));
}
function videoMenu(v, onRemoved) {
  const mine = me && me.id === v.author.id;
  menu('Video options', [
    mine && { label: 'Edit caption and privacy', run: () => editVideo(v) },
    (mine || me?.is_admin) && { label: 'Delete video', danger: true, run: async () => {
      if (!confirm('Delete this video? This cannot be undone.')) return;
      try { await api(`/videos/${v.id}`, { method: 'DELETE' }); toast('Video deleted'); onRemoved?.(); } catch (e) { fail(e); }
    } },
    !mine && { label: 'Report video', run: () => {
      if (!needAuth()) return;
      menu('Why are you reporting this?', ['Nudity or sexual content', 'Violence or dangerous acts', 'Harassment or hate', 'Spam or scam', 'It uses my content without permission', 'Something else'].map((reason) => ({
        label: reason, run: async () => { try { await api(`/videos/${v.id}/report`, { method: 'POST', body: { reason } }); toast('Report sent. Thank you.'); } catch (e) { fail(e); } },
      })));
    } },
    !mine && { label: `Block @${v.author.username}`, danger: true, run: async () => {
      if (!needAuth()) return;
      try { await api(`/users/${v.author.username}/block`, { method: 'POST', body: { on: true } }); toast(`Blocked @${v.author.username}`); onRemoved?.(); } catch (e) { fail(e); }
    } },
  ]);
}
function editVideo(v) {
  let close;
  const caption = h('textarea', { rows: 4, maxlength: 2200 }, v.caption);
  const privacy = h('select', {}, h('option', { value: 'public' }, 'Everyone'), h('option', { value: 'private' }, 'Only me'));
  privacy.value = v.privacy;
  const allow = h('input', { type: 'checkbox' });
  allow.checked = v.allow_comments;
  close = sheet('Edit video', h('form', { class: 'form', onsubmit: async (e) => {
    e.preventDefault();
    try {
      const r = await api(`/videos/${v.id}`, { method: 'PATCH', body: { caption: caption.value, privacy: privacy.value, allow_comments: allow.checked } });
      Object.assign(v, r.video); close(); toast('Saved'); go(location.pathname, true);
    } catch (ex) { fail(ex); }
  } }, field('Caption', caption), field('Who can watch', privacy), h('label', { class: 'check' }, allow, h('span', {}, 'Allow comments')),
  h('button', { class: 'btn primary wide' }, 'Save changes')));
}

/* ---------- comments ---------- */
function openComments(v, onCount) {
  const list = h('div', { class: 'comments' }, h('p', { class: 'muted pad' }, 'Loading comments…'));
  let replyTo = null;
  const input = h('input', { placeholder: v.allow_comments ? 'Add a comment' : 'Comments are turned off', maxlength: 500, disabled: !v.allow_comments, 'aria-label': 'Comment' });
  const replying = h('div', { class: 'replying', hidden: true });
  const setReply = (c) => {
    replyTo = c;
    replying.hidden = !c;
    replying.replaceChildren(c ? `Replying to @${c.author.username} ` : '', c ? h('button', { class: 'link', type: 'button', onclick: () => setReply(null) }, 'Cancel') : '');
    if (c) input.focus();
  };
  const bump = (d) => {
    v.comments = Math.max(0, v.comments + d); onCount?.(v.comments);
    const title = document.querySelector('.sheet-wrap.side h2');
    if (title) title.textContent = `${count(v.comments)} comments`;
  };
  const row = (c, parent) => {
    const likeBtn = h('button', { class: 'c-like' + (c.liked ? ' on' : ''), 'aria-label': 'Like comment' });
    const drawLike = () => { likeBtn.replaceChildren(icon(c.liked ? 'heart-on' : 'heart'), c.likes ? count(c.likes) : ''); likeBtn.classList.toggle('on', c.liked); };
    likeBtn.onclick = async () => {
      if (!needAuth()) return;
      c.liked = !c.liked; c.likes += c.liked ? 1 : -1; drawLike();
      try { await api(`/comments/${c.id}/like`, { method: 'POST', body: { on: c.liked } }); } catch (e) { fail(e); }
    };
    drawLike();
    const el = h('div', { class: 'comment' + (parent ? ' reply' : '') },
      h('a', { href: '/@' + c.author.username }, avatar(c.author, parent ? 26 : 34)),
      h('div', { class: 'c-main' },
        h('a', { href: '/@' + c.author.username, class: 'c-name' }, c.author.username, c.author.id === v.author.id && h('span', { class: 'chip' }, 'Creator')),
        h('p', {}, rich(c.body)),
        h('div', { class: 'c-meta' }, h('span', {}, ago(c.created_at)),
          v.allow_comments && h('button', { class: 'link', onclick: () => { if (needAuth()) setReply(c); } }, 'Reply'),
          me && (me.id === c.author.id || me.id === v.author.id || me.is_admin) && h('button', { class: 'link', onclick: async () => {
            if (!confirm('Delete this comment?')) return;
            try { const r = await api(`/comments/${c.id}`, { method: 'DELETE' }); bump(-r.removed); (parent ? el : el.parentElement).remove(); } catch (e) { fail(e); }
          } }, 'Delete'))),
      likeBtn);
    return el;
  };
  const thread = (c) => h('div', { class: 'thread', 'data-id': c.id }, row(c), c.replies.map((r) => row(r, c)));
  api(`/videos/${v.id}/comments`).then((r) => {
    list.replaceChildren(...(r.comments.length ? r.comments.map(thread) : [h('p', { class: 'muted pad' }, v.allow_comments ? 'No comments yet. Say something nice.' : 'Comments are turned off for this video.')]));
  }).catch(fail);
  const form = h('form', { class: 'comment-form', onsubmit: async (e) => {
    e.preventDefault();
    if (!needAuth() || !input.value.trim()) return;
    try {
      const r = await api(`/videos/${v.id}/comments`, { method: 'POST', body: { body: input.value, parent_id: replyTo?.id } });
      list.querySelector('.muted.pad')?.remove();
      const c = r.comment;
      if (c.parent_id) list.querySelector(`.thread[data-id="${c.parent_id}"]`)?.append(row(c, {}));
      else list.prepend(thread(c));
      input.value = ''; setReply(null); bump(1);
    } catch (ex) { fail(ex); }
  } }, replying, h('div', { class: 'comment-row' }, input, h('button', { class: 'icon-btn accent', 'aria-label': 'Post comment', disabled: !v.allow_comments }, icon('send'))));
  sheet(`${count(v.comments)} comments`, [list, form], { side: true });
}

/* ---------- the feed ---------- */
function feed(load, emptyState) {
  const el = h('div', { class: 'feed', tabindex: '0' });
  const seen = new Set();
  let offset = 0, done = false, loading = false, current = null, since = 0;

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting && e.intersectionRatio >= 0.6) activate(e.target);
      else if (current === e.target && e.intersectionRatio < 0.6) deactivate(e.target);
    }
  }, { root: el, threshold: [0, 0.6] });

  function activate(slide) {
    if (current && current !== slide) deactivate(current);
    current = slide;
    const video = slide.querySelector('video');
    if (!video.src) video.src = video.dataset.src;
    video.muted = muted;
    slide.classList.remove('paused');
    video.play().catch(() => { video.muted = true; video.play().catch(() => slide.classList.add('paused')); });
    clearTimeout(slide._viewTimer);
    if (!slide._viewed) slide._viewTimer = setTimeout(() => { slide._viewed = true; api(`/videos/${slide.dataset.id}/view`, { method: 'POST' }).catch(() => {}); }, 2000);
    const next = slide.nextElementSibling?.querySelector?.('video');
    if (next && !next.src) { next.preload = 'metadata'; next.src = next.dataset.src; }
    const slides = [...el.querySelectorAll('.slide')];
    if (slides.indexOf(slide) >= slides.length - 3) more();
  }
  function deactivate(slide) {
    slide.querySelector('video').pause();
    clearTimeout(slide._viewTimer);
    if (current === slide) current = null;
  }
  function slideFor(v) {
    const video = h('video', { playsinline: true, loop: true, preload: 'none', poster: v.poster, 'data-src': v.src, 'aria-label': v.caption || 'Video' });
    video.muted = true;
    const bar = h('div', { class: 'progress' }, h('i'));
    video.addEventListener('timeupdate', () => { if (video.duration) bar.firstChild.style.width = (video.currentTime / video.duration) * 100 + '%'; });
    video.addEventListener('loadedmetadata', () => video.classList.toggle('wide', video.videoWidth > video.videoHeight));
    bar.onclick = (e) => { const r = bar.getBoundingClientRect(); if (video.duration) video.currentTime = ((e.clientX - r.left) / r.width) * video.duration; };

    const likeBtn = h('button', { class: 'act' });
    const saveBtn = h('button', { class: 'act' });
    const commentCount = h('span', {}, count(v.comments));
    const drawLike = () => { likeBtn.replaceChildren(icon(v.liked ? 'heart-on' : 'heart'), h('span', {}, count(v.likes))); likeBtn.classList.toggle('liked', v.liked); likeBtn.setAttribute('aria-label', v.liked ? 'Unlike' : 'Like'); };
    const drawSave = () => { saveBtn.replaceChildren(icon(v.saved ? 'bookmark-on' : 'bookmark'), h('span', {}, count(v.saves))); saveBtn.classList.toggle('saved', v.saved); saveBtn.setAttribute('aria-label', v.saved ? 'Remove from saved' : 'Save'); };
    const setLike = async (on) => {
      if (!needAuth() || v.liked === on) return;
      v.liked = on; v.likes += on ? 1 : -1; drawLike();
      try { const r = await api(`/videos/${v.id}/like`, { method: 'POST', body: { on } }); v.likes = r.count; drawLike(); }
      catch (e) { v.liked = !on; v.likes += on ? -1 : 1; drawLike(); fail(e); }
    };
    likeBtn.onclick = () => setLike(!v.liked);
    saveBtn.onclick = async () => {
      if (!needAuth()) return;
      v.saved = !v.saved; v.saves += v.saved ? 1 : -1; drawSave();
      try { const r = await api(`/videos/${v.id}/save`, { method: 'POST', body: { on: v.saved } }); v.saves = r.count; drawSave(); if (v.saved) toast('Saved to your profile'); }
      catch (e) { v.saved = !v.saved; drawSave(); fail(e); }
    };
    drawLike(); drawSave();

    const muteBtn = h('button', { class: 'act mute', 'aria-label': 'Sound on or off', onclick: () => { muted = !muted; store.set('muted', muted); syncMute(); } });
    const follow = followButton(v.author, 'follow-dot');
    const stage = h('div', { class: 'stage' }, video,
      h('div', { class: 'big-play' }, icon('play')),
      h('div', { class: 'meta' },
        h('a', { href: '/@' + v.author.username, class: 'author' }, '@' + v.author.username, v.privacy === 'private' && h('span', { class: 'chip' }, icon('lock'), 'Only you')),
        v.caption && h('p', { class: 'caption' }, rich(v.caption)),
        h('span', { class: 'when' }, `${count(v.views)} views`, h('i', {}), ago(v.created_at))),
      bar);
    let lastTap = 0, tapTimer;
    stage.addEventListener('click', (e) => {
      if (e.target.closest('a, button, .progress')) return;
      const t = Date.now();
      if (t - lastTap < 280) {
        clearTimeout(tapTimer); lastTap = 0;
        setLike(true);
        const r = stage.getBoundingClientRect();
        const burst = h('span', { class: 'burst', style: `left:${e.clientX - r.left}px;top:${e.clientY - r.top}px` }, icon('heart-on'));
        stage.append(burst); setTimeout(() => burst.remove(), 700);
      } else {
        lastTap = t;
        tapTimer = setTimeout(() => {
          if (video.paused) { video.play().catch(() => {}); slide.classList.remove('paused'); } else { video.pause(); slide.classList.add('paused'); }
        }, 280);
      }
    });
    const rail = h('div', { class: 'rail' },
      h('div', { class: 'rail-avatar' }, h('a', { href: '/@' + v.author.username, 'aria-label': v.author.display_name }, avatar(v.author, 46)), follow),
      likeBtn,
      h('button', { class: 'act', 'aria-label': 'Comments', onclick: () => openComments(v, (n) => { commentCount.textContent = count(n); }) }, icon('chat'), commentCount),
      saveBtn,
      h('button', { class: 'act', 'aria-label': 'Share', onclick: () => shareVideo(v) }, icon('share'), h('span', {}, count(v.shares))),
      muteBtn,
      h('button', { class: 'act', 'aria-label': 'More options', onclick: () => videoMenu(v, () => { io.unobserve(slide); slide.remove(); }) }, icon('more')));
    const slide = h('section', { class: 'slide', 'data-id': v.id }, h('div', { class: 'frame' }, stage, rail));
    return slide;
  }
  function syncMute() {
    for (const b of el.querySelectorAll('.mute')) b.replaceChildren(icon(muted ? 'muted' : 'sound'));
    const video = current?.querySelector('video');
    if (video) video.muted = muted;
  }
  async function more() {
    if (loading || done) return;
    loading = true;
    try {
      const r = await load(offset, since);
      since = r.since || since;
      offset += r.videos.length;
      done = r.done || !r.videos.length;
      for (const v of r.videos) {
        if (seen.has(v.id)) continue;
        seen.add(v.id);
        const s = slideFor(v);
        el.append(s); io.observe(s);
      }
      syncMute();
      if (!seen.size) el.append(h('div', { class: 'empty' }, emptyState()));
    } catch (e) { fail(e); }
    loading = false;
  }
  const step = (dir) => {
    const slides = [...el.querySelectorAll('.slide')];
    const target = slides[Math.max(0, Math.min(slides.length - 1, slides.indexOf(current) + dir))];
    target?.scrollIntoView({ behavior: 'smooth' });
  };
  const onKey = (e) => {
    if (e.target.closest('input, textarea, select') || document.querySelector('.sheet-wrap')) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
    else if (e.key === 'm') { muted = !muted; store.set('muted', muted); syncMute(); }
    else if (e.key === 'l') current?.querySelector('.act')?.click();
    else if (e.key === ' ') { e.preventDefault(); current?.querySelector('video')?.[current.querySelector('video').paused ? 'play' : 'pause'](); }
  };
  document.addEventListener('keydown', onKey);
  onLeave(() => { document.removeEventListener('keydown', onKey); io.disconnect(); for (const vid of el.querySelectorAll('video')) { vid.pause(); vid.removeAttribute('src'); vid.load(); } });
  more();
  return el;
}
function feedTabs(active) {
  return h('div', { class: 'feed-tabs' },
    h('a', { href: '/following', class: active === 'following' ? 'on' : '' }, 'Following'),
    h('a', { href: '/', class: active === 'foryou' ? 'on' : '' }, 'For you'));
}

/* ---------- pages ---------- */
function grid(videos) {
  return videos.map((v) => h('a', { href: '/video/' + v.id, class: 'tile' },
    v.poster ? h('img', { src: v.poster, alt: v.caption || `Video by @${v.author.username}`, loading: 'lazy' }) : h('div', { class: 'tile-blank' }, icon('play')),
    h('span', { class: 'tile-stat' }, icon('play'), count(v.views)),
    v.privacy === 'private' && h('span', { class: 'tile-lock' }, icon('lock'))));
}
function pagedGrid(loader, emptyText) {
  const box = h('div', { class: 'grid' });
  const moreBtn = h('button', { class: 'btn', hidden: true }, 'Show more');
  let offset = 0;
  const load = async () => {
    moreBtn.disabled = true;
    try {
      const r = await loader(offset);
      offset += r.videos.length;
      box.append(...grid(r.videos));
      moreBtn.hidden = r.done;
      if (!offset) box.replaceWith(h('p', { class: 'muted pad center' }, emptyText));
    } catch (e) { fail(e); }
    moreBtn.disabled = false;
  };
  moreBtn.onclick = load;
  load();
  return h('div', {}, box, h('div', { class: 'center pad' }, moreBtn));
}
function userRow(u) {
  return h('a', { href: '/@' + u.username, class: 'user-row' }, avatar(u, 44),
    h('span', { class: 'user-row-text' }, h('strong', {}, u.display_name), h('span', { class: 'muted' }, '@' + u.username, u.followers != null && ` · ${count(u.followers)} followers`)),
    followButton(u));
}
const pageWrap = (...kids) => h('div', { class: 'page' }, kids);

const pages = {
  home() {
    document.title = `${SITE}: watch and share short videos`;
    view.append(feedTabs('foryou'), feed((offset, since) => api(`/feed?offset=${offset}&since=${since}`), () => [
      h('h2', {}, 'No videos yet'), h('p', {}, 'Be the first to post one.'), h('a', { href: '/upload', class: 'btn primary' }, 'Post a video')]));
  },
  following() {
    document.title = `Following | ${SITE}`;
    view.append(feedTabs('following'));
    if (!me) {
      view.append(h('div', { class: 'feed' }, h('div', { class: 'empty' }, h('h2', {}, 'Videos from people you follow'), h('p', {}, 'Log in to see them here.'), h('button', { class: 'btn primary', onclick: () => authSheet('login') }, 'Log in'))));
      return;
    }
    view.append(feed((offset) => api(`/feed?type=following&offset=${offset}`), () => [
      h('h2', {}, 'Nothing here yet'), h('p', {}, 'Follow a few creators and their new videos show up here.'), h('a', { href: '/discover', class: 'btn primary' }, 'Find creators')]));
  },
  video(id) {
    view.append(feed((offset, since) => api(`/feed?first=${encodeURIComponent(id)}&offset=${offset}&since=${since}`), () => [
      h('h2', {}, 'This video is not available'), h('p', {}, 'It is private or was removed.'), h('a', { href: '/', class: 'btn primary' }, 'Watch other videos')]));
    api('/videos/' + id).then((r) => { document.title = `${r.video.caption || 'Video'} | @${r.video.author.username} on ${SITE}`; }).catch(() => {});
  },
  async discover() {
    document.title = `Discover | ${SITE}`;
    const results = h('div', {});
    const q = new URLSearchParams(location.search).get('q') || '';
    const input = h('input', { type: 'search', placeholder: 'Search videos, people and hashtags', value: q, 'aria-label': 'Search', enterkeyhint: 'search' });
    view.append(pageWrap(
      h('form', { class: 'search', role: 'search', onsubmit: (e) => { e.preventDefault(); go(input.value.trim() ? '/discover?q=' + encodeURIComponent(input.value.trim()) : '/discover'); } }, icon('search'), input),
      results));
    try {
      if (q) {
        const r = await api('/search?q=' + encodeURIComponent(q));
        const none = !r.users.length && !r.videos.length && !r.tags.length;
        fill(results, 
          none && h('p', { class: 'muted pad center' }, `Nothing matches "${q}". Check the spelling or try a shorter search.`),
          r.tags.length ? h('div', { class: 'tags' }, r.tags.map((t) => h('a', { href: '/tag/' + encodeURIComponent(t.tag), class: 'tag-pill' }, '#' + t.tag, h('span', {}, count(t.n))))) : null,
          r.users.length ? h('section', {}, h('h2', {}, 'People'), h('div', { class: 'user-list' }, r.users.map(userRow))) : null,
          r.videos.length ? h('section', {}, h('h2', {}, 'Videos'), h('div', { class: 'grid' }, grid(r.videos))) : null);
      } else {
        const r = await api('/discover');
        fill(results, 
          r.tags.length ? h('section', {}, h('h2', {}, 'Trending hashtags'), h('div', { class: 'tags' }, r.tags.map((t) => h('a', { href: '/tag/' + encodeURIComponent(t.tag), class: 'tag-pill' }, '#' + t.tag, h('span', {}, count(t.n)))))) : null,
          r.creators.length ? h('section', {}, h('h2', {}, 'Creators to follow'), h('div', { class: 'user-list' }, r.creators.map(userRow))) : null,
          h('section', {}, h('h2', {}, 'Popular videos'), r.videos.length ? h('div', { class: 'grid' }, grid(r.videos)) : h('p', { class: 'muted' }, 'No videos yet. Post the first one.')));
      }
    } catch (e) { fail(e); }
  },
  async tag(tag) {
    document.title = `#${tag} | ${SITE}`;
    const head = h('header', { class: 'tag-head' }, h('h1', {}, '#' + tag), h('p', { class: 'muted' }, ''));
    view.append(pageWrap(head, pagedGrid(async (offset) => {
      const r = await api(`/tags/${encodeURIComponent(tag)}?offset=${offset}`);
      head.lastChild.textContent = `${count(r.count)} ${r.count === 1 ? 'video' : 'videos'}`;
      return r;
    }, 'No videos use this hashtag yet.')));
  },
  async profile(username) {
    let u;
    try { u = (await api('/users/' + username)).user; }
    catch (e) { view.append(pageWrap(h('div', { class: 'empty' }, h('h2', {}, 'This account does not exist'), h('a', { href: '/', class: 'btn primary' }, 'Go to the home feed')))); return; }
    document.title = `${u.display_name} (@${u.username}) | ${SITE}`;
    const followers = h('strong', {}, count(u.followers));
    const follow = followButton(u, 'btn');
    follow?.addEventListener('click', () => setTimeout(() => api('/users/' + u.username).then((r) => { followers.textContent = count(r.user.followers); }).catch(() => {}), 400));
    const people = (kind) => {
      const list = h('div', { class: 'user-list' }, h('p', { class: 'muted pad' }, 'Loading…'));
      sheet(kind === 'followers' ? 'Followers' : 'Following', list);
      api(`/users/${u.username}/${kind}`).then((r) => list.replaceChildren(...(r.users.length ? r.users.map(userRow) : [h('p', { class: 'muted pad' }, kind === 'followers' ? 'No followers yet.' : 'Not following anyone yet.')]))).catch(fail);
    };
    const body = h('div', {});
    const tabs = h('div', { class: 'tabs' });
    const show = (tab) => {
      [...tabs.children].forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
      body.replaceChildren(pagedGrid((offset) => api(`/users/${u.username}/videos?tab=${tab}&offset=${offset}`),
        tab === 'videos' ? (u.is_me ? 'Your videos show up here after you post.' : 'No videos yet.') : tab === 'liked' ? 'Videos you like show up here.' : 'Videos you save show up here.'));
    };
    const tabBtn = (tab, label) => h('button', { 'data-tab': tab, onclick: () => show(tab) }, label);
    fill(tabs, tabBtn('videos', 'Videos'), u.is_me && tabBtn('liked', 'Liked'), u.is_me && tabBtn('saved', 'Saved'));
    view.append(pageWrap(
      h('header', { class: 'profile' }, avatar(u, 104),
        h('div', { class: 'profile-main' },
          h('h1', {}, u.display_name), h('p', { class: 'muted' }, '@' + u.username, u.follows_me && h('span', { class: 'chip' }, 'Follows you')),
          h('div', { class: 'stats' },
            h('button', { onclick: () => people('following') }, h('strong', {}, count(u.following_count)), ' Following'),
            h('button', { onclick: () => people('followers') }, followers, ' Followers'),
            h('span', {}, h('strong', {}, count(u.likes)), ' Likes')),
          u.bio && h('p', { class: 'bio' }, rich(u.bio)),
          h('div', { class: 'profile-actions' },
            u.is_me ? [h('a', { href: '/settings', class: 'btn' }, 'Edit profile'), h('a', { href: '/upload', class: 'btn primary' }, 'Post a video')]
              : [follow, h('a', { href: '/messages/' + u.username, class: 'btn', onclick: (e) => { if (!needAuth()) { e.preventDefault(); e.stopPropagation(); } } }, 'Message'),
                h('button', { class: 'icon-btn', 'aria-label': 'More options', onclick: () => menu('@' + u.username, [
                  { label: 'Copy profile link', run: () => navigator.clipboard.writeText(location.href).then(() => toast('Link copied')).catch(() => {}) },
                  { label: u.blocked ? 'Unblock' : 'Block', danger: !u.blocked, run: async () => {
                    if (!needAuth()) return;
                    try { await api(`/users/${u.username}/block`, { method: 'POST', body: { on: !u.blocked } }); toast(u.blocked ? 'Unblocked' : 'Blocked'); go(location.pathname, true); } catch (e) { fail(e); }
                  } }]) }, icon('more'))]))),
      tabs, body));
    show('videos');
  },
  upload() {
    document.title = `Post a video | ${SITE}`;
    if (!me) {
      view.append(pageWrap(h('div', { class: 'empty' }, h('h2', {}, 'Post your first video'), h('p', {}, 'Log in or create an account to share videos.'), h('button', { class: 'btn primary', onclick: () => authSheet('signup') }, 'Create account'))));
      return;
    }
    let blob = null, thumb = null, duration = 0, stream = null, recorder = null;
    const stopCamera = () => { stream?.getTracks().forEach((t) => t.stop()); stream = null; };
    onLeave(stopCamera);
    const preview = h('video', { playsinline: true, controls: true, class: 'up-video' });
    const drop = h('div', { class: 'drop' });
    const fileInput = h('input', { type: 'file', accept: 'video/mp4,video/webm,video/quicktime,video/*', hidden: true, onchange: () => fileInput.files[0] && setVideo(fileInput.files[0]) });
    const caption = h('textarea', { rows: 4, maxlength: 2200, placeholder: 'Describe your video. Add #hashtags and @mentions.' });
    const privacy = h('select', {}, h('option', { value: 'public' }, 'Everyone'), h('option', { value: 'private' }, 'Only me'));
    const allow = h('input', { type: 'checkbox', checked: true });
    const status = h('p', { class: 'muted', role: 'status' });
    const post = h('button', { class: 'btn primary wide', disabled: true }, 'Post');

    function makeThumb() {
      return new Promise((resolve) => {
        const done = () => {
          try {
            const scale = Math.min(1, 540 / (preview.videoWidth || 540));
            const c = h('canvas', { width: Math.round(preview.videoWidth * scale), height: Math.round(preview.videoHeight * scale) });
            c.getContext('2d').drawImage(preview, 0, 0, c.width, c.height);
            c.toBlob((b) => resolve(b), 'image/jpeg', 0.82);
          } catch { resolve(null); }
        };
        preview.addEventListener('seeked', done, { once: true });
        setTimeout(() => resolve(null), 4000);
        preview.currentTime = Math.min(0.5, (preview.duration || 1) / 2);
      });
    }
    async function setVideo(file) {
      const type = (file.type || '').split(';')[0];
      if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(type)) return toast('Use an MP4, WebM or MOV video.');
      if (file.size > 95 * 1024 * 1024) return toast('That video is larger than 95 MB. Trim or compress it first.');
      blob = file; thumb = null;
      stopCamera();
      preview.srcObject = null; preview.muted = false; preview.controls = true;
      preview.src = URL.createObjectURL(file);
      drop.replaceChildren(preview, h('button', { class: 'btn small', type: 'button', onclick: chooser }, 'Choose a different video'));
      await new Promise((r) => { preview.addEventListener('loadeddata', r, { once: true }); preview.addEventListener('error', r, { once: true }); });
      duration = Number.isFinite(preview.duration) ? preview.duration : 0;
      thumb = await makeThumb();
      preview.currentTime = 0;
      post.disabled = false;
    }
    async function record() {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('This browser cannot record video. Upload a file instead.');
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } }, audio: true }); }
      catch { return toast('Allow camera and microphone access to record.'); }
      preview.srcObject = stream; preview.muted = true; preview.controls = false; preview.play();
      const chunks = [];
      const mime = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
      const timer = h('span', { class: 'rec-time' }, '0:00');
      const btn = h('button', { class: 'btn primary', type: 'button' }, 'Start recording');
      let tick, started = 0;
      btn.onclick = () => {
        if (!recorder) {
          recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 2500000 } : undefined);
          recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
          recorder.onstop = () => {
            clearInterval(tick);
            const type = (recorder.mimeType || mime || 'video/webm').split(';')[0];
            recorder = null;
            setVideo(new File(chunks, 'recording.' + (type === 'video/mp4' ? 'mp4' : 'webm'), { type }));
          };
          recorder.start(1000); started = Date.now();
          btn.textContent = 'Stop'; btn.classList.add('recording');
          tick = setInterval(() => {
            const s = Math.floor((Date.now() - started) / 1000);
            timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
            if (s >= 180) recorder?.stop();
          }, 500);
        } else recorder.stop();
      };
      drop.replaceChildren(preview, h('div', { class: 'rec-bar' }, btn, timer, h('button', { class: 'btn small', type: 'button', onclick: () => { clearInterval(tick); recorder = null; stopCamera(); chooser(); } }, 'Cancel')));
    }
    function chooser() {
      blob = null; post.disabled = true;
      drop.replaceChildren(h('div', { class: 'drop-inner' },
        h('h2', {}, 'Choose a video to post'), h('p', { class: 'muted' }, 'MP4, WebM or MOV. Up to 95 MB. Vertical videos look best.'),
        h('div', { class: 'drop-actions' },
          h('button', { class: 'btn primary', type: 'button', onclick: () => fileInput.click() }, 'Choose file'),
          h('button', { class: 'btn', type: 'button', onclick: record }, icon('camera'), 'Record with camera'))));
    }
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) setVideo(e.dataTransfer.files[0]); });
    chooser();

    const put = (kind, data, onProgress) => new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', '/api/upload?kind=' + kind);
      xhr.setRequestHeader('content-type', (data.type || '').split(';')[0]);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onload = () => { let r = {}; try { r = JSON.parse(xhr.responseText); } catch { /* not json */ } xhr.status < 300 ? resolve(r) : reject(new Error(r.error || 'The upload failed. Try again.')); };
      xhr.onerror = () => reject(new Error('The upload failed. Check your connection and try again.'));
      xhr.send(data);
    });
    post.onclick = async () => {
      if (!blob) return;
      post.disabled = true;
      try {
        const up = await put('video', blob, (p) => { status.textContent = `Uploading… ${Math.round(p * 100)}%`; });
        const th = thumb ? await put('thumb', thumb).catch(() => null) : null;
        status.textContent = 'Posting…';
        const r = await api('/videos', { method: 'POST', body: { video_key: up.key, thumb_key: th?.key, caption: caption.value, privacy: privacy.value, allow_comments: allow.checked, duration } });
        toast('Posted');
        go('/video/' + r.video.id);
      } catch (e) { status.textContent = ''; post.disabled = false; fail(e); }
    };
    view.append(pageWrap(h('h1', {}, 'Post a video'), h('div', { class: 'upload' }, drop, fileInput,
      h('div', { class: 'form' }, field('Caption', caption), field('Who can watch', privacy),
        h('label', { class: 'check' }, allow, h('span', {}, 'Allow comments')), status, post,
        h('p', { class: 'muted small' }, 'Only post videos you made or have the rights to. See the ', h('a', { href: '/guidelines' }, 'community guidelines'), '.')))));
  },
  async inbox() {
    document.title = `Inbox | ${SITE}`;
    if (!me) {
      view.append(pageWrap(h('div', { class: 'empty' }, h('h2', {}, 'Your inbox'), h('p', {}, 'Log in to see likes, comments, new followers and messages.'), h('button', { class: 'btn primary', onclick: () => authSheet('login') }, 'Log in'))));
      return;
    }
    const body = h('div', {});
    const tabs = h('div', { class: 'tabs' });
    const TEXT = { like: 'liked your video', comment: 'commented:', reply: 'replied to your comment:', mention: 'mentioned you', follow: 'started following you' };
    const show = async (tab) => {
      [...tabs.children].forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
      body.replaceChildren(h('p', { class: 'muted pad' }, 'Loading…'));
      try {
        if (tab === 'activity') {
          const r = await api('/notifications');
          unread.activity = 0; drawNav();
          body.replaceChildren(...(r.notifications.length ? r.notifications.map((n) => h('div', { class: 'note' + (n.seen ? '' : ' new') },
            h('a', { href: '/@' + n.actor.username }, avatar(n.actor, 44)),
            h('a', { class: 'note-text', href: n.video_id ? '/video/' + n.video_id : '/@' + n.actor.username },
              h('strong', {}, n.actor.username), ' ', TEXT[n.type] || '', n.comment ? ' ' + n.comment : '', h('span', { class: 'muted' }, ' ' + ago(n.created_at))),
            n.type === 'follow' ? followButton(n.actor) : n.poster && h('a', { href: '/video/' + n.video_id }, h('img', { class: 'note-thumb', src: n.poster, alt: '' }))))
            : [h('p', { class: 'muted pad center' }, 'Likes, comments and new followers show up here.')]));
        } else {
          const r = await api('/conversations');
          body.replaceChildren(...(r.conversations.length ? r.conversations.map((c) => h('a', { href: '/messages/' + c.user.username, class: 'user-row' }, avatar(c.user, 48),
            h('span', { class: 'user-row-text' }, h('strong', {}, c.user.display_name), h('span', { class: 'muted clip' }, (c.last.mine ? 'You: ' : '') + c.last.body)),
            h('span', { class: 'muted small' }, ago(c.last.created_at)), c.unread ? h('span', { class: 'badge inline' }, c.unread) : null))
            : [h('p', { class: 'muted pad center' }, 'No messages yet. Open a profile and tap Message to start a chat.')]));
        }
      } catch (e) { fail(e); }
    };
    const tabBtn = (tab, label, n) => h('button', { 'data-tab': tab, onclick: () => show(tab) }, label, n ? h('span', { class: 'badge inline' }, n) : null);
    tabs.append(tabBtn('activity', 'Activity', unread.activity), tabBtn('messages', 'Messages', unread.messages));
    view.append(pageWrap(h('h1', {}, 'Inbox'), tabs, body));
    show(new URLSearchParams(location.search).get('tab') === 'messages' ? 'messages' : 'activity');
  },
  async chat(username) {
    if (!me) { go('/inbox'); return; }
    const log = h('div', { class: 'chat-log' });
    const input = h('input', { placeholder: 'Message', maxlength: 1000, 'aria-label': 'Message', autocomplete: 'off' });
    const head = h('header', { class: 'chat-head' }, h('a', { href: '/inbox?tab=messages', class: 'icon-btn', 'aria-label': 'Back to inbox' }, icon('back')));
    let last = 0, alive = true;
    const add = (ms) => {
      for (const m of ms) {
        if (m.id <= last) continue;
        last = m.id;
        log.append(h('div', { class: 'bubble' + (m.mine ? ' mine' : '') }, h('p', {}, m.body), h('time', {}, ago(m.created_at))));
      }
      if (ms.length) log.scrollTop = log.scrollHeight;
    };
    const poll = async () => {
      if (!alive) return;
      try { add((await api(`/messages/${username}?after=${last}`)).messages); } catch { /* retry next tick */ }
    };
    const timer = setInterval(() => { if (!document.hidden) poll(); }, 4000);
    onLeave(() => { alive = false; clearInterval(timer); });
    view.append(h('div', { class: 'page chat' }, head, log, h('form', { class: 'comment-row chat-form', onsubmit: async (e) => {
      e.preventDefault();
      const txt = input.value.trim();
      if (!txt) return;
      input.value = '';
      try { add([(await api('/messages/' + username, { method: 'POST', body: { body: txt } })).message]); } catch (ex) { input.value = txt; fail(ex); }
    } }, input, h('button', { class: 'icon-btn accent', 'aria-label': 'Send' }, icon('send')))));
    try {
      const r = await api('/messages/' + username);
      document.title = `${r.user.display_name} | ${SITE}`;
      head.append(h('a', { href: '/@' + r.user.username, class: 'user-row slim' }, avatar(r.user, 38), h('span', { class: 'user-row-text' }, h('strong', {}, r.user.display_name), h('span', { class: 'muted' }, '@' + r.user.username))));
      if (!r.messages.length) log.append(h('p', { class: 'muted pad center' }, `Say hi to @${r.user.username}.`));
      add(r.messages);
      api('/me').then((m) => { unread = m.unread || unread; drawNav(); }).catch(() => {});
      input.focus();
    } catch (e) { log.append(h('p', { class: 'muted pad center' }, e.message)); }
  },
  async settings() {
    document.title = `Settings | ${SITE}`;
    if (!me) { go('/'); authSheet('login'); return; }
    const name = h('input', { value: me.display_name, maxlength: 40 });
    const username = h('input', { value: me.username, maxlength: 24, autocapitalize: 'none' });
    const bio = h('textarea', { rows: 3, maxlength: 160 }, me.bio);
    let avatarKey;
    const pic = h('div', { class: 'avatar-edit' }, avatar(me, 84));
    const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', hidden: true, onchange: async () => {
      const f = file.files[0];
      if (!f) return;
      try {
        const img = await createImageBitmap(f);
        const s = Math.min(img.width, img.height);
        const c = h('canvas', { width: 320, height: 320 });
        c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 320, 320);
        const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
        const res = await fetch('/api/upload?kind=avatar', { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: b });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        avatarKey = data.key;
        pic.replaceChildren(avatar({ avatar: URL.createObjectURL(b) }, 84));
      } catch (e) { fail(e.message ? e : new Error('That image could not be used.')); }
    } });
    const cur = h('input', { type: 'password', autocomplete: 'current-password' });
    const next = h('input', { type: 'password', autocomplete: 'new-password', minlength: 8 });
    const reports = h('section', { class: 'card', hidden: true });
    view.append(pageWrap(h('h1', {}, 'Settings'),
      h('form', { class: 'form card', onsubmit: async (e) => {
        e.preventDefault();
        try {
          const r = await api('/me', { method: 'PATCH', body: { display_name: name.value, username: username.value, bio: bio.value, ...(avatarKey ? { avatar_key: avatarKey } : {}) } });
          me = r.user; drawNav(); toast('Saved');
        } catch (ex) { fail(ex); }
      } }, h('h2', {}, 'Profile'),
      h('div', { class: 'avatar-row' }, pic, file, h('button', { class: 'btn small', type: 'button', onclick: () => file.click() }, 'Change photo')),
      field('Name', name), field('Username', username), field('Bio', bio, 'Up to 160 characters.'), h('button', { class: 'btn primary' }, 'Save changes')),
      h('form', { class: 'form card', onsubmit: async (e) => {
        e.preventDefault();
        try { await api('/me/password', { method: 'POST', body: { current: cur.value, next: next.value } }); cur.value = next.value = ''; toast('Password changed'); } catch (ex) { fail(ex); }
      } }, h('h2', {}, 'Password'), field('Current password', cur), field('New password', next, 'At least 8 characters.'), h('button', { class: 'btn' }, 'Change password')),
      reports,
      h('section', { class: 'card form' }, h('h2', {}, 'Account'), h('p', { class: 'muted' }, me.email),
        h('button', { class: 'btn', onclick: async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); me = null; unread = { activity: 0, messages: 0 }; toast('Logged out'); go('/'); } }, 'Log out'),
        h('button', { class: 'btn danger', onclick: async () => {
          const password = prompt('Deleting your account removes your videos, comments and messages for good. Enter your password to confirm.');
          if (!password) return;
          try { await api('/me', { method: 'DELETE', body: { password } }); me = null; toast('Account deleted'); go('/'); } catch (e) { fail(e); }
        } }, 'Delete account'))));
    if (me.is_admin) {
      try {
        const r = await api('/admin/reports');
        reports.hidden = false;
        fill(reports, h('h2', {}, 'Reported videos'), r.reports.length ? r.reports.map((rep) => {
          const rowEl = h('div', { class: 'report' },
            h('a', { href: '/video/' + rep.video_id }, rep.poster ? h('img', { class: 'note-thumb', src: rep.poster, alt: '' }) : 'Open video'),
            h('div', { class: 'user-row-text' }, h('strong', {}, rep.reason), h('span', { class: 'muted' }, `@${rep.owner}, reported by @${rep.reporter} ${ago(rep.created_at)}`)),
            h('button', { class: 'btn small', onclick: () => act('dismiss') }, 'Keep'),
            h('button', { class: 'btn small danger', onclick: () => act('remove') }, 'Remove'));
          const act = async (action) => { try { await api('/admin/reports/' + rep.id, { method: 'POST', body: { action } }); rowEl.remove(); } catch (e) { fail(e); } };
          return rowEl;
        }) : h('p', { class: 'muted' }, 'No open reports.'));
      } catch { /* not an admin after all */ }
    }
  },
  text(key) {
    const T = {
      guidelines: ['Community guidelines', [
        ['Be kind', 'No harassment, threats, hate speech or bullying in videos, comments or messages.'],
        ['Keep it safe', 'No nudity or sexual content, graphic violence, dangerous challenges, or anything that puts children at risk.'],
        ['Post your own work', 'Only post videos, music and images you made or have permission to use.'],
        ['No spam or scams', 'No fake engagement, misleading links, or impersonating other people.'],
        ['Report what breaks the rules', 'Use Report on any video. Reported videos are reviewed and removed when they break these guidelines; repeat offenders lose their accounts.']]],
      terms: ['Terms of use', [
        ['Using the site', `You must be 13 or older to use ${SITE}. You are responsible for your account and for what you post.`],
        ['Your content', `You keep ownership of your videos. By posting, you allow ${SITE} to host, show and share them on the service. You can delete your videos or your account at any time.`],
        ['Rules', 'You agree to follow the community guidelines. Content that breaks them may be removed and accounts may be closed.'],
        ['Copyright', 'If your work was posted without permission, report the video and include how to reach you.'],
        ['No warranty', 'The service is provided as is, without guarantees of availability.']]],
      privacy: ['Privacy policy', [
        ['What is collected', 'Your username, email address, password (stored only as a salted hash), profile details, and the videos, comments, likes, follows and messages you create.'],
        ['How it is used', 'To run the service: show your content, personalise your feed, and send you in-app notifications. Your email is never shown publicly.'],
        ['Cookies', 'One cookie keeps you logged in. Your sound preference is stored in your browser.'],
        ['Your choices', 'You can edit your profile, set videos to private, delete videos, or delete your whole account from Settings. Deleting your account removes your data.'],
        ['Hosting', 'The site and its media are hosted on Cloudflare.']]],
    }[key];
    document.title = `${T[0]} | ${SITE}`;
    view.append(pageWrap(h('article', { class: 'prose' }, h('h1', {}, T[0]), T[1].map(([a, b]) => [h('h2', {}, a), h('p', {}, b)]))));
  },
  notFound() {
    document.title = `Page not found | ${SITE}`;
    view.append(pageWrap(h('div', { class: 'empty' }, h('h2', {}, 'Page not found'), h('a', { href: '/', class: 'btn primary' }, 'Go to the home feed'))));
  },
};

/* ---------- router ---------- */
function render() {
  cleanup.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
  cleanup = [];
  document.querySelectorAll('.sheet-wrap').forEach((s) => s.remove());
  view.replaceChildren();
  const p = decodeURIComponent(location.pathname).replace(/\/+$/, '') || '/';
  let m;
  const feedPage = p === '/' || p === '/following' || p.startsWith('/video/');
  document.body.classList.toggle('on-feed', feedPage);
  if (p === '/') pages.home();
  else if (p === '/following') pages.following();
  else if ((m = p.match(/^\/video\/([\w-]+)$/))) pages.video(m[1]);
  else if (p === '/discover') pages.discover();
  else if ((m = p.match(/^\/tag\/(.+)$/))) pages.tag(m[1].toLowerCase());
  else if ((m = p.match(/^\/@([a-z0-9_.]+)$/i))) pages.profile(m[1].toLowerCase());
  else if (p === '/upload') pages.upload();
  else if (p === '/inbox') pages.inbox();
  else if ((m = p.match(/^\/messages\/([a-z0-9_.]+)$/i))) pages.chat(m[1].toLowerCase());
  else if (p === '/settings') pages.settings();
  else if (['/terms', '/privacy', '/guidelines'].includes(p)) pages.text(p.slice(1));
  else pages.notFound();
  drawNav();
  if (!feedPage) view.scrollTop = 0;
}
function go(path, replace) {
  if (replace) history.replaceState(null, '', path); else history.pushState(null, '', path);
  render();
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (!a || e.defaultPrevented || a.target || e.metaKey || e.ctrlKey || e.shiftKey || a.origin !== location.origin) return;
  if (/\.[a-z0-9]{2,5}$/i.test(a.pathname) && !a.pathname.startsWith('/@')) return;
  e.preventDefault();
  if (a.pathname + a.search !== location.pathname + location.search) go(a.pathname + a.search); else render();
});
window.addEventListener('popstate', render);

async function boot(rerender) {
  try {
    const r = await api('/me');
    me = r.user; unread = r.unread || { activity: 0, messages: 0 };
  } catch { /* signed out or offline */ }
  if (!rerender) root.replaceChildren(nav, view);
  render();
}
setInterval(() => {
  if (me && !document.hidden) api('/me').then((r) => { if (r.user) { unread = r.unread; drawNav(); } }).catch(() => {});
}, 45000);
boot();
