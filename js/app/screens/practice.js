// Practice screen (01 §2.6–2.8, §3, §6, §7, §8). Also "free play" (no lesson).
import { h, ICONS, toast } from '../ui.js';
import { t, tx, noteName, naming } from '../i18n.js';
import { store } from '../store.js';
import { days } from '../days.js';
import { micSession } from '../micSession.js';
import { soundHelp } from '../sheets.js';
import { audio } from '../../engine/audio.js';
import { log } from '../../engine/log.js';
import { Keyboard } from '../../engine/keyboard.js';
import { FallingNotes } from '../../engine/falling.js';
import { InputHub } from '../../engine/input.js';
import { LessonRunner } from '../../engine/lesson.js';
import { describe, whiteIndex, whiteToMidi, NOTE_COLORS } from '../../engine/notes.js';
import { lessonById, NOTE_HINT, PATTERN_HINT } from '../../lessons/index.js';

const KEY_PX = { bigger: 64, normal: 44, more: 44 };
const query = () => new URLSearchParams(location.search);

export function waitMode() { const q = query().get('wait'); return q === 'soft' || q === 'strict' ? q : store.settings.waitMode; }

export function practiceScreen(root, { id, query: hq, free = false }, { go }) {
  const lesson = free ? null : lessonById(id);
  if (!free && !lesson) { go('home', { replace: true }); return null; }
  const S = store.settings;
  const mic = !free && S.practiceMode === 'mic' && micSession.running;
  let speed = 1;
  let labelsHidden = false;
  let runner = null;
  let peEl = null;

  // ---------- layout ----------
  const pauseBtn = h('button.icon-btn', { type: 'button', 'aria-label': t('top.pause'), title: t('top.pause'), html: free ? ICONS.back : pauseIcon() });
  const dots = h('div.dots', { role: 'img' });
  const coach = h('div.coach-slot', { 'aria-live': 'polite' });
  const skipNote = h('button.help-link', { type: 'button', style: { display: 'none' } }, t('top.skip'));
  const micPill = h('div.mic-pill', { style: { display: mic ? '' : 'none' } }, h('span.mic-dot'), h('span.mic-txt', t('mic.pill.listening')), h('span.lvl', h('i')));
  const hintBtn = h('button.icon-btn', { type: 'button', 'aria-label': t('top.hint'), title: t('top.hint'), style: { display: S.hints === 'ask' && !free ? '' : 'none' }, html: bulbIcon() });
  const labelsBtn = h('button.bar-btn', { type: 'button', 'aria-label': t('top.labels', { mode: '' }) });
  const keysBtn = h('button.bar-btn.keys-btn', { type: 'button', 'aria-label': t('top.keys'), title: t('top.keys') }, h('canvas.mini-map', { width: 128, height: 40 }));
  const fsBtn = h('button.icon-btn', { type: 'button', 'aria-label': t('top.fullscreen'), title: t('top.fullscreen'), html: fsIcon(), style: { display: 'none' } });
  const chip = h('button.help-link', { type: 'button', style: { display: 'none' } }, t('sound.auto_chip'));
  const top = h('div.p-top', pauseBtn, free ? h('b.free-title', t('free.title')) : dots, coach, skipNote, chip, micPill, hintBtn, labelsBtn, keysBtn, fsBtn);
  const canvas = h('canvas.lane', { 'aria-hidden': 'true' });
  const tags = h('div.tags');
  const cardLayer = h('div.card-layer');
  const chipsRow = h('div.chips-row', { style: { display: 'none' } });
  const sheetLayer = h('div.sheet-layer');
  const stage = h('div.stage', canvas, chipsRow, tags, cardLayer, sheetLayer);
  const kbEl = h('div');
  const kbWrap = h('div.kb-wrap', kbEl);
  const el = h('div.screen.practice', top, stage, kbWrap);
  root.append(el);

  // ---------- engines ----------
  const kb = new Keyboard(kbEl, { start: 'C3', whites: 15, labels: S.labels, minKeyPx: KEY_PX[S.keySize] || 44 });
  kb.root.dataset.last = S.lastNaming || 'letters';
  const fall = new FallingNotes(canvas, kb, { waitMode: waitMode(), labels: S.labels, lastNaming: naming() });
  const input = new InputHub({ audio });
  input.attachKeyboard(kb);
  const offKeys = input.attachComputerKeys(window, { transpose: () => { const lo = kb.visibleRange().lo; return Math.floor((lo + 11) / 12) * 12 - 60; } });
  let offMic = null;
  if (mic) {
    const m = micSession.listener;
    offMic = input.attachMic(m);
    const lvl = micPill.querySelector('.lvl i'), txt = micPill.querySelector('.mic-txt');
    let heardT = 0;
    const offLevel = m.on('level', ({ rms }) => {
      lvl.style.width = Math.min(100, Math.round(Math.sqrt(rms) * 400)) + '%';
      if (performance.now() > heardT) txt.textContent = audio.isOutputActive(0.3) ? t('mic.pill.paused') : t('mic.pill.listening');
    });
    const offHeard = m.on('noteon', ({ midi }) => { log.event('mic_note', { note: describe(midi).ascii }); txt.textContent = t('mic.pill.heard', { note: noteName(midi) }); heardT = performance.now() + 1000; kb.flash(midi, 'done'); });
    const prev = offMic; offMic = () => { prev(); offLevel(); offHeard(); };
  }

  // ---------- sizing (01 §3.2) ----------
  const layout = () => {
    const H = root.getBoundingClientRect().height || window.innerHeight; // below the test-mode bar if shown
    const portrait = H > window.innerWidth;
    el.classList.toggle('portrait', portrait);
    const insetB = safeBottom();
    const avail = H - 44 - insetB - (portrait ? 40 : 0);
    const keyH = portrait ? clamp(Math.round(0.28 * avail), 120, 220) : clamp(Math.round(0.40 * avail), 120, 200);
    kbWrap.style.height = keyH + insetB + 'px';
    el.classList.toggle('compact', avail - keyH < 96);
    fsBtn.style.display = document.fullscreenEnabled && H < 340 && !document.fullscreenElement ? '' : 'none';
    drawMap();
    kb._measure?.();
  };
  addEventListener('resize', layout);
  kb.on('rangechange', (r) => log.event('kb_range', { lo: r.lo, hi: r.hi, kw: Math.round(kb.kw) }));
  setTimeout(() => { const r = kb.visibleRange(); log.event('kb_range', { lo: r.lo, hi: r.hi, kw: Math.round(kb.kw) }); }, 600);
  layout();
  if (innerHeight > innerWidth && matchMedia('(pointer: coarse)').matches && !sessionStorage.getItem('klang.rotTip')) {
    sessionStorage.setItem('klang.rotTip', '1');
    setTimeout(() => toast(t('rotate.tip'), 4000), 600);
    log.event('rotate_tip');
  }

  // ---------- labels popover (01 §7.3) ----------
  const labelText = () => ({ letters: 'C4', solfege: 'Do', off: '–' }[labelsHidden ? 'off' : S.labels]);
  const refreshLabelsBtn = () => {
    labelsBtn.innerHTML = '';
    labelsBtn.append(h('span.aa', 'Aa'), h('span.lv', labelText()));
    labelsBtn.setAttribute('aria-label', t('top.labels', { mode: t('labels.' + S.labels) }));
  };
  refreshLabelsBtn();
  const applyLabels = (mode, from = 'user') => {
    if (mode !== 'off') store.set('lastNaming', mode);
    store.set('labels', mode);
    labelsHidden = false;
    kb.setLabels(mode); kb.root.dataset.last = store.settings.lastNaming;
    fall.setLabels(mode); fall.setOption('lastNaming', naming());
    refreshLabelsBtn();
    runner?.labelsChanged(mode);
    log.event('labels_change', { mode, from, step: runner?.step?.id });
  };
  labelsBtn.addEventListener('click', () => openSheet('labels'));

  // ---------- sheets over the lane (never over the keys) ----------
  let sheetOpen = null;
  function openSheet(kind) {
    closeSheet(false);
    runner?.pause(); if (free) fall.pause();
    const close = () => closeSheet();
    let body;
    if (kind === 'labels') {
      const tiles = ['letters', 'solfege', 'off'].map((m) => h('button.label-tile', {
        type: 'button', 'aria-pressed': String(S.labels === m && !labelsHidden),
        on: { click: () => { applyLabels(m); tiles.forEach((x, i) => x.setAttribute('aria-pressed', String(['letters', 'solfege', 'off'][i] === m))); clearTimeout(autoClose); autoClose = setTimeout(close, 2000); } },
      }, h('span.prev', m === 'letters' ? 'C4 D E F G' : m === 'solfege' ? 'Do Re Mi Fa Sol' : t('labels.off_preview')), h('b', t('labels.' + m))));
      let autoClose;
      body = [h('h2', t('labels.title')), h('div.label-tiles', tiles), labelsHidden ? h('p.muted', t('recall.hidden_caption')) : null];
    } else if (kind === 'keys') {
      const map = h('canvas.big-map', { width: 576, height: 64 });
      const size = h('div.seg', ['bigger', 'normal', 'more'].map((k) => h('button', { type: 'button', 'aria-pressed': String(S.keySize === k), on: { click: (e) => { store.set('keySize', k); [...e.target.parentNode.children].forEach((b) => b.setAttribute('aria-pressed', String(b === e.target))); applyKeySize(); log.event('size_change', { size: k }); drawBigMap(map); } } }, t('keys.' + k))));
      bindMap(map);
      body = [h('div.keys-head', h('h2', t('keys.title')), h('span.muted.small', t('keys.map_hint') + (free ? '' : ' ' + t('keys.follow')))), map,
        h('div.keys-controls',
          h('div.row', h('button.btn', { type: 'button', on: { click: () => { kb.shiftOctave(-1); log.event('keys_change', { how: 'lower' }); setTimeout(() => drawBigMap(map), 420); } } }, t('keys.lower')),
            h('button.btn', { type: 'button', on: { click: () => { kb.shiftOctave(1); log.event('keys_change', { how: 'higher' }); setTimeout(() => drawBigMap(map), 420); } } }, t('keys.higher'))),
          h('div.row', h('span.muted.small', t('keys.size')), size))];
      setTimeout(() => drawBigMap(map), 0);
    } else if (kind === 'pause') {
      const sp = h('div.seg', [[0.75, 'speed.slower'], [1, 'speed.normal']].map(([v, k]) => h('button', { type: 'button', 'aria-pressed': String(speed === v), on: { click: (e) => { speed = v; if (runner) runner.o.speed = v; fall.setSpeed(v); [...e.target.parentNode.children].forEach((b) => b.setAttribute('aria-pressed', String(b === e.target))); log.event('speed_change', { speed: v }); } } }, t(k))));
      const hi = h('div.seg', [['auto', 'hints.auto'], ['ask', 'hints.ask']].map(([v, k]) => h('button', { type: 'button', 'aria-pressed': String(S.hints === v), on: { click: (e) => { store.set('hints', v); if (runner) runner.o.hints = v; hintBtn.style.display = v === 'ask' ? '' : 'none'; [...e.target.parentNode.children].forEach((b) => b.setAttribute('aria-pressed', String(b === e.target))); log.event('hints_change', { hints: v }); } } }, t(k))));
      body = [
        h('button.btn.primary.big.wide', { type: 'button', on: { click: close } }, t('pause.resume')),
        h('div.sheet-rows',
          h('button.row-btn', { type: 'button', on: { click: () => { closeSheet(); runner?.action('hear'); } } }, t('pause.hear')),
          h('button.row-btn', { type: 'button', on: { click: () => { closeSheet(false); restartStep(); } } }, t('pause.restart_step')),
          h('div.row-line', h('span', t('pause.speed')), sp),
          h('div.row-line', h('span', t('pause.hints')), hi),
          h('button.row-btn', { type: 'button', on: { click: () => soundHelp() } }, t('pause.sound_help')),
          h('button.row-btn', { type: 'button', on: { click: leave } }, t('pause.leave')),
        ),
      ];
    }
    const sheet = h('div.sheet.sheet-' + kind, { role: 'dialog' }, body);
    const scrim = h('div.sheet-scrim', { on: { click: close } });
    sheetLayer.append(scrim, sheet);
    sheetOpen = { kind, el: sheet, scrim };
    log.event('sheet_open', { kind });
  }
  function closeSheet(resume = true) {
    if (!sheetOpen) return;
    sheetOpen.el.remove(); sheetOpen.scrim.remove(); sheetOpen = null;
    if (resume) { runner?.resume(); if (free && fall.phrase) fall.resume(); }
  }
  keysBtn.addEventListener('click', () => openSheet('keys'));
  pauseBtn.addEventListener('click', () => (free ? go('home') : openSheet('pause')));
  fsBtn.addEventListener('click', async () => { try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); await screen.orientation?.lock?.('landscape'); } catch { /* ignore */ } layout(); });
  chip.addEventListener('click', () => soundHelp());

  const applyKeySize = () => {
    kb.opts.minKeyPx = KEY_PX[S.keySize] || 44;
    if (S.keySize === 'more') { const n = kb.maxWhites(); const c = kb.view.start + kb.view.count / 2; kb.setRange(whiteToMidi(kb.base + Math.max(0, Math.round(c - n / 2))), n); }
    else if (kb._requested) kb.setRange(kb._requested.start, Math.max(kb._requested.whites, 8), { focus: kb._requested.focus });
  };

  // ---------- piano map (01 §6.2) ----------
  function drawMapInto(cv, highlight = []) {
    const c = cv.getContext('2d'); const W = cv.width, H = cv.height;
    c.clearRect(0, 0, W, H);
    const n = kb.totalWhites, w = W / n;
    for (let i = 0; i < n; i++) { c.fillStyle = '#fff'; c.fillRect(i * w + 0.5, 0, w - 1, H); }
    for (let m = kb.lo; m <= kb.hi; m++) { const d = describe(m); if (d.sharp) { const x = (whiteIndex(m) - kb.base + 0.5) * w; c.fillStyle = '#3b3647'; c.fillRect(x - w * 0.3, 0, w * 0.6, H * 0.6); } }
    const mcx = (whiteIndex(60) - kb.base + 0.5) * w; c.fillStyle = 'rgba(46,42,58,.45)'; c.beginPath(); c.arc(mcx, H - 5, Math.max(1.5, H / 16), 0, 7); c.fill();
    for (const m of highlight) { const x = (Math.floor(whiteIndex(m)) - kb.base + 0.5) * w; c.fillStyle = NOTE_COLORS[describe(m).letter]; c.fillRect(x - w * 0.35, H * 0.7, w * 0.7, H * 0.18); }
    c.strokeStyle = '#e0a106'; c.lineWidth = Math.max(2, H / 14);
    const x0 = kb.view.start * w, x1 = (kb.view.start + kb.view.count) * w;
    c.strokeRect(x0 + 1, 1, x1 - x0 - 2, H - 2);
  }
  function drawMap() { drawMapInto(keysBtn.querySelector('canvas'), fall.pendingNotes?.() || []); }
  function drawBigMap(cv) { drawMapInto(cv, fall.pendingNotes?.() || []); }
  function bindMap(cv) {
    let drag = null;
    const toW = (e) => { const r = cv.getBoundingClientRect(); return ((e.clientX - r.left) / r.width) * kb.totalWhites; };
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); const w = toW(e); const inside = w >= kb.view.start && w <= kb.view.start + kb.view.count; drag = { off: inside ? w - kb.view.start : kb.view.count / 2 }; kb.setViewStart(w - drag.off, { animate: !inside }); userMoved(); drawBigMap(cv); });
    cv.addEventListener('pointermove', (e) => { if (!drag) return; kb.setViewStart(toW(e) - drag.off); drawBigMap(cv); });
    cv.addEventListener('pointerup', () => { drag = null; log.event('keys_change', { how: 'map', start: describe(kb.visibleRange().lo).ascii }); });
    cv.style.touchAction = 'none';
  }
  kb.on('layout', () => { cancelAnimationFrame(mapRaf); mapRaf = requestAnimationFrame(drawMap); positionTags(); });
  let mapRaf = 0;

  // auto-follow (01 §6.2.1/5): keep the expected note in view
  let movedAt = 0;
  const userMoved = () => { movedAt = performance.now(); };
  fall.on('pending', ({ midis }) => {
    drawMap();
    if (!midis.length) return;
    if (performance.now() - movedAt < 1500) { setTimeout(() => { if (!midis.every((m) => kb.isVisible(m))) { kb.ensureVisible(midis); toast(t('toast.moved', { note: noteName(midis[0]) }), 1600); } }, 1500); return; }
    kb.ensureVisible(midis);
  });

  // ---------- key tags (01 §5.2 / §9.2) ----------
  const tagEls = new Map();
  function showTag({ midi, text, kind, ms }) {
    if (midi == null) { showTag({ midi: kb.visibleRange().lo + 5, text, kind, ms }); return; }
    clearTags(); // one bubble at a time: a hint replaces a wrong-note tag and vice versa
    const el2 = h('div.tag.kind-' + kind, { role: 'status' }, kind === 'pointer' ? h('span.ptr', '👇') : null, text);
    tags.append(el2);
    const rec = { el: el2, midi };
    tagEls.set(midi, rec);
    positionTag(rec);
    if (ms) { rec.t = setTimeout(() => { el2.classList.add('out'); setTimeout(() => { el2.remove(); if (tagEls.get(midi) === rec) tagEls.delete(midi); }, 300); }, ms); }
  }
  function positionTag(rec) {
    const s = kb.keySpan(rec.midi);
    const off = kb.root.getBoundingClientRect().left - stage.getBoundingClientRect().left;
    const cx = off + s.x + s.w / 2;
    const w = rec.el.offsetWidth || 160;
    const x = Math.round(clamp(cx - w / 2, 4, stage.clientWidth - w - 4));
    // ignore sub-2px changes (keyboard re-measures on iOS toolbar/resize ticks made the bubble jitter)
    if (rec.x != null && Math.abs(rec.x - x) < 2) return;
    rec.x = x;
    rec.el.style.left = x + 'px';
  }
  function positionTags() { tagEls.forEach(positionTag); }
  function clearTags() { tagEls.forEach((r) => { clearTimeout(r.t); r.el.remove(); }); tagEls.clear(); }

  // ---------- coach slot ----------
  let dimT = 0;
  function setBar({ text, kind, ms }) {
    clearTimeout(dimT);
    if (kind === 'hide') { coach.classList.add('faded'); return; }
    coach.className = 'coach-slot kind-' + kind;
    coach.textContent = text;
    if (ms) dimT = setTimeout(() => coach.classList.add('faded'), ms);
    else if (kind === 'step') dimT = setTimeout(() => coach.classList.add('dim'), 6000);
  }

  // ---------- cards in the lane ----------
  function showCard({ eyebrow, text, note, buttons = [], className = '' }, onButton) {
    cardLayer.innerHTML = '';
    const c = h('div.step-card' + className, eyebrow ? h('div.eyebrow', eyebrow) : null, h('p.card-text', text),
      note ? h('p.muted.small', note) : null,
      buttons.length ? h('div.row.card-btns', buttons.map((b) => h('button.btn' + (b.primary ? '.primary' : ''), { type: 'button', on: { click: () => onButton(b.id) } }, b.label))) : null);
    cardLayer.append(c);
    return c;
  }
  const hideCard = () => { cardLayer.innerHTML = ''; };

  // debug/test hook (read-only use): key centres for automated checks, engine handles
  const keyCenter = (m) => { const r = kb.root.getBoundingClientRect(); const sp = kb.keySpan(m); return { x: r.left + sp.x + sp.w / 2, y: r.top + r.height * (sp.black ? 0.35 : 0.82) }; };
  if (window.klang) window.klang.practice = { kb, fall, input, keyCenter, get runner() { return runner; } };

  // ---------- free play ----------
  if (free) {
    log.event('freeplay_start');
    kb.setRange('C3', 15, { animate: false });
    canvas.style.display = 'none';
    coach.textContent = '';
    const off = () => {};
    return { destroy() { removeEventListener('resize', layout); input.detachAll(); offKeys(); offMic?.(); kb.destroy(); fall.destroy(); audio.allOff(); off(); } };
  }

  // ---------- lesson ----------
  const total = lesson.steps.length;
  const renderDots = (i) => { dots.innerHTML = ''; dots.setAttribute('aria-label', t('top.step', { n: i + 1, total })); for (let k = 0; k < total; k++) dots.append(h('i', { class: k < i ? 'done' : k === i ? 'cur' : '' })); };
  const resume = store.resume?.lessonId === lesson.id ? store.resume : null;
  const startIndex = hq?.get('step') ? Number(hq.get('step')) - 1 : (query().get('step') ? Number(query().get('step')) - 1 : (resume && hq?.get('resume') !== '0' ? resume.stepIndex : 0));

  function makeRunner() {
    runner = new LessonRunner({
      lesson, keyboard: kb, falling: fall, audio, input, log,
      options: {
        t, tx, noteName, noteHint: NOTE_HINT, patternHint: PATTERN_HINT,
        labels: () => (labelsHidden ? 'off' : store.settings.labels),
        revealNames: () => labelsHidden, // a hint may show a hidden name; a learner's own "Off" stays off

        waitMode: waitMode(), speed, hints: S.hints, practiceMode: mic ? 'mic' : 'touch', backing: S.backing,
      },
    });
    runner.on('step', ({ index }) => { renderDots(index); clearTags(); hidePhraseEnd(); coach.textContent = ''; coach.className = 'coach-slot'; });
    runner.on('card', (c) => showCard(c, (id) => runner.action(id)));
    runner.on('cardhide', hideCard);
    runner.on('bar', setBar);
    runner.on('skipnote', ({ show }) => { skipNote.style.display = show ? '' : 'none'; });
    runner.on('tag', showTag);
    runner.on('tagsclear', clearTags);
    runner.on('lane', ({ show }) => canvas.classList.toggle('on', show));
    runner.on('demo', ({ on }) => { el.classList.toggle('demo', on); skipNote.style.display = on ? '' : 'none'; skipNote.textContent = on ? t('demo.skip') : t('top.skip'); });
    runner.on('labels', ({ hidden }) => {
      labelsHidden = hidden;
      kb.setLabels(hidden ? 'off' : store.settings.labels); fall.setLabels(hidden ? 'off' : store.settings.labels);
      refreshLabelsBtn();
      if (hidden) showTag({ midi: kb.visibleRange().lo + 7, text: t('recall.labels_hidden'), kind: 'info', ms: 3000 });
    });
    runner.on('chips', (c) => renderChips(c));
    runner.on('speed', ({ speed: s }) => { speed = s; fall.setSpeed(s); });
    runner.on('phraseend', showPhraseEnd);
    runner.on('phraseendhide', hidePhraseEnd);
    runner.on('save', ({ stepIndex, recap, stepDone, skipped }) => {
      store.setResume({ lessonId: lesson.id, stepIndex, recap: recap || store.resume?.recap || null });
      if (stepDone && !skipped) days.markToday('lesson', lesson.colour);
    });
    runner.on('complete', (summary) => {
      store.setResume(null);
      store.markComplete(lesson.id, { cards: summary.cards, foundOwn: summary.foundOwn });
      if (summary.song) store.addSong(summary.song, lesson.id, summary.recording);
      go(`done/${lesson.id}`, { replace: true, data: summary });
    });
    return runner;
  }
  skipNote.addEventListener('click', () => runner.action(el.classList.contains('demo') ? 'skipdemo' : 'skipnote'));
  hintBtn.addEventListener('click', () => runner.action('hint'));

  function restartStep() { if (runner.paused) runner.resume(); log.event('step_restart', { step: runner.step?.id }); runner._enter(runner.index, { auto: true }); }
  runner = makeRunner();
  log.event('session_start', { viewport: `${innerWidth}x${innerHeight}`, orientation: innerWidth > innerHeight ? 'landscape' : 'portrait', standalone: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true, wait: waitMode(), mode: mic ? 'mic' : 'touch', labels: S.labels, lesson: lesson.id });
  runner.start(Math.max(0, Math.min(total - 1, startIndex)), { resumed: !!resume });

  // phrase-end card
  function showPhraseEnd({ headline, line, buttons, hear }) {
    hidePhraseEnd();
    peEl = showCard({ eyebrow: null, text: headline, note: line, buttons, className: '.phrase-end' }, (id) => { hidePhraseEnd(); runner.action(id); });
    if (hear) peEl.append(h('button.help-link', { type: 'button', on: { click: () => { hidePhraseEnd(); runner.action('hear'); } } }, t('phrase.hear')));
  }
  function hidePhraseEnd() { if (peEl) { peEl.remove(); peEl = null; } }

  // recall chips (01 §4.8)
  function renderChips(c) {
    if (!c) { chipsRow.style.display = 'none'; chipsRow.innerHTML = ''; return; }
    chipsRow.style.display = '';
    chipsRow.innerHTML = '';
    c.names.forEach((n, i) => {
      const done = i < c.index;
      chipsRow.append(h('span.nchip', { class: (done ? 'done' : '') + (i === c.index ? ' cur' : ''), style: done ? { background: NOTE_COLORS[c.letters[i]] } : {} }, n));
      if (i % 4 === 3 && i < c.names.length - 1) chipsRow.append(h('span.nsep', '·'));
    });
  }

  // "No sound?" chip (01 §10.3)
  const offTap = input.on('noteon', () => {
    setTimeout(() => { if (audio.state !== 'running') chip.style.display = ''; else chip.style.display = 'none'; }, 400);
  });

  // page hidden → pause; visible → "Paused · tap to continue" (01 §2.8)
  let pausedOverlay = null;
  const onVis = () => {
    if (document.visibilityState === 'hidden') {
      kb.releaseAll(); input.releaseAll();
      if (!sheetOpen) { runner.pause(); }
      log.event('leave_hidden', { step: runner.step?.id });
    } else if (!sheetOpen && runner.paused && !pausedOverlay) {
      pausedOverlay = h('button.paused-overlay', { type: 'button', on: { click: () => { pausedOverlay.remove(); pausedOverlay = null; audio.unlock(); runner.resume(); } } }, t('paused.overlay'));
      stage.append(pausedOverlay);
    }
  };
  document.addEventListener('visibilitychange', onVis);

  function leave() {
    log.event('leave', { lesson: lesson.id, step: runner.step?.id });
    runner.stop('leave');
    go('home', { data: { toast: t('toast.saved') } });
  }

  return {
    destroy() {
      document.removeEventListener('visibilitychange', onVis);
      removeEventListener('resize', layout);
      offTap();
      if (!runner.finished) runner.stop('leave');
      input.detachAll(); offKeys(); offMic?.();
      kb.destroy(); fall.destroy(); audio.allOff();
    },
  };
}

let probe = null;
function safeBottom() {
  if (!probe) { probe = document.createElement('div'); probe.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none'; document.body.append(probe); }
  return probe.getBoundingClientRect().height || 0;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pauseIcon = () => '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.5"/><rect x="13.5" y="5" width="4" height="14" rx="1.5"/></svg>';
const bulbIcon = () => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>';
const fsIcon = () => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
