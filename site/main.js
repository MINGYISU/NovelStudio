import { zh, dynamic, cn, TOUR } from './i18n.js';

const root = document.documentElement;
root.classList.add('js');

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: choices just won't persist */
  }
  return null;
}

/* ---------- language ---------- */
const TITLES = {
  en: 'NovelStudio — a calm, local-first studio for long-form fiction',
  'zh-CN': 'NovelStudio — 安静、本地优先的长篇小说写作工作室',
};

let lang =
  store('ns-site-lang') || (navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en');
if (lang !== 'en' && lang !== 'zh-CN') lang = 'en';

const i18nNodes = [...document.querySelectorAll('[data-i18n],[data-i18n-html]')];
for (const el of i18nNodes) {
  const attrs = el.dataset.i18nAttr?.split(',');
  if (attrs) el._en = Object.fromEntries(attrs.map((a) => [a, el.getAttribute(a)]));
  else el._en = 'i18nHtml' in el.dataset ? el.innerHTML : el.textContent;
}

const d = () => dynamic[lang];

function applyStatic() {
  for (const el of i18nNodes) {
    const key = el.dataset.i18n ?? el.dataset.i18nHtml;
    const value = lang === 'en' ? undefined : zh[key];
    const attrs = el.dataset.i18nAttr?.split(',');
    if (attrs) {
      for (const a of attrs) el.setAttribute(a, value ?? el._en[a]);
    } else if ('i18nHtml' in el.dataset) {
      el.innerHTML = value ?? el._en;
    } else {
      el.textContent = value ?? el._en;
    }
  }
  root.lang = lang;
  document.title = TITLES[lang];
  for (const b of document.querySelectorAll('[data-lang]')) {
    b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
  }
}

function setLang(next) {
  lang = next;
  store('ns-site-lang', lang);
  numberStyle = lang === 'zh-CN' ? 'cn' : 'en';
  lastMoveNote = '';
  applyStatic();
  renderDemo();
  showTab(activeTab);
  showRescue();
}

for (const b of document.querySelectorAll('[data-lang]')) {
  b.addEventListener('click', () => setLang(b.dataset.lang));
}

/* ---------- theme ---------- */
function setTheme(theme) {
  root.dataset.theme = theme;
  store('ns-site-theme', theme);
  for (const b of document.querySelectorAll('.themes [data-theme-set]')) {
    b.setAttribute('aria-pressed', String(b.dataset.themeSet === theme));
  }
  glyphColor = getComputedStyle(root).getPropertyValue('--accent').trim();
}

for (const b of document.querySelectorAll('[data-theme-set]')) {
  b.addEventListener('click', () => setTheme(b.dataset.themeSet));
}

/* ---------- top bar, reveal ---------- */
const topbar = document.getElementById('topbar');
const onScroll = () => topbar.classList.toggle('scrolled', scrollY > 8);
addEventListener('scroll', onScroll, { passive: true });
onScroll();

const revealEls = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  document.querySelectorAll('.road li').forEach((li, i) => li.style.setProperty('--i', i));
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      }
    },
    { threshold: 0.12 },
  );
  revealEls.forEach((el) => io.observe(el));
} else {
  revealEls.forEach((el) => el.classList.add('in'));
}

/* ---------- hero tilt ---------- */
const tilt = document.getElementById('tilt');
if (tilt && !reducedMotion && matchMedia('(hover: hover)').matches) {
  const stage = tilt.parentElement;
  stage.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    tilt.style.transform = `rotateY(${x * 9}deg) rotateX(${-y * 7}deg)`;
  });
  stage.addEventListener('pointerleave', () => {
    tilt.style.transform = '';
  });
}

/* ---------- drifting glyphs ---------- */
let glyphColor = '#5b4a8a';
const canvas = document.getElementById('glyphs');
const ctx = canvas.getContext('2d');
const GLYPHS = [...'Aa¶❦“”—…章书墨笔story的之伏线'];
let glyphs = [];
let W = 0;
let H = 0;

function sizeCanvas() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth;
  H = innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const count = clamp(Math.round((W * H) / 38000), 14, 40);
  glyphs = Array.from({ length: count }, () => ({
    ch: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
    x: Math.random() * W,
    y: Math.random() * H,
    size: 16 + Math.random() * 34,
    speed: 0.12 + Math.random() * 0.3,
    rot: (Math.random() - 0.5) * 0.7,
    alpha: 0.04 + Math.random() * 0.07,
  }));
}

function drawGlyphs() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = glyphColor;
  for (const g of glyphs) {
    ctx.save();
    ctx.globalAlpha = g.alpha;
    ctx.translate(g.x, g.y);
    ctx.rotate(g.rot);
    ctx.font = `${g.size}px Georgia, 'Songti SC', serif`;
    ctx.fillText(g.ch, 0, 0);
    ctx.restore();
  }
}

function tickGlyphs() {
  if (!document.hidden) {
    for (const g of glyphs) {
      g.y -= g.speed;
      if (g.y < -50) {
        g.y = H + 50;
        g.x = Math.random() * W;
      }
    }
    drawGlyphs();
  }
  requestAnimationFrame(tickGlyphs);
}

sizeCanvas();
addEventListener('resize', () => {
  sizeCanvas();
  if (reducedMotion) drawGlyphs();
});
if (reducedMotion) drawGlyphs();
else requestAnimationFrame(tickGlyphs);

/* ---------- reorder demo ---------- */
const SECTIONS = [
  { id: 'prologue', numbered: false },
  { id: 'c1', numbered: true },
  { id: 'c2', numbered: true },
  { id: 'c3', numbered: true },
  { id: 'c4', numbered: true },
  { id: 'c5', numbered: true },
];
const THREADS = [
  { id: 'moth', marks: { c1: 'setup', c2: 'hint', c3: 'payoff' } },
  { id: 'compass', marks: { prologue: 'setup', c4: 'payoff' } },
];
const SYMBOL = { setup: '●', hint: '◐', payoff: '★' };

const list = document.getElementById('demo-list');
const matrix = document.getElementById('demo-matrix');
const warnings = document.getElementById('demo-warnings');
const movesEl = document.getElementById('demo-moves');
movesEl.setAttribute('aria-live', 'polite');

let order = SECTIONS.map((s) => s.id);
let numberStyle = lang === 'zh-CN' ? 'cn' : 'en';
let moves = 0;
let lastMoveNote = '';
let prevLabels = new Map();

const byId = (id) => SECTIONS.find((s) => s.id === id);

function numbering() {
  let n = 0;
  const out = new Map();
  for (const id of order) {
    if (byId(id).numbered) n += 1;
    out.set(id, byId(id).numbered ? n : null);
  }
  return out;
}

function fullLabel(id, n) {
  const title = d().titles[id];
  if (n === null) return title;
  return numberStyle === 'cn' ? `第${cn(n)}章 ${title}` : `Chapter ${n} — ${title}`;
}

function shortLabel(id, n) {
  if (n === null) return d().titles[id];
  return numberStyle === 'cn' ? `第${cn(n)}章` : `Ch ${n}`;
}

function marksFor(id) {
  return THREADS.filter((t) => t.marks[id])
    .map((t) => SYMBOL[t.marks[id]])
    .join('');
}

function renderList() {
  const nums = numbering();
  const labels = new Map();
  list.replaceChildren();

  order.forEach((id, index) => {
    const label = fullLabel(id, nums.get(id));
    labels.set(id, label);

    const row = document.createElement('li');
    row.className = 'row';
    row.dataset.id = id;
    row.dataset.un = byId(id).numbered ? '0' : '1';

    const grip = document.createElement('button');
    grip.type = 'button';
    grip.className = 'grip';
    grip.textContent = '⋮⋮';
    grip.setAttribute('aria-label', d().handle(d().titles[id]));
    grip.addEventListener('pointerdown', (e) => startDrag(e, row, grip, index));
    grip.addEventListener('keydown', (e) => {
      if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      e.preventDefault();
      const to = clamp(index + (e.key === 'ArrowUp' ? -1 : 1), 0, order.length - 1);
      if (to !== index) commitMove(index, to, true);
    });

    const dot = document.createElement('span');
    dot.className = 'dotc';

    const title = document.createElement('span');
    title.className = 'row-title';
    title.textContent = label;
    if (prevLabels.has(id) && prevLabels.get(id) !== label) title.classList.add('bump');

    const marks = document.createElement('span');
    marks.className = 'marks';
    marks.textContent = marksFor(id);
    marks.setAttribute('aria-hidden', 'true');

    row.append(grip, dot, title, marks);
    list.append(row);
  });

  prevLabels = labels;
  movesEl.textContent = d().moves(moves) + lastMoveNote;
}

function analyse() {
  const found = [];
  const bad = new Set();
  for (const t of THREADS) {
    const at = order.map((id) => t.marks[id]);
    const setupAt = at.indexOf('setup');
    if (setupAt === -1) continue;
    let payoffEarly = false;
    let hintEarly = false;
    at.forEach((kind, i) => {
      if (i < setupAt && kind === 'payoff') payoffEarly = true;
      if (i < setupAt && kind === 'hint') hintEarly = true;
      if (i < setupAt && kind) bad.add(`${t.id}:${order[i]}`);
    });
    if (payoffEarly) found.push(d().payoffBefore(d().thread[t.id]));
    if (hintEarly) found.push(d().hintBefore(d().thread[t.id]));
  }
  return { found, bad };
}

function renderMatrix() {
  const nums = numbering();
  const { found, bad } = analyse();
  matrix.replaceChildren();

  const head = matrix.createTHead().insertRow();
  head.append(document.createElement('th'));
  for (const id of order) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = shortLabel(id, nums.get(id));
    th.title = fullLabel(id, nums.get(id));
    head.append(th);
  }

  const body = matrix.createTBody();
  for (const t of THREADS) {
    const tr = body.insertRow();
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = d().thread[t.id];
    tr.append(th);
    for (const id of order) {
      const td = tr.insertCell();
      const kind = t.marks[id];
      if (kind) {
        td.textContent = SYMBOL[kind];
        td.className = bad.has(`${t.id}:${id}`) ? 'bad' : 'on';
      }
    }
  }

  warnings.replaceChildren();
  const messages = found.length ? found : [d().noWarnings];
  for (const text of messages) {
    const p = document.createElement('p');
    if (found.length) p.className = 'warn';
    p.textContent = text;
    warnings.append(p);
  }
}

function renderDemo() {
  renderList();
  renderMatrix();
  for (const b of document.querySelectorAll('[data-style]')) {
    b.setAttribute('aria-pressed', String(b.dataset.style === numberStyle));
  }
}

function commitMove(from, to, keepFocus = false) {
  const [id] = order.splice(from, 1);
  order.splice(to, 0, id);
  moves += 1;
  lastMoveNote = ` · ${d().moved(d().titles[id], to + 1)}`;
  list.classList.add('no-anim');
  renderDemo();
  requestAnimationFrame(() => requestAnimationFrame(() => list.classList.remove('no-anim')));
  if (keepFocus) list.querySelector(`[data-id="${id}"] .grip`).focus();
}

function startDrag(e, row, grip, from) {
  if (e.button !== 0) return;
  e.preventDefault();
  const rows = [...list.children];
  const pitch = rows.length > 1 ? rows[1].offsetTop - rows[0].offsetTop : row.offsetHeight;
  const startY = e.clientY;
  let target = from;

  row.classList.add('dragging');
  grip.setPointerCapture(e.pointerId);

  const move = (ev) => {
    const dy = clamp(ev.clientY - startY, -from * pitch, (rows.length - 1 - from) * pitch);
    row.style.transform = `translateY(${dy}px)`;
    target = clamp(Math.round(from + dy / pitch), 0, rows.length - 1);
    rows.forEach((r, i) => {
      if (r === row) return;
      let shift = 0;
      if (from < target && i > from && i <= target) shift = -pitch;
      if (from > target && i >= target && i < from) shift = pitch;
      r.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  };

  const end = () => {
    grip.removeEventListener('pointermove', move);
    grip.removeEventListener('pointerup', end);
    grip.removeEventListener('pointercancel', end);
    if (target !== from) {
      commitMove(from, target);
    } else {
      row.classList.remove('dragging');
      rows.forEach((r) => {
        r.style.transform = '';
      });
    }
  };

  grip.addEventListener('pointermove', move);
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
}

for (const b of document.querySelectorAll('[data-style]')) {
  b.addEventListener('click', () => {
    numberStyle = b.dataset.style;
    renderDemo();
  });
}

document.getElementById('demo-reset').addEventListener('click', () => {
  order = SECTIONS.map((s) => s.id);
  moves = 0;
  lastMoveNote = '';
  prevLabels = new Map();
  renderDemo();
});

/* ---------- tour ---------- */
const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];
const panel = document.getElementById('tour-panel');
const tourImg = document.getElementById('tour-img');
let activeTab = 'library';

function showTab(id) {
  activeTab = id;
  const info = d().tour[id];
  for (const t of tabs) {
    const selected = t.dataset.tab === id;
    t.setAttribute('aria-selected', String(selected));
    t.tabIndex = selected ? 0 : -1;
  }
  panel.setAttribute('aria-labelledby', `tab-${id}`);
  document.getElementById('tour-title').textContent = info.h;
  document.getElementById('tour-body').textContent = info.p;
  document.getElementById('tour-ids').textContent = TOUR[id].ids;

  const src = `shots/${TOUR[id].shot}.jpg`;
  tourImg.alt = info.alt;
  tourImg.style.aspectRatio = TOUR[id].crop ?? '';
  if (!tourImg.src.endsWith(src)) {
    tourImg.classList.add('swap');
    const next = new Image();
    next.onload = () => {
      tourImg.src = src;
      tourImg.classList.remove('swap');
    };
    next.onerror = () => tourImg.classList.remove('swap');
    next.src = src;
  }
}

tabs.forEach((t, i) => {
  t.addEventListener('click', () => showTab(t.dataset.tab));
  t.addEventListener('keydown', (e) => {
    const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    let next = null;
    if (e.key in keys) next = (i + keys[e.key] + tabs.length) % tabs.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = tabs.length - 1;
    if (next === null) return;
    e.preventDefault();
    tabs[next].focus();
    showTab(tabs[next].dataset.tab);
  });
});

const lightbox = document.getElementById('lightbox');
document.getElementById('tour-zoom').addEventListener('click', () => {
  document.getElementById('lightbox-img').src = tourImg.src;
  document.getElementById('lightbox-img').alt = tourImg.alt;
  lightbox.showModal();
});
lightbox.addEventListener('click', () => lightbox.close());

/* ---------- safety ---------- */
const scenarioBtns = [...document.querySelectorAll('.scenarios button')];
const layerEls = [...document.querySelectorAll('#layers li')];
const rescue = document.getElementById('rescue');
let layer = 0;
let userPicked = false;

function showRescue() {
  scenarioBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === layer)));
  layerEls.forEach((li, i) => li.classList.toggle('on', i === layer));
  rescue.textContent = d().rescue[layer];
}

scenarioBtns.forEach((b, i) => {
  b.addEventListener('click', () => {
    userPicked = true;
    layer = i;
    showRescue();
  });
});

const safetyGrid = document.querySelector('.safety-grid');
if (!reducedMotion && 'IntersectionObserver' in window) {
  let timer = 0;
  new IntersectionObserver((entries) => {
    const visible = entries.some((e) => e.isIntersecting);
    clearInterval(timer);
    if (visible && !userPicked) {
      timer = setInterval(() => {
        if (userPicked) return clearInterval(timer);
        layer = (layer + 1) % layerEls.length;
        showRescue();
      }, 4500);
    }
  }).observe(safetyGrid);
}

/* ---------- copy buttons ---------- */
for (const b of document.querySelectorAll('.copy')) {
  b.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(b.dataset.copy);
      b.textContent = d().copied;
      setTimeout(() => {
        b.textContent = lang === 'en' ? b._en : zh.copy;
      }, 1600);
    } catch {
      /* clipboard blocked: the command is selectable in the page */
    }
  });
}

/* ---------- init ---------- */
setTheme(root.dataset.theme);
applyStatic();
renderDemo();
showTab(activeTab);
showRescue();
