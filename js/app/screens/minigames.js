// v2 Puzzles games (26 Nov, student request): "Note tiles" (piano-tiles-like) and "Find the key"
// (a name appears; tap that key with no lights and no names, against the clock, like chess coordinate training).
// Wrong taps never end a game (Round 1: most wrong taps were fat fingers, not misunderstanding).
import { h, ICONS } from '../ui.js';
import { t, noteName } from '../i18n.js';
import { store } from '../store.js';
import { log } from '../../engine/log.js';
import { audio } from '../../engine/audio.js';
import { Keyboard } from '../../engine/keyboard.js';
import { InputHub } from '../../engine/input.js';
import { NOTE_COLORS, describe } from '../../engine/notes.js';

const WHITES = [60, 62, 64, 65, 67, 69, 71];

function shell(root, go, kind) {
  const score = h('b.mg-score', '0');
  const info = h('span.mg-info');
  const top = h('div.mg-top', h('button.icon-btn', { type: 'button', 'aria-label': t('common.back'), html: ICONS.back, on: { click: () => go('puzzles') } }),
    h('b.mg-title', t(kind === 'tiles' ? 'pz.tiles' : 'pz.findkey')), info, score);
  const stage = h('div.mg-stage');
  const kbEl = h('div'); const kbWrap = h('div.kb-wrap.mg-kb', kbEl);
  const el = h('div.screen.practice.mg', top, stage, kbWrap);
  root.append(el);
  kbWrap.style.height = Math.max(120, Math.min(200, Math.round(innerHeight * 0.36))) + 'px';
  const kb = new Keyboard(kbEl, { start: 'C4', whites: 7, labels: 'off', minKeyPx: 30 });
  const input = new InputHub({ audio }); input.attachKeyboard(kb);
  const card = (title, sub, label, onGo) => { const c = h('div.step-card.mg-card', h('p.card-text', title), sub ? h('p.muted.small', sub) : null, h('div.row.card-btns', h('button.btn.primary', { type: 'button', on: { click: () => { c.remove(); audio.unlock(); onGo(); } } }, label))); stage.append(c); };
  const best = (k, v) => { if (v != null && v > (store.settings[k] || 0)) store.set(k, v); return store.settings[k] || 0; };
  return { el, stage, kb, input, score, info, card, best, destroy() { input.detachAll(); kb.destroy(); audio.allOff(); } };
}

export function findKeyScreen(root, _p, { go }) {
  const S = shell(root, go, 'findkey');
  const big = h('div.mg-big'); S.stage.append(big);
  let target = null, n = 0, end = 0, timer = 0, running = false;
  const next = () => { let m; do m = WHITES[Math.floor(Math.random() * 7)]; while (m === target); target = m; big.replaceChildren(); big.append(h('span.nn', { style: { '--nn': NOTE_COLORS[describe(m).letter] } }, noteName(m))); };
  const tick = () => { const left = Math.max(0, Math.ceil((end - performance.now()) / 1000)); S.info.textContent = left + ' s'; if (left <= 0) stop(); };
  const stop = () => { running = false; clearInterval(timer); big.replaceChildren(); const b = S.best('best_findkey', n); log.event('mg_end', { game: 'findkey', score: n, best: b });
    S.card(t('mg.score', { n }), t('mg.best', { n: b }), t('mg.again'), start); };
  const start = () => { n = 0; S.score.textContent = '0'; end = performance.now() + 30000; running = true; next(); tick(); timer = setInterval(tick, 250); log.event('mg_start', { game: 'findkey' }); };
  S.input.on('noteon', ({ midi }) => {
    if (!running) return;
    if (describe(midi).letter === describe(target).letter) { n++; S.score.textContent = String(n); S.kb.flash(midi, 'correct'); next(); }
    else S.kb.flash(midi, 'wrong');
  });
  S.card(t('mg.findkey_intro'), t('mg.best', { n: S.best('best_findkey') }), t('mg.start'), start);
  return { destroy() { clearInterval(timer); S.destroy(); } };
}

export function tilesScreen(root, _p, { go }) {
  const S = shell(root, go, 'tiles');
  const cv = h('canvas.mg-canvas'); S.stage.prepend(cv);
  const ctx = cv.getContext('2d');
  let tiles = [], raf = 0, last = 0, spawnIn = 0, speed = 0, n = 0, running = false, lastLane = -1;
  const size = () => { const r = S.stage.getBoundingClientRect(); cv.width = r.width * devicePixelRatio; cv.height = r.height * devicePixelRatio; cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px'; };
  addEventListener('resize', size);
  const laneX = (m) => { const sp = S.kb.keySpan(m); const off = S.kb.root.getBoundingClientRect().left - S.stage.getBoundingClientRect().left; return { x: off + sp.x, w: sp.w }; };
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const H = cv.height / devicePixelRatio, TH = Math.max(44, H * 0.22);
    spawnIn -= dt; speed += dt * 4;
    if (spawnIn <= 0) { let lane; do lane = Math.floor(Math.random() * 7); while (lane === lastLane); lastLane = lane; tiles.push({ m: WHITES[lane], y: -TH }); spawnIn = Math.max(0.35, 1.1 - n * 0.02); }
    tiles.forEach((tl) => { tl.y += (H * 0.45 + speed * 6) * dt; });
    if (tiles.some((tl) => tl.y > H)) return stop();
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); ctx.clearRect(0, 0, cv.width, H);
    ctx.fillStyle = 'rgba(246,196,83,.12)'; ctx.fillRect(0, H - TH * 1.2, cv.width, TH * 1.2);
    for (const tl of tiles) { const { x, w } = laneX(tl.m); ctx.fillStyle = NOTE_COLORS[describe(tl.m).letter]; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x + 3, tl.y, w - 6, TH, 10); else ctx.rect(x + 3, tl.y, w - 6, TH); ctx.fill(); }
    raf = requestAnimationFrame(loop);
  };
  const stop = () => { running = false; cancelAnimationFrame(raf); const b = S.best('best_tiles', n); log.event('mg_end', { game: 'tiles', score: n, best: b }); S.card(t('mg.score', { n }), t('mg.best', { n: b }), t('mg.again'), start); };
  const start = () => { size(); tiles = []; n = 0; speed = 0; spawnIn = 0; S.score.textContent = '0'; running = true; last = performance.now(); raf = requestAnimationFrame(loop); log.event('mg_start', { game: 'tiles' }); };
  S.input.on('noteon', ({ midi }) => {
    if (!running) return;
    const H = cv.height / devicePixelRatio, TH = Math.max(44, H * 0.22);
    const hit = tiles.filter((tl) => tl.m === midi && tl.y + TH > H - TH * 1.6).sort((a, b) => b.y - a.y)[0];
    if (hit) { tiles.splice(tiles.indexOf(hit), 1); n++; S.score.textContent = String(n); S.kb.flash(midi, 'correct'); }
    else S.kb.flash(midi, 'wrong');
  });
  S.card(t('mg.tiles_intro'), t('mg.best', { n: S.best('best_tiles') }), t('mg.start'), start);
  return { destroy() { cancelAnimationFrame(raf); removeEventListener('resize', size); S.destroy(); } };
}
