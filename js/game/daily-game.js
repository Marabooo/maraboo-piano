// Klang daily mini-game: Note Sort (design/04_daily_game_and_streak.md).
//
//   import { mountDailyGame } from './game/daily-game.js';
//   const game = mountDailyGame(container, { audio, store, log, onExit, onGoToLesson });
//   …later: game.destroy();
//
// No timer, no move counter, no lives, no losing. Pours play the note; solving plays today's tune
// and links to the lesson that teaches it. Sharing only when the learner taps Share.
import {
  NOTES, MIDI, CAP, dayKey, dailyPuzzle, generate, pour, pourCount, isSolved, tubeDone,
  hasLegalMove, clone, top, solve,
} from './puzzle.js';
import { recordPuzzleSolved, getDays } from './streak.js';
import { makeT } from './strings.js';
import { createSfx } from './sound.js';
import { TUNES, bars } from '../lessons/shared.js';

/** Tunes that use only C–G (spec §4). Mary Had a Little Lamb is left out: no lesson teaches it, so it could not link back. */
export const DAILY_TUNES = [
  { id: 'frere', lesson: 1, notes: bars(TUNES.frere, 1, 4) },
  { id: 'ode', lesson: 2, notes: bars(TUNES.ode, 1, 4) },
  { id: 'jingle', lesson: 4, notes: bars(TUNES.jingle, 1, 4) },
];
export const tuneForPuzzle = (n) => DAILY_TUNES[(((n - 1) % DAILY_TUNES.length) + DAILY_TUNES.length) % DAILY_TUNES.length];

export const GAME_KEY = 'klang.game.v1';
const SOLFEGE = ['Do', 'Re', 'Mi', 'Fa', 'Sol'];
const SHARE_TUBES = '🟥🟧🟨🟩🟦';
const POUR_MS = 260;

const loadSaved = () => { try { return JSON.parse(localStorage.getItem(GAME_KEY) || 'null'); } catch { return null; } };
const saveSaved = (v) => { try { localStorage.setItem(GAME_KEY, JSON.stringify(v)); } catch { /* */ } };
/** Clears the saved daily-puzzle progress (for ?reset=1 / "Reset all progress"). */
export function resetGameData() { try { localStorage.removeItem(GAME_KEY); } catch { /* */ } }

function detectLang(store) {
  try { const q = new URLSearchParams(location.search).get('lang'); if (q === 'en' || q === 'ro') return q; } catch { /* */ }
  if (store?.settings?.lang) return store.settings.lang;
  return (navigator.language || 'en').toLowerCase().startsWith('ro') ? 'ro' : 'en';
}

const ICON = {
  back: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="m15 18-6-6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  undo: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 14 4 9l5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  restart: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 3v5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  music: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 18V5l12-2v13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="16" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  share: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="18" cy="5" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="6" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="19" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  tubes: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 2v17.5A2.5 2.5 0 0 1 6.5 22 2.5 2.5 0 0 1 4 19.5V2M20 2v17.5a2.5 2.5 0 0 1-2.5 2.5 2.5 2.5 0 0 1-2.5-2.5V2M3 2h7M14 2h7M9 16H4M20 16h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

/**
 * Mount the game into `container` (which should have a definite height, e.g. a full-screen route root).
 * Options:
 *   audio         PianoAudio instance (js/engine/audio.js `audio`). Optional — silent without it.
 *   store         app store (js/app/store.js) — read only: settings.labels, settings.lang, lessonProgress().
 *   log           usage log (js/engine/log.js `log`) — events game_opened, game_played, game_solved, …
 *   onExit()      back button.
 *   onGoToLesson({ lesson, tune, known })   result-card link (lesson = number 1…10).
 *   lang          'en' | 'ro' (default: ?lang, store.settings.lang, browser).
 *   labels        'letters' | 'solfege' | 'off' (default store.settings.labels). Off still shows names here.
 *   lessonDone(n) → bool (default: store.lessonProgress('L'+n) or ('l'+n) is completed).
 *   now()         → Date (testing only; default real time).
 * Returns { destroy(), debug }.
 */
export function mountDailyGame(container, opts = {}) {
  const { audio = null, store = null, log = null, onExit = () => {}, onGoToLesson = () => {} } = opts;
  const now = opts.now || (() => new Date());
  const lang = opts.lang || detectLang(store);
  const t = makeT(lang);
  const labelMode = () => {
    const m = opts.labels || store?.settings?.labels || 'letters';
    return m === 'off' ? (store?.settings?.lastNaming === 'solfege' ? 'solfege' : 'letters') : m;
  };
  const lessonDone = opts.lessonDone || ((n) => {
    try { return !!(store?.lessonProgress?.('L' + n)?.completed || store?.lessonProgress?.('l' + n)?.completed); } catch { return false; }
  });
  const reduced = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const ev = (type, data) => { try { log?.event?.(type, data); } catch (e) { console.error(e); } };
  const soundLog = [];
  const sfx = createSfx(audio, { onEvent: (k, v) => soundLog.push([k, v]) });

  // ---------- DOM ----------
  const root = document.createElement('div');
  root.className = 'kg';
  root.lang = lang;
  root.innerHTML = `
    <header class="kg-top">
      <button class="kg-icon-btn kg-back" type="button" aria-label="${t('game.back')}">${ICON.back}</button>
      <div class="kg-titles"><h1 class="kg-title">${ICON.tubes}<span>${t('daily.title')}</span></h1><p class="kg-number"></p></div>
    </header>
    <div class="kg-main">
      <section class="kg-play">
        <p class="kg-how">${t('daily.how')}</p>
        <div class="kg-board" role="group" aria-label="${t('daily.title')}"></div>
        <p class="kg-status" role="status" aria-live="polite"></p>
        <div class="kg-controls">
          <button class="kg-btn kg-undo" type="button">${ICON.undo}<span>${t('daily.undo')}</span></button>
          <button class="kg-btn kg-restart" type="button">${ICON.restart}<span>${t('daily.restart')}</span></button>
        </div>
      </section>
      <section class="kg-result" hidden aria-live="polite"></section>
      <div class="kg-fx" aria-hidden="true"></div>
    </div>`;
  container.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const board = $('.kg-board'), status = $('.kg-status'), result = $('.kg-result'), fx = $('.kg-fx'), main = $('.kg-main');

  // ---------- game state ----------
  let P = null;           // { practice, day, n, tune, start }
  let state = null, history = [], moves = [], selected = null, busy = false, solved = false;
  let played = false, openedAt = 0, tuneHandle = null, resultTimer = 0, destroyed = false;
  const anims = new Set();

  function startPuzzle({ practice = false } = {}) {
    stopTune();
    const day = dayKey(now());
    let puzzle, tune;
    if (practice) {
      const g = generate((Math.random() * 2 ** 32) >>> 0);
      puzzle = { tubes: g.tubes, n: null, day };
      tune = DAILY_TUNES[Math.floor(Math.random() * DAILY_TUNES.length)];
    } else {
      puzzle = dailyPuzzle(day);
      tune = tuneForPuzzle(puzzle.n);
    }
    P = { practice, day, n: puzzle.n, tune, start: clone(puzzle.tubes) };
    state = clone(P.start); history = []; moves = []; selected = null; busy = false; solved = false; played = false;
    openedAt = performance.now();
    let resumed = false;
    if (!practice) {
      const sv = loadSaved();
      if (sv && sv.day === day && Array.isArray(sv.moves)) {
        let s = clone(P.start); const ok = [];
        for (const [a, b] of sv.moves) { const r = pour(s, a, b); if (!r) break; history.push(s); s = r.state; ok.push([a, b]); }
        state = s; moves = ok; resumed = ok.length > 0; played = resumed;
        solved = isSolved(state);
      }
    }
    $('.kg-number').textContent = practice ? t('game.practice_title') : t('daily.number', { n: P.n, date: formatDate(day) });
    root.classList.toggle('kg-is-practice', practice);
    status.textContent = '';
    result.hidden = true; result.innerHTML = '';
    root.classList.remove('kg-solved');
    render();
    ev('game_opened', { n: P.n, practice, resumed, alreadySolved: solved });
    if (solved) showResult({ fresh: false });
  }

  function formatDate(key) {
    const [y, m, d] = key.split('-').map(Number);
    try { return new Date(y, m - 1, d).toLocaleDateString(lang === 'ro' ? 'ro-RO' : 'en-GB', { day: 'numeric', month: 'long' }); } catch { return key; }
  }
  const noteLabel = (c) => (labelMode() === 'solfege' ? SOLFEGE[c] : NOTES[c]);

  // ---------- rendering ----------
  function tubeEl(i) { return board.children[i]; }
  function render(display = state) {
    if (board.children.length !== display.length) {
      board.innerHTML = '';
      display.forEach((_, i) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'kg-tube'; b.dataset.i = i;
        b.innerHTML = '<span class="kg-glass"><span class="kg-stack"></span></span>';
        board.appendChild(b);
      });
    }
    display.forEach((tube, i) => {
      const el = tubeEl(i);
      const stack = el.querySelector('.kg-stack');
      stack.innerHTML = tube.map((c, slot) => layerHTML(c, slot)).join('');
      el.classList.toggle('kg-lifted', selected === i);
      el.classList.toggle('kg-done', tubeDone(tube));
      if (tubeDone(tube)) el.style.setProperty('--c', `var(--kg-n${tube[0]})`); else el.style.removeProperty('--c');
      const contents = tube.length ? tube.map(noteLabel).join(', ') : t('game.tube_empty');
      el.setAttribute('aria-label', t('game.tube', { i: i + 1, contents }) + (selected === i ? ', ' + t('game.tube_lifted') : ''));
      el.setAttribute('aria-pressed', selected === i ? 'true' : 'false');
    });
    $('.kg-undo').disabled = !history.length || busy || solved;
    $('.kg-restart').disabled = !history.length || busy || solved;
  }
  function layerHTML(c, slot) {
    return `<span class="kg-layer" style="--slot:${slot};--c:var(--kg-n${c});--cd:var(--kg-n${c}-deep)">${noteLabel(c)}</span>`;
  }

  // ---------- layout (fits 7 tubes in one row, or 4 + 3) ----------
  function layout() {
    const w = board.clientWidth, h = board.clientHeight;
    if (!w || !h) return;
    const gap = Math.max(8, Math.min(18, w / 40));
    const lift = 14, chrome = 16; // lift space + glass border/padding
    let best = null;
    for (const cols of [7, 4]) {
      const rows = Math.ceil(7 / cols);
      const W = Math.min(84, (w - (cols - 1) * gap) / cols);
      const Lw = (W - 12) * 0.78;
      const Lh = ((h - (rows - 1) * gap) / rows - lift - chrome) / CAP;
      const L = Math.floor(Math.min(Lw, Lh, 58));
      if (!best || L > best.L + 1) best = { cols, L, W: Math.floor(Math.max(44, Math.min(W, L / 0.78 + 12))) };
    }
    board.style.setProperty('--L', Math.max(18, best.L) + 'px');
    board.style.setProperty('--W', best.W + 'px');
    board.style.setProperty('--gap', Math.round(gap) + 'px');
    board.style.setProperty('--cols', best.cols);
    board.dataset.cols = best.cols;
    // 4 + 3 layout: pad the sides so exactly 4 tubes fit per row (padding doesn't change clientWidth)
    const rowW = best.cols * best.W + (best.cols - 1) * Math.round(gap);
    board.style.paddingInline = best.cols === 4 ? Math.max(0, Math.floor((w - rowW) / 2) - 1) + 'px' : '0px';
    const wide = main.clientWidth >= 560 && main.clientWidth > main.clientHeight * 1.3;
    root.classList.toggle('kg-wide', wide);
  }
  const ro = new ResizeObserver(() => layout());
  ro.observe(board); ro.observe(main);

  // ---------- input (Pointer Events; keyboard via click with detail 0) ----------
  let downOn = null, lastPointerUp = 0;
  const tubeFromEvent = (e) => e.target.closest?.('.kg-tube');
  board.addEventListener('pointerdown', (e) => { if (e.button > 0) return; downOn = tubeFromEvent(e); });
  board.addEventListener('pointerup', (e) => {
    const el = tubeFromEvent(e);
    if (!el || el !== downOn) { downOn = null; return; }
    downOn = null; lastPointerUp = performance.now();
    activate(Number(el.dataset.i));
  });
  board.addEventListener('pointercancel', () => { downOn = null; });
  board.addEventListener('click', (e) => {
    const el = tubeFromEvent(e);
    if (!el || performance.now() - lastPointerUp < 700) return; // already handled by pointerup
    activate(Number(el.dataset.i));
  });
  board.addEventListener('contextmenu', (e) => e.preventDefault());

  $('.kg-back').addEventListener('click', () => { ev('game_exit', { n: P?.n, practice: P?.practice, solved }); stopTune(); onExit(); });
  $('.kg-undo').addEventListener('click', undo);
  $('.kg-restart').addEventListener('click', restart);
  // while the solve tune plays, a tap on the board shows the result card straight away
  main.addEventListener('pointerup', () => { if (solved && result.hidden && resultTimer) { clearTimeout(resultTimer); resultTimer = 0; showResult({ fresh: true }); } });

  function activate(i) {
    if (busy || solved || destroyed) return;
    if (selected === null) {
      if (!state[i].length) return;
      selected = i;
      sfx.lift(MIDI[top(state[i])]);
      render();
      return;
    }
    if (selected === i) { selected = null; render(); return; }
    const from = selected;
    if (!pourCount(state, from, i)) { shake(from); selected = null; render(); return; }
    doPour(from, i);
  }

  function shake(i) {
    const el = tubeEl(i).querySelector('.kg-glass');
    if (reduced()) return;
    const a = el.animate([
      { transform: 'translate(0,-12px)' }, { transform: 'translate(-4px,-12px)' }, { transform: 'translate(4px,-12px)' },
      { transform: 'translate(-4px,-12px)' }, { transform: 'translate(4px,-12px)' }, { transform: 'translate(0,0)' },
    ], { duration: 200, easing: 'ease-out' });
    anims.add(a); a.finished.catch(() => {}).finally(() => anims.delete(a));
  }

  async function doPour(from, to) {
    const before = state;
    const wasDone = tubeDone(before[to]);
    const r = pour(state, from, to);
    history.push(state); moves.push([from, to]);
    state = r.state;
    busy = true;
    if (!played) { played = true; ev('game_played', { n: P.n, practice: P.practice }); }
    status.textContent = '';
    // step the display one layer at a time
    let disp = clone(before);
    for (let k = 0; k < r.count; k++) {
      const srcSlot = disp[from].length - 1;
      const startRect = slotRect(from, srcSlot);
      const c = disp[from].pop();
      const endSlot = disp[to].length;
      sfx.glug(MIDI[c]);
      if (reduced() || destroyed) {
        disp[to].push(c); render(disp);
        await wait(Math.min(POUR_MS, 120));
      } else {
        render(disp);
        const endRect = slotRect(to, endSlot);
        await fly(c, startRect, endRect);
        disp[to].push(c); render(disp);
      }
    }
    if (destroyed) return;
    selected = null; busy = false;
    render();
    if (!P.practice) saveSaved({ day: P.day, moves, solved: isSolved(state) });
    if (!wasDone && tubeDone(state[to])) { sfx.bell(MIDI[state[to][0]]); sparkle(to); }
    if (isSolved(state)) onSolved();
    else if (!hasLegalMove(state)) { status.textContent = t('daily.no_moves'); ev('game_stuck', { n: P.n, practice: P.practice }); }
  }

  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
  function slotRect(i, slot) {
    const stack = tubeEl(i).querySelector('.kg-stack');
    const sr = stack.getBoundingClientRect(), mr = main.getBoundingClientRect();
    const L = sr.height / CAP; // the lift (CSS transform) is already in the measured rect
    return { x: sr.left - mr.left, y: sr.bottom - mr.top - (slot + 1) * L, w: sr.width, h: L };
  }
  function fly(c, a, b) {
    const el = document.createElement('span');
    el.className = 'kg-layer kg-fly';
    el.style.cssText = `--c:var(--kg-n${c});--cd:var(--kg-n${c}-deep);left:${a.x}px;top:${a.y}px;width:${a.w}px;height:${a.h}px;`;
    el.textContent = noteLabel(c);
    fx.appendChild(el);
    const peak = Math.min(a.y, b.y) - Math.max(28, a.h * 1.2);
    const cy = 2 * peak - (a.y + b.y) / 2;
    const frames = [];
    for (let i = 0; i <= 10; i++) {
      const p = i / 10;
      const x = (b.x - a.x) * p;
      const y = (1 - p) * (1 - p) * a.y + 2 * p * (1 - p) * cy + p * p * b.y - a.y;
      frames.push({ transform: `translate(${x}px,${y}px)` });
    }
    const an = el.animate(frames, { duration: POUR_MS, easing: 'ease-in-out', fill: 'forwards' });
    anims.add(an);
    return an.finished.catch(() => {}).then(() => { anims.delete(an); el.remove(); });
  }
  function sparkle(i) {
    if (reduced()) return;
    const r = tubeEl(i).querySelector('.kg-glass').getBoundingClientRect(), mr = main.getBoundingClientRect();
    const cx = r.left - mr.left + r.width / 2, cy = r.top - mr.top + 6;
    for (let k = 0; k < 7; k++) {
      const s = document.createElement('span');
      s.className = 'kg-spark';
      s.style.cssText = `left:${cx}px;top:${cy}px;--c:var(--kg-n${state[i][0]})`;
      fx.appendChild(s);
      const ang = (-150 + k * 20) * Math.PI / 180, d = 22 + (k % 3) * 8;
      const an = s.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(ang) * d}px), calc(-50% + ${Math.sin(ang) * d}px)) scale(.4)`, opacity: 0 }], { duration: 650, easing: 'ease-out' });
      anims.add(an); an.finished.catch(() => {}).finally(() => { anims.delete(an); s.remove(); });
    }
  }

  function undo() {
    if (busy || !history.length || solved) return;
    state = history.pop(); moves.pop(); selected = null;
    status.textContent = '';
    if (!P.practice) saveSaved({ day: P.day, moves, solved: false });
    ev('game_undo', { n: P.n, practice: P.practice });
    render();
  }
  function restart() {
    if (busy || solved) return;
    state = clone(P.start); history = []; moves = []; selected = null;
    status.textContent = '';
    if (!P.practice) saveSaved({ day: P.day, moves: [], solved: false });
    ev('game_restart', { n: P.n, practice: P.practice });
    render();
  }

  // ---------- solved ----------
  function onSolved() {
    solved = true;
    root.classList.add('kg-solved');
    render();
    if (!P.practice) recordPuzzleSolved({ now: now() });
    ev('game_solved', { n: P.n, practice: P.practice, tune: P.tune.id, ms: Math.round(performance.now() - openedAt) });
    const delay = reduced() ? 150 : 250 + 7 * 90;
    if (!reduced()) {
      state.forEach((_, i) => {
        const an = tubeEl(i).querySelector('.kg-glass').animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-14px)' }, { transform: 'translateY(0)' }],
          { duration: 420, delay: 250 + i * 90, easing: 'ease-in-out' });
        anims.add(an); an.finished.catch(() => {}).finally(() => anims.delete(an));
      });
    }
    setTimeout(() => {
      if (destroyed) return;
      const d = playTune();
      resultTimer = setTimeout(() => { resultTimer = 0; showResult({ fresh: true }); }, d * 1000 + 300);
    }, delay);
  }

  function playTune() {
    stopTune();
    const tubeOf = (midi) => state.findIndex((tb) => tb.length && MIDI[tb[0]] === midi);
    tuneHandle = sfx.tune(P.tune.notes, {
      onNote: (midi) => {
        const i = tubeOf(midi); if (i < 0 || destroyed) return;
        const el = tubeEl(i);
        el.classList.remove('kg-ring'); void el.offsetWidth; el.classList.add('kg-ring');
        setTimeout(() => el.classList.remove('kg-ring'), 320);
      },
    });
    return tuneHandle.duration;
  }
  function stopTune() { tuneHandle?.stop(); tuneHandle = null; clearTimeout(resultTimer); resultTimer = 0; }

  function showResult({ fresh }) {
    const tuneName = t('tune.' + P.tune.id);
    const n = P.tune.lesson;
    const known = lessonDone(n);
    const days = P.practice ? null : getDays(now());
    result.innerHTML = `
      <h2 class="kg-solved-title">${t('daily.solved')}</h2>
      <button class="kg-tune-line" type="button">${ICON.music}<span>${t('daily.tune', { tune: tuneName })}</span></button>
      <button class="kg-btn kg-primary kg-lesson" type="button">${t(known ? 'daily.tune_known' : 'daily.tune_new', { n })}</button>
      ${P.practice ? '' : `
        ${days?.todayCounted ? `<p class="kg-chip">${t('days.today_counted')}</p>` : ''}
        <button class="kg-btn kg-share" type="button">${ICON.share}<span>${t('daily.share')}</span></button>
        <p class="kg-copied" role="status" aria-live="polite"></p>
        <p class="kg-muted">${t('daily.tomorrow')}</p>`}
      <button class="kg-btn kg-practice" type="button">${t('daily.practice')}</button>
      <p class="kg-muted kg-small">${t('daily.practice_note')}</p>`;
    result.hidden = false;
    result.querySelector('.kg-tune-line').addEventListener('click', () => { ev('game_tune_replay', { n: P.n, practice: P.practice }); playTune(); });
    result.querySelector('.kg-lesson').addEventListener('click', () => {
      ev('game_tune_link', { n: P.n, practice: P.practice, lesson: n, known });
      stopTune(); onGoToLesson({ lesson: n, tune: P.tune.id, known });
    });
    result.querySelector('.kg-share')?.addEventListener('click', share);
    result.querySelector('.kg-practice').addEventListener('click', () => { ev('game_practice_start', {}); startPuzzle({ practice: true }); });
    if (fresh) result.querySelector('.kg-solved-title').focus?.();
    layout();
  }

  async function share() {
    const text = t('daily.share_text', { n: P.n, tune: t('tune.' + P.tune.id), tubes: SHARE_TUBES });
    const copiedEl = result.querySelector('.kg-copied');
    if (navigator.share) {
      try { await navigator.share({ text }); ev('game_share', { n: P.n, method: 'share' }); return; }
      catch (e) { if (e && e.name === 'AbortError') { ev('game_share_cancel', { n: P.n }); return; } }
    }
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch {
      try {
        const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove();
      } catch { /* */ }
    }
    if (ok) { copiedEl.textContent = t('daily.copied'); ev('game_share', { n: P.n, method: 'copy' }); }
  }

  startPuzzle();
  layout();

  return {
    destroy() {
      destroyed = true;
      stopTune();
      for (const a of anims) { try { a.cancel(); } catch { /* */ } }
      ro.disconnect();
      root.remove();
    },
    /** For dev checks only. */
    debug: {
      get state() { return clone(state); },
      get start() { return clone(P.start); },
      get puzzle() { return { ...P, start: clone(P.start) }; },
      get busy() { return busy; },
      get solved() { return solved; },
      get selected() { return selected; },
      solutionFromHere: () => solve(state),
      sounds: soundLog,
      tap: (i) => activate(i),
    },
  };
}
