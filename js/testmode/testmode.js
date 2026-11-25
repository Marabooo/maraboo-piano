// In-app test mode (?test=1&pid=T05[&m=1]) and 5-day study mode (?study=S03) — testing/06.
// Local only: no network, no audio, no personal data. Storage is namespaced by ns.js.
// The app's own event log (js/engine/log.js, namespaced too) is the data source; this module adds
// its own 'tm_*' events, the task bar, the full-screen test flow and the plain-text summaries (§8).
import { NS, wipeNamespace, rawStorage } from './ns.js';
import { TX, ABOUT, TASKS, FINAL_Q, STUDY_Q } from './texts.js';
import { STUDY_VARIANTS, STUDY_DAYS, AB_ENABLED, LESSON2_PLAYABLE, SEED_STREAK } from './study-config.js';
import { log } from '../engine/log.js';
import { audio } from '../engine/audio.js';
import { store } from '../app/store.js';
import { go } from '../app/router.js';
import { LESSONS } from '../lessons/index.js';
import { describe } from '../engine/notes.js';

const KEY = 'klang.tm';
const VERSION = () => window.klang?.version || '?';
const h = (tag, props = {}, ...kids) => {
  if (props == null || typeof props !== 'object' || props instanceof Node || Array.isArray(props)) { kids.unshift(props); props = {}; }
  const [name, ...cls] = tag.split('.');
  const el = document.createElement(name);
  if (cls.length) el.className = cls.join(' ');
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'on') for (const [e, f] of Object.entries(v)) el.addEventListener(e, f);
    else if (k === 'style') Object.assign(el.style, v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
};
const pad2 = (n) => String(n).padStart(2, '0');
const mss = (ms) => (ms == null || !isFinite(ms) ? '-' : `${Math.floor(ms / 60000)}:${pad2(Math.floor((ms % 60000) / 1000))}`);
const secs = (ms) => (ms == null || !isFinite(ms) ? '-' : String(Math.round(ms / 1000)));
const localDate = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const dayNum = (s) => Math.round(new Date(s + 'T12:00:00').getTime() / 86400000);
const q = new URLSearchParams(location.search);

let S = null;          // persisted state
let lang = 'en';
const T = (k, vars) => { const e = TX[k]; let s = Array.isArray(e) ? (lang === 'ro' ? e[1] : e[0]) : k; for (const [a, b] of Object.entries(vars || {})) s = s.replace(`{${a}}`, b); return s; };
const L = (pair) => (lang === 'ro' ? pair[1] : pair[0]);
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* */ } };
const ev = (type, data = {}) => log.event('tm_' + type, data);
const inputTimes = [];

function device() {
  const ua = navigator.userAgent;
  const touch = navigator.maxTouchPoints > 0;
  const small = Math.min(screen.width, screen.height) < 600;
  const os = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && touch) ? 'iOS' : /Android/.test(ua) ? 'Android' : 'other';
  const browser = /SamsungBrowser/.test(ua) ? 'Samsung' : /CriOS|Chrome/.test(ua) && !/Edg/.test(ua) ? 'Chrome' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'other';
  return { cls: touch ? (small ? 'phone' : 'tablet') : 'desktop', os, browser,
    standalone: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
    inapp: /FBAN|FBAV|Instagram/.test(ua), w: screen.width, h: screen.height };
}

// ---------- study day logic (06 §6.5) ----------
function todayStr() {
  if (NS.mode === 'study' && /^X/.test(NS.code) && q.get('dev') === '1' && /^\d{4}-\d\d-\d\d$/.test(q.get('today') || '')) return q.get('today');
  return localDate();
}
function dayIndex(dateStr = todayStr()) {
  if (!S?.day1) return 0;
  const d = dayNum(dateStr) - dayNum(S.day1) + 1;
  return d;
}
const evDay = (e) => e.d ?? (S?.day1 ? dayNum(localDate(new Date(e.at))) - dayNum(S.day1) + 1 : 0);

// ---------- boot ----------
export function startTestMode() {
  if (!NS.mode) return null;
  try { S = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { S = null; }
  if (q.get('reset') === '1' && NS.mode === 'test' && confirm('Reset this test session on this phone?')) { wipeNamespace(); S = null; location.replace(location.pathname + '?test=1' + (q.get('pid') ? '&pid=' + q.get('pid') : '') + (q.get('m') ? '&m=1' : '')); return null; }
  const firstLang = q.get('lang') || ((navigator.language || '').toLowerCase().startsWith('ro') ? 'ro' : 'en');
  if (!S) {
    S = { v: 1, mode: NS.mode, code: NS.code || randomCode(), m: q.get('m') === '1', lang: firstLang, phase: NS.mode === 'test' ? 'welcome' : 'sm1',
      about: {}, tasks: {}, final: {}, taskIdx: 0, startedAt: new Date().toISOString(), dayStats: {}, checkins: {}, maxDay: 0 };
    if (NS.mode === 'study' && device().standalone && !NS.code) S.storageReset = true;
    save();
  }
  lang = S.lang;
  store.set('lang', lang === 'ro' ? 'ro' : 'en');
  store.set('labels', store.settings.labels === 'solfege' && S.phase !== 'app' && !S.tasks.T2 ? 'letters' : store.settings.labels);
  if (NS.mode === 'study') {
    const variant = AB_ENABLED ? (STUDY_VARIANTS[S.code] || 'a') : 'a';
    S.variant = variant;
    if (AB_ENABLED && !STUDY_VARIANTS[S.code]) S.codeNotInList = true;
    store.set('completionVariant', variant === 'b' ? 'B' : 'A');
    if (!S.finished) rawStorage.set(NS.ACTIVE_STUDY, JSON.stringify({ code: S.code }));
  } else store.set('completionVariant', 'A');
  save();

  // capture: day index on every event, input times, errors, orientation
  log.subscribe((e) => {
    if (NS.mode === 'study' && S.day1 && e.d == null) e.d = dayIndex();
    if (['note_accepted', 'wrong', 'near_miss'].includes(e.type)) inputTimes.push(Date.now());
  });
  document.addEventListener('pointerdown', () => { inputTimes.push(Date.now()); lastInput = Date.now(); }, { capture: true, passive: true });
  addEventListener('error', (e) => log.event('error', { msg: String(e.message || '').slice(0, 80) }));
  addEventListener('unhandledrejection', (e) => log.event('error', { msg: String(e.reason?.message || e.reason || '').slice(0, 80) }));
  matchMedia('(orientation: portrait)').addEventListener?.('change', (m) => log.event('orientation', { value: m.matches ? 'portrait' : 'landscape' }));
  addEventListener('hashchange', onScreen);
  document.addEventListener('visibilitychange', onVisibility);
  if (NS.mode === 'study') { setInterval(tickActive, 15000); onVisibility(); }
  ev('session_open', { mode: NS.mode, phase: S.phase, ...(() => { const d = device(); return { device: d.cls, os: d.os, browser: d.browser, w: d.w, h: d.h, standalone: d.standalone, inapp: d.inapp }; })() });

  if (NS.mode === 'study' && S.day1 && !S.finished) {
    const d = dayIndex();
    if (d < S.maxDay) S.clockIssue = true;
    S.maxDay = Math.max(S.maxDay, d);
    if (d >= STUDY_DAYS + 1 && S.phase === 'app') { S.phase = 'sm4'; log.event('day6_open'); }
    save();
  }
  render();
  return { state: () => S };
}

function randomCode() { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from({ length: 4 }, () => a[Math.floor(Math.random() * a.length)]).join(''); }

// ---------- layout roots ----------
let root = null, bar = null, panel = null, chip = null, checkinEl = null, lastInput = 0;
function ensureRoots() {
  if (!root) { root = h('div#tm-root'); root.id = 'tm-root'; document.body.append(root); }
}
function fullScreen(...kids) {
  ensureRoots();
  root.innerHTML = '';
  root.className = 'tm-full';
  const box = h('div.tm-box', ...kids);
  root.append(box);
  root.scrollTop = 0;
  return box;
}
function clearFull() { if (root) { root.innerHTML = ''; root.className = ''; } }
const btn = (label, onClick, cls = '') => h('button.tm-btn' + (cls ? '.' + cls : ''), { type: 'button', on: { click: onClick } }, label);
const scale7 = (lo, hi, value, onPick) => {
  const row = h('div.tm-scale');
  for (let i = 1; i <= 7; i++) row.append(h('button.tm-num', { type: 'button', 'aria-pressed': String(value === i), on: { click: (e) => { [...row.children].forEach((b) => b.setAttribute('aria-pressed', 'false')); e.target.setAttribute('aria-pressed', 'true'); onPick(i); } } }, String(i)));
  return h('div', row, h('div.tm-ends', h('span', lo), h('span', hi)));
};
const textArea = (value, onInput) => h('textarea.tm-text', { maxlength: 500, placeholder: T('optional_ph'), on: { input: (e) => onInput(e.target.value.slice(0, 500)) } }, value || '');

// ---------- flow ----------
function setPhase(p) { S.phase = p; save(); render(); }

function render() {
  hideBar();
  const p = S.phase;
  if (p === 'app' || p === 'task') { clearFull(); if (p === 'task') showBar(); onScreen(); return; }
  if (p === 'welcome' || p === 'sm1') return welcome();
  if (p === 'consent' || p === 'sm2') return consent();
  if (p === 'declined') return fullScreen(h('p.tm-lead', T('declined')));
  if (p === 'about') return about();
  if (p === 'sound') return sound();
  if (p === 'intro') return taskIntro();
  if (p === 'after') return afterTask();
  if (p === 'final') return finalQs();
  if (p === 'sm4') return fullScreen(h('p.tm-lead', T('sm4')), btn(T('finish'), () => setPhase('final'), 'primary'));
  if (p === 'summary') return summaryScreen();
  if (p === 'deleted') return fullScreen(h('p.tm-lead', T('deleted')));
}

function welcome() {
  const study = NS.mode === 'study';
  const langSw = h('div.tm-lang', ...['en', 'ro'].map((l) => h('button.tm-chip', { type: 'button', 'aria-pressed': String(lang === l), on: { click: () => { lang = S.lang = l; store.set('lang', l); save(); render(); } } }, l.toUpperCase())));
  fullScreen(langSw, h('span.tm-tag', study ? 'STUDY' : 'TEST'),
    h('h1', study ? T('sm1_title') : T('welcome_title')),
    h('p', study ? T('sm1_body') : T('welcome_body')),
    h('p.tm-muted', study ? T('sm1_link') : T('welcome_tip')),
    device().inapp ? h('p.tm-warn', T('inapp')) : null,
    btn(T('next'), () => setPhase(study ? 'sm2' : 'consent'), 'primary'));
}

function consent() {
  const study = NS.mode === 'study';
  const bullets = study ? TX.sm2_b : TX.consent_b;
  fullScreen(h('h1', T('consent_title')), h('ul.tm-list', bullets.map((b) => h('li', L(b)))),
    btn(T('agree'), () => {
      const d = device();
      ev('consent', { yes: true });
      ev('session_start', { version: VERSION(), mode: NS.mode, lang, device: d.cls, os: d.os, browser: d.browser, w: d.w, h: d.h, standalone: d.standalone, inapp: d.inapp });
      S.consentAt = new Date().toISOString();
      if (study) { S.day1 = todayStr(); S.maxDay = 1; }
      setPhase('about');
    }, 'primary'),
    btn(T('decline'), () => { wipeNamespace(); rawStorage.remove(NS.ACTIVE_STUDY); S = { phase: 'declined', lang }; render(); }));
}

function about() {
  const a = S.about;
  const nextB = btn(T('next'), () => { ev('about', { ...a, why: undefined }); setPhase('sound'); }, 'primary');
  const update = () => { nextB.disabled = !ABOUT.filter((x) => !x.optional).every((x) => a[x.key]); save(); };
  const items = ABOUT.map((it) => h('div.tm-q', h('p.tm-qt', L(it.q)),
    h('div.tm-chips', it.opts.map(([v, en, ro]) => h('button.tm-chip', { type: 'button', 'aria-pressed': String(a[it.key] === v), on: { click: (e) => { a[it.key] = v; [...e.target.parentNode.children].forEach((b) => b.setAttribute('aria-pressed', String(b === e.target))); update(); } } }, lang === 'ro' ? ro : en))),
    it.why && !S.m ? h('div', h('p.tm-muted', L(it.why)), textArea(a.why, (v) => { a.why = v; save(); })) : null));
  fullScreen(h('h1', T('about_title')), ...items, nextB);
  update();
}

function sound() {
  let tries = 0;
  const after = h('div');
  const playB = btn(T('sound_play'), () => { audio.unlock(); audio.playNote(60, 0.9); tries++; yesNo.style.display = ''; }, 'primary');
  const yesNo = h('div.tm-row', { style: { display: 'none' } },
    btn(T('sound_yes'), () => finish('heard')),
    btn(T('sound_no'), () => { after.innerHTML = ''; after.append(h('p', T('sound_after_no')), h('div.tm-row', btn(T('sound_retry'), () => { after.innerHTML = ''; playB.click(); }), btn(T('sound_without'), () => finish('continued_without')))); }));
  const finish = (r) => { S.sound = r === 'heard' ? (tries > 1 ? 'heard' : 'heard') : r === 'continued_without' ? 'continued without' : 'not heard'; ev('soundcheck', { result: r, tries, mitigation: audio.silentMitigation }); if (NS.mode === 'study') { setPhase('app'); go('home', { replace: true }); } else { S.taskIdx = 0; setPhase('intro'); } };
  fullScreen(h('p.tm-lead', T('sound_text')), playB, yesNo, after);
}

// ---------- tasks ----------
const task = () => TASKS[S.taskIdx];
const taskText = (t) => L(t.id === 'T4' ? (S.m ? t.textM : LESSON2_PLAYABLE ? t.text : t.textL1) : t.text);

function taskIntro() {
  const t = task();
  fullScreen(h('span.tm-tag', 'TEST'), h('p.tm-eyebrow', T('task_header', { n: S.taskIdx + 1 })), h('p.tm-lead', taskText(t)), h('p.tm-muted', T('task_note')),
    btn(T('start'), startTask, 'primary'));
}

function startTask() {
  const t = task();
  const rec = S.tasks[t.id] = S.tasks[t.id] || {};
  if (!rec.start) {
    rec.start = new Date().toISOString();
    rec.labelsStart = store.settings.labels;
    if (t.id === 'T6' && store.settings.practiceMode === 'mic') { store.set('practiceMode', 'touch'); ev('setup_mode_reset'); }
    if (t.id === 'T2' && store.settings.labels === 'solfege') { store.set('labels', 'letters'); ev('labels_reset'); }
  }
  ev('task_start', { task: t.id });
  S.phase = 'task'; save();
  clearFull();
  go('home', { replace: true });
  showBar();
}

function showBar() {
  const t = task();
  document.body.classList.add('tm-bar-on');
  bar?.remove();
  const label = h('button.tm-bar-text', { type: 'button', 'aria-label': T('show_task'), on: { click: togglePanel } }, taskText(t));
  bar = h('div#tm-bar', h('span.tm-tag', 'TEST'), h('span.tm-n', `${S.taskIdx + 1}/6`), label,
    h('button.tm-bar-done', { type: 'button', on: { click: () => endTask('done') } }, T('done')),
    h('button.tm-bar-stuck', { type: 'button', on: { click: () => endTask('stuck') } }, T('stuck')));
  bar.id = 'tm-bar';
  document.body.append(bar);
}
function hideBar() { bar?.remove(); bar = null; panel?.remove(); panel = null; document.body.classList.remove('tm-bar-on'); }
function togglePanel() {
  if (panel) { panel.remove(); panel = null; return; }
  const kb = document.querySelector('.kb');
  const maxBottom = kb ? kb.getBoundingClientRect().top - 8 : innerHeight * 0.4 + 44;
  panel = h('div.tm-panel', { on: { click: togglePanel } }, taskText(task()));
  panel.style.maxHeight = Math.max(60, Math.min(innerHeight * 0.4, maxBottom - bar.getBoundingClientRect().bottom)) + 'px';
  document.body.append(panel);
  const close = () => { if (panel) { panel.remove(); panel = null; } document.removeEventListener('pointerdown', onKey, true); };
  const onKey = (e) => { if (e.target.closest?.('.kb')) close(); };
  document.addEventListener('pointerdown', onKey, true);
  setTimeout(close, 8000);
}

function endTask(outcome) {
  const t = task();
  const rec = S.tasks[t.id];
  rec.end = new Date().toISOString();
  rec.outcome = outcome;
  rec.auto = autoCheck(t.id, rec);
  rec.pauses = pauses(rec);
  rec.labelsEnd = store.settings.labels;
  ev('task_end', { task: t.id, outcome, auto: rec.auto });
  setPhase('after');
}

function afterTask() {
  const t = task();
  const rec = S.tasks[t.id];
  rec.answers = rec.answers || {};
  const A = rec.answers;
  const kids = [];
  if (rec.outcome === 'done') kids.push(h('button.tm-link', { type: 'button', on: { click: () => { ev('task_reopened', { task: t.id }); delete rec.end; S.phase = 'task'; save(); clearFull(); showBar(); } } }, T('oops')));
  kids.push(h('p.tm-qt', T('seq')), scale7(T('seq_lo'), T('seq_hi'), rec.seq, (v) => { rec.seq = v; ev('seq', { task: t.id, v }); save(); }));
  if (rec.outcome === 'stuck') {
    if (!S.m) kids.push(h('p.tm-qt', T('stuck_q')), textArea(A.stuck, (v) => { A.stuck = v; save(); }));
  } else if (t.id === 'T1') {
    if (!S.m) kids.push(h('p.tm-qt', T('t1_cannow')), textArea(A.cannow, (v) => { A.cannow = v; save(); }));
    kids.push(h('p.tm-qt', T('t1_progress')), scale7(T('agree_lo'), T('agree_hi'), rec.progress, (v) => { rec.progress = v; ev('progress', { v }); save(); }));
    kids.push(h('p.tm-qt', T('t1_pace')), h('div.tm-chips', TX.pace_opts.map(([en, ro, v]) => h('button.tm-chip', { type: 'button', 'aria-pressed': String(rec.pace === v), on: { click: (e) => { rec.pace = v; [...e.target.parentNode.children].forEach((b) => b.setAttribute('aria-pressed', String(b === e.target))); save(); } } }, lang === 'ro' ? ro : en))));
    if (!S.m && store.settings.completionVariant !== 'B') kids.push(h('p.tm-qt', T('t1_true')), textArea(A.trueq, (v) => { A.trueq = v; save(); }));
  } else if (!S.m && t.q) kids.push(h('p.tm-qt', L(t.q)), textArea(A.q, (v) => { A.q = v; save(); }));
  kids.push(btn(T('next'), () => {
    ev('answer', { task: t.id });
    S.taskIdx++;
    if (S.taskIdx >= TASKS.length) setPhase(S.m ? 'summary' : 'final');
    else setPhase('intro');
  }, 'primary'));
  fullScreen(h('p.tm-eyebrow', T('task_header', { n: S.taskIdx + 1 })), ...kids);
}

function finalQs() {
  const study = NS.mode === 'study';
  const F = S.final;
  const kids = [h('h1', study ? T('finish') : T('final_title')), h('p.tm-muted', study ? T('m_note') : T('final_note'))];
  for (const item of study ? STUDY_Q : FINAL_Q) {
    const [id, en, ro, lo, hi] = item;
    kids.push(h('p.tm-qt', lang === 'ro' ? ro : en));
    if (lo) kids.push(scale7(L(lo), L(hi), F[id], (v) => { F[id] = v; save(); }));
    else kids.push(textArea(F[id], (v) => { F[id] = v; save(); }));
  }
  kids.push(btn(T('see_summary'), () => {
    if (study) { S.finished = true; S.finishedDay = dayIndex(); rawStorage.set(NS.ACTIVE_STUDY, JSON.stringify({ code: S.code, finished: true })); }
    setPhase('summary');
  }, 'primary'));
  fullScreen(...kids);
}

function summaryScreen() {
  const text = NS.mode === 'study' ? studySummary() : testSummary();
  ev('summary_shown');
  const ta = h('textarea.tm-summary', { readonly: true }, text);
  const status = h('p.tm-muted');
  const copyB = btn(T('copy'), async () => {
    try { await navigator.clipboard.writeText(text); copyB.textContent = T('copied'); ev('summary_shared', { method: 'copy' }); }
    catch { ta.select(); status.textContent = T('hold_copy'); ev('summary_shared', { method: 'manual' }); }
  });
  const shareB = navigator.share ? btn(T('send'), async () => { try { await navigator.share({ text }); ev('summary_shared', { method: 'share' }); } catch { /* cancelled */ } }, 'primary') : null;
  const good = NS.mode === 'study' ? T('good_study') + (AB_ENABLED ? ' ' + T('good_study_ab') : '') : T('good_test');
  const del = btn(T('delete'), () => {
    if (!confirm(T('delete_confirm'))) return;
    ev('data_deleted');
    wipeNamespace(); rawStorage.remove(NS.ACTIVE_STUDY);
    S = { phase: 'deleted', lang }; render();
  }, 'danger');
  const logB = S.m ? btn(T('copy_log'), async () => { try { await navigator.clipboard.writeText(log.exportJSON()); status.textContent = T('copied'); } catch { status.textContent = T('hold_copy'); } }) : null;
  fullScreen(h('h1', T('thanks')), h('p', T('summary_text')), ta, h('div.tm-row', shareB, copyB), status, logB, h('p.tm-muted', good), del);
}

// ---------- auto-checks (06 §5.1) ----------
const inWin = (rec) => log.events((e) => { const t = Date.parse(e.at); return t >= Date.parse(rec.start) && t <= (rec.end ? Date.parse(rec.end) : Date.now()); });
function autoCheck(id, rec) {
  const E = inWin(rec);
  const has = (type, f = () => true) => E.some((e) => e.type === type && f(e));
  switch (id) {
    case 'T1': return has('lesson_complete', (e) => e.lesson === 'L1') ? 'yes' : 'no';
    case 'T2': return store.settings.labels === 'solfege' ? 'yes' : 'no';
    case 'T3': { const r = E.filter((e) => e.type === 'kb_range'); return r.length > 1 && Math.max(...r.map((e) => e.hi)) > r[0].hi ? 'yes' : 'no'; }
    case 'T4': {
      const hid = E.findIndex((e) => e.type === 'app_hidden' && e.inLesson);
      if (hid < 0) return 'no';
      const left = [...E.slice(0, hid)].reverse().find((e) => e.type === 'step_start');
      const after = E.slice(hid);
      const st = after.find((e) => e.type === 'step_start');
      const notes = after.filter((e) => e.type === 'note_accepted').length;
      return notes >= 1 && (!left || !st || st.index >= left.index) ? 'yes' : 'no';
    }
    case 'T5': return has('game_opened') && (has('game_solved') || has('game_played')) ? 'yes' : 'no';
    case 'T6': return store.settings.practiceMode === 'mic' || has('mode_choice', (e) => e.mode === 'mic') ? 'yes' : 'no';
  }
  return 'no';
}
function pauses(rec) {
  const a = Date.parse(rec.start), b = Date.parse(rec.end);
  const t = [a, ...inputTimes.filter((x) => x >= a && x <= b), b].sort((x, y) => x - y);
  let n = 0, longest = 0;
  for (let i = 1; i < t.length; i++) { const g = t[i] - t[i - 1]; if (g >= 5000) { n++; longest = Math.max(longest, g); } }
  return { n, longest };
}
function visibleMs(rec, E) {
  let hidden = 0, hAt = null;
  for (const e of E) { if (e.type === 'app_hidden') hAt = Date.parse(e.at); if (e.type === 'app_visible' && hAt) { hidden += Date.parse(e.at) - hAt; hAt = null; } }
  return Date.parse(rec.end) - Date.parse(rec.start) - hidden;
}

// ---------- summaries (06 §8) ----------
const qa = (s) => `"${(s || '-').replace(/\s+/g, ' ').trim() || '-'}"`;
function countBy(arr) { const m = {}; arr.forEach((x) => { m[x] = (m[x] || 0) + 1; }); return Object.entries(m).map(([k, v]) => `${k} x${v}`).join(', ') || '-'; }
const CONTROL_TYPES = { labels_change: (e) => 'labels', keys_change: (e) => (e.how === 'higher' ? 'octaveUp' : e.how === 'lower' ? 'octaveDown' : 'map'), size_change: (e) => 'size:' + e.size, sheet_open: (e) => 'open:' + e.kind, setting: (e) => 'setting:' + e.key, action: (e) => 'action:' + e.id, mode_choice: (e) => 'mode', screen: (e) => (e.name === 'settings' ? 'settings' : null) };
const controlsOf = (E) => countBy(E.map((e) => CONTROL_TYPES[e.type]?.(e)).filter(Boolean));

function testSummary() {
  const d = device();
  const all = log.events();
  const first = all.find((e) => e.type === 'tm_session_start') || all[0];
  const startAt = new Date(S.consentAt || S.startedAt);
  const total = Date.now() - startAt;
  const orients = all.filter((e) => e.type === 'orientation');
  const a = S.about;
  const lines = [
    'KLANG TEST SUMMARY v1',
    `ID ${S.code} | app ${VERSION()} | ${S.m ? 'moderated' : 'remote'} | lang ${lang.toUpperCase()}`,
    `Started ${localDate(startAt)} ${pad2(startAt.getHours())}:${pad2(startAt.getMinutes())} | total ${mss(total)}`,
    `Device ${d.cls}, ${d.os}, ${d.browser}, ${d.standalone ? 'installed' : 'browser tab'}${d.inapp ? ', in-app browser' : ''}`,
    `Screen ${d.w}x${d.h} | rotations ${orients.length} | now ${innerWidth > innerHeight ? 'landscape' : 'portrait'}`,
    `Sound check ${S.sound || '-'}`,
    `About piano=${a.piano || '-'} other=${a.other || '-'} home=${a.home || '-'} school=${a.school || '-'} knowsC=${a.knowsC || '-'} matters=${a.matters || '-'} apps=${a.apps || '-'} age=${a.age || '-'}`,
    `  why piano matters: ${qa(S.m ? '-' : a.why)}`,
    '',
  ];
  for (const t of TASKS) {
    const r = S.tasks[t.id];
    if (!r || !r.start) { lines.push(`${t.id} ${t.name} | not started`); continue; }
    const E = inWin(r);
    const tsOf = (e) => Date.parse(e.at) - Date.parse(r.start);
    const head = `${t.id} ${t.name} | ${r.outcome === 'stuck' ? 'STUCK' : r.end ? 'DONE' : '-'} | ${mss(Date.parse(r.end) - Date.parse(r.start))} (visible ${mss(visibleMs(r, E))}) | auto ${r.auto || '-'} | SEQ ${r.seq || '-'}`;
    const ans = (k) => qa(S.m ? '-' : (r.outcome === 'stuck' ? r.answers?.stuck : r.answers?.[k]));
    if (t.id === 'T1') {
      lines.push(`${head} | progress ${r.progress || '-'} | pace ${r.pace || '-'}`);
      const mc = E.filter((e) => e.type === 'mode_choice');
      lines.push(`  mode ${store.settings.practiceMode === 'mic' ? 'mic' : 'tap'} chosen after ${mc[0] ? secs(tsOf(mc[0])) : '-'}s, switched ${Math.max(0, mc.length - 1)}x`);
      const steps = [];
      for (const st of E.filter((e) => e.type === 'step_start' && e.lesson === 'L1')) {
        const end = E.find((e) => e.type === 'step_end' && e.stepId === st.stepId && Date.parse(e.at) >= Date.parse(st.at));
        const win = E.filter((e) => Date.parse(e.at) >= Date.parse(st.at) && (!end || Date.parse(e.at) <= Date.parse(end.at)) && e.stepId === st.stepId);
        const ok = win.filter((e) => e.type === 'note_accepted'), waits = ok.filter((e) => e.waitedMs > 0);
        steps.push(`${st.stepId} ${end ? mss(end.ms) : '-'} R${ok.length} W${win.filter((e) => e.type === 'wrong' || e.type === 'near_miss').length} H${win.filter((e) => e.type === 'hint' && e.level <= 3).length} waits ${waits.length}/${waits.length ? (waits.reduce((s, e) => s + e.waitedMs, 0) / waits.length / 1000).toFixed(1) : 0}s`);
      }
      lines.push(`  steps ${steps.join('; ') || '-'}`);
      const wr = E.filter((e) => (e.type === 'wrong' || e.type === 'near_miss') && e.lesson === 'L1');
      lines.push(`  wrong notes ${wr.slice(0, 12).map((e) => `${e.played}>${e.target || '?'}`).join(', ') || '-'}`);
      let fixed = 0; E.forEach((e, i) => { if (e.type === 'wrong' || e.type === 'near_miss') { const n = E.slice(i + 1).find((x) => ['note_accepted', 'wrong', 'near_miss'].includes(x.type)); if (n?.type === 'note_accepted') fixed++; } });
      lines.push(`  fixed on next press ${fixed}/${wr.length} | exits after mistake ${E.filter((e) => e.type === 'lesson_abandon' && e.afterMistake).length}`);
      const ds = E.find((e) => e.type === 'done_screen' && e.lesson === 'L1'), ch = E.find((e) => e.type === 'done_choice' && e.lesson === 'L1');
      lines.push(`  completion seen ${ds ? secs((ch ? Date.parse(ch.at) : Date.parse(r.end)) - Date.parse(ds.at)) + 's' : '-'} | choice ${ch ? (ch.choice === 'again' ? 'replay' : ch.choice) : 'none'} after ${ch ? secs(ch.ms) + 's' : '-'} | variant ${ds?.variant === 'B' ? 'b' : 'a'}`);
      lines.push(`  pauses5 ${r.pauses?.n ?? '-'} (longest ${secs(r.pauses?.longest)}s) | controls ${controlsOf(E)}`);
      lines.push(`  can now: ${ans('cannow')}`);
      lines.push(`  true and deserved?: ${ans('trueq')}`);
      continue;
    }
    if (t.id === 'T2') {
      const firstL = E.find((e) => (e.type === 'sheet_open' && e.kind === 'labels') || e.type === 'labels_change' || (e.type === 'setting' && e.key === 'labels'));
      lines.push(head, `  labels ${r.labelsStart}->${r.labelsEnd} | first labels tap after ${firstL ? secs(tsOf(firstL)) + 's' : '-'} | control taps ${controlsOf(E)} | pauses5 ${r.pauses?.n ?? '-'}`);
    } else if (t.id === 'T3') {
      const rg = E.filter((e) => e.type === 'kb_range');
      const nm = (m) => describe(m).ascii;
      lines.push(`${head} | used ${controlsOf(E.filter((e) => ['keys_change', 'size_change'].includes(e.type)))} | range ${rg[0] ? nm(rg[0].lo) + '-' + nm(rg[0].hi) : '-'}->${rg.length ? nm(rg[rg.length - 1].lo) + '-' + nm(rg[rg.length - 1].hi) : '-'} | pauses5 ${r.pauses?.n ?? '-'}`);
    } else if (t.id === 'T4') {
      const hid = E.filter((e) => e.type === 'app_hidden');
      const firstHid = E.findIndex((e) => e.type === 'app_hidden');
      const leftStep = firstHid >= 0 ? [...E.slice(0, firstHid)].reverse().find((e) => e.type === 'step_start') : null;
      const after = firstHid >= 0 ? E.slice(firstHid) : [];
      const backStep = after.find((e) => e.type === 'step_start');
      let hiddenMs = 0, hAt = null; for (const e of E) { if (e.type === 'app_hidden') hAt = Date.parse(e.at); if (e.type === 'app_visible' && hAt) { hiddenMs += Date.parse(e.at) - hAt; hAt = null; } }
      lines.push(`${head} | left app ${hid.length}x (${secs(hiddenMs)}s) at ${leftStep ? leftStep.lesson + '/' + leftStep.stepId : '-'} | back at ${backStep ? backStep.lesson + '/' + backStep.stepId : after.find((e) => e.type === 'screen')?.name || '-'} | same place ${leftStep && backStep ? (backStep.index >= leftStep.index && backStep.lesson === leftStep.lesson ? 'yes' : 'no') : '-'} | notes after return ${after.filter((e) => e.type === 'note_accepted').length}`);
    } else if (t.id === 'T5') {
      const go1 = E.find((e) => e.type === 'game_opened');
      lines.push(`${head} | seeded ${SEED_STREAK ? 'yes' : 'no'} | game opened after ${go1 ? secs(tsOf(go1)) + 's' : '-'} | rounds ${E.filter((e) => e.type === 'game_solved').length} | streak seen ${E.some((e) => e.type === 'days_open') ? 'yes' : 'no'}`);
    } else if (t.id === 'T6') {
      const mic = E.find((e) => e.type === 'mode_choice' && e.mode === 'mic');
      const ms = E.find((e) => e.type === 'mic_start'), me = E.find((e) => e.type === 'mic_error');
      const back = mic && E.some((e) => Date.parse(e.at) > Date.parse(mic.at) && ((e.type === 'mode_choice' && e.mode === 'touch') || (e.type === 'setting' && e.key === 'practiceMode' && e.value === 'touch')));
      lines.push(`${head} | mode mic selected ${mic ? 'yes' : 'no'} after ${mic ? secs(tsOf(mic)) + 's' : '-'} | mic ${ms ? 'granted' : me ? (me.code === 'denied' ? 'denied' : 'error') : 'not asked'} | notes heard ${E.filter((e) => e.type === 'mic_note').length} | back to tap ${back ? 'yes' : 'no'}`);
    }
    lines.push(`  answer: ${ans('q')}`);
  }
  lines.push('(stuck tasks: answer = "what were you trying to do")', '');
  if (!S.m) {
    lines.push('FINAL');
    for (const [id] of FINAL_Q) if (id !== 'Q2b') lines.push(`${id} ${qa(S.final[id])}${id === 'Q2' ? ` | Q2b ${S.final.Q2b || '-'}` : ''}`);
  }
  const errs = all.filter((e) => e.type === 'error');
  lines.push(`OTHER left app ${all.filter((e) => e.type === 'app_hidden' && Date.parse(e.at) >= startAt).length}x | errors ${errs.length}${errs[0] ? ': ' + errs[0].msg : ''}`, 'END');
  void first;
  return lines.join('\n');
}

function studySummary() {
  const d = device();
  const E = log.events().filter((e) => S.day1 && Date.parse(e.at) >= Date.parse(S.consentAt || S.startedAt));
  const a = S.about;
  const rows = [];
  const completedBefore = new Set();
  let totals = { active: 0, ret: 0, lessonLed: 0, gameThen: 0, gameOnly: 0, openedOnly: 0, done: [], next: 0, completions: 0, replays: 0, gameDays: 0 };
  for (let day = 1; day <= STUDY_DAYS; day++) {
    const D = E.filter((e) => evDay(e) === day);
    const opened = D.some((e) => ['app_open', 'app_visible', 'tm_session_open'].includes(e.type));
    const ls = D.filter((e) => e.type === 'lesson_start'), lc = D.filter((e) => e.type === 'lesson_complete');
    const gs = D.filter((e) => e.type === 'game_opened');
    const firstAct = D.find((e) => e.type === 'lesson_start' || e.type === 'game_opened');
    const first = firstAct ? (firstAct.type === 'lesson_start' ? 'L' : 'G') : '-';
    const ch = D.filter((e) => e.type === 'done_choice');
    const c = (k) => ch.filter((x) => x.choice === k).length;
    const replays = ls.filter((e) => completedBefore.has(e.lesson)).length;
    lc.forEach((e) => completedBefore.add(e.lesson));
    let g2l = 0;
    D.forEach((e) => { if (e.type === 'lesson_start') { const t = Date.parse(e.at); if (D.some((g) => (g.type === 'game_solved' || g.type === 'game_exit') && t - Date.parse(g.at) >= 0 && t - Date.parse(g.at) <= 600000)) g2l++; } });
    const wrong = D.filter((e) => e.type === 'wrong' || e.type === 'near_miss').length, right = D.filter((e) => e.type === 'note_accepted').length;
    const st = S.dayStats[day] || {};
    const active = ls.length || gs.length;
    if (active) totals.active++;
    if (day >= 2) {
      if (active) { totals.ret++; if (first === 'L') totals.lessonLed++; else if (ls.length || g2l) totals.gameThen++; else totals.gameOnly++; }
      else if (opened) totals.openedOnly++;
    }
    totals.done.push(...lc.map((e) => e.lesson)); totals.next += c('next'); totals.completions += lc.length; totals.replays += replays; if (gs.length) totals.gameDays++;
    const uniq = (arr) => [...new Set(arr)].join(',') || '-';
    rows.push([day, opened ? 'yes' : 'no', st.sessions || (opened ? 1 : 0), Math.round((st.activeMs || 0) / 60000), first,
      `${uniq(ls.map((e) => e.lesson))}>${uniq(lc.map((e) => e.lesson))}`, `${c('next')}/${c('done')}/${c('again')}/${Math.max(0, lc.length - ch.length)}`,
      replays, D.filter((e) => e.type === 'game_played').length, g2l, D.filter((e) => e.type === 'days_open' || e.type === 'game_solved').length,
      `${wrong}/${right}`, D.filter((e) => e.type === 'lesson_abandon' && e.afterMistake).length, S.checkins[day] ?? '-'].join(' '));
  }
  return [
    'KLANG STUDY SUMMARY v1',
    `Code ${S.code} | cfg ${S.variant || 'a'} | app ${VERSION()} | lang ${lang.toUpperCase()}${S.codeNotInList ? ' | code_not_in_list' : ''}`,
    `Day 1 ${S.day1 || '-'} | finished on day ${S.finishedDay || '-'} | storage reset ${S.storageReset ? 'yes' : 'no'} | clock issue ${S.clockIssue ? 'yes' : 'no'}`,
    `Device ${d.cls}, ${d.os}, ${d.browser}, ${d.standalone ? 'installed' : 'browser tab'}`,
    `About piano=${a.piano || '-'} other=${a.other || '-'} home=${a.home || '-'} school=${a.school || '-'} knowsC=${a.knowsC || '-'} matters=${a.matters || '-'} apps=${a.apps || '-'} age=${a.age || '-'}`,
    `Lessons available in this version: ${LESSONS.length}`,
    '',
    'DAY OPEN SESS MIN FIRST LESSONS(start>done) CHOICES(next/done/replay/none) REPLAYS GAME G>L STREAK-VIEWS WRONG/RIGHT EXIT-AFTER-MISTAKE CHECKIN',
    ...rows,
    '',
    `TOTAL active days ${totals.active}/${STUDY_DAYS} | return days (2-5) ${totals.ret}/${STUDY_DAYS - 1} = lesson-led ${totals.lessonLed} + game-led then lesson ${totals.gameThen} + game-only ${totals.gameOnly} | opened-only days ${totals.openedOnly}`,
    `lessons done ${totals.done.length} (${[...new Set(totals.done)].join(', ') || '-'}) | next-lesson choices ${totals.next}/${totals.completions} | replays ${totals.replays} | game days ${totals.gameDays}`,
    '',
    'FINAL',
    ...STUDY_Q.map(([id, , , lo]) => `${id} ${lo ? (S.final[id] || '-') : qa(S.final[id])}`),
    'END',
  ].join('\n');
}

// ---------- study: activity, sessions, home chip, check-in ----------
let visibleSince = null;
function onVisibility() {
  if (NS.mode !== 'study' || !S?.day1 || S.finished) return;
  const day = dayIndex();
  const st = (S.dayStats[day] ||= { sessions: 0, activeMs: 0 });
  if (document.visibilityState === 'visible') {
    if (!S.lastHiddenAt || Date.now() - S.lastHiddenAt >= 30 * 60000 || st.sessions === 0) st.sessions++;
    visibleSince = Date.now();
  } else { S.lastHiddenAt = Date.now(); visibleSince = null; }
  save();
}
function tickActive() {
  if (NS.mode !== 'study' || !S?.day1 || S.finished || document.visibilityState !== 'visible') return;
  if (Date.now() - lastInput > 60000) return;
  const st = (S.dayStats[dayIndex()] ||= { sessions: 1, activeMs: 0 });
  st.activeMs += 15000; save();
}

function onScreen() {
  const name = (location.hash || '#/home').replace(/^#\/?/, '').split(/[/?]/)[0] || 'home';
  chip?.remove(); chip = null; checkinEl?.remove(); checkinEl = null;
  if (S.phase === 'task' && bar) { /* bar stays */ }
  if (NS.mode !== 'study' || S.phase !== 'app' || name !== 'home') return;
  chip = h('button.tm-study-chip', { type: 'button', on: { click: studySheet } }, T('study_chip'));
  document.body.append(chip);
  // daily check-in (SM-3): after the first lesson_complete or game end of the day, on Home, max once
  const day = dayIndex();
  if (day >= 1 && day <= STUDY_DAYS && S.checkins[day] == null) {
    const today = log.events((e) => evDay(e) === day && (e.type === 'lesson_complete' || e.type === 'game_solved' || e.type === 'game_exit'));
    if (today.length) {
      checkinEl = h('div.tm-checkin', h('p.tm-qt', T('checkin')), scale7(T('agree_lo'), T('agree_hi'), null, (v) => { S.checkins[day] = v; ev('checkin', { day, v }); save(); checkinEl.remove(); }),
        h('button.tm-link', { type: 'button', on: { click: () => { S.checkins[day] = 'skip'; ev('checkin', { day, v: 'skip' }); save(); checkinEl.remove(); } } }, T('skip')));
      document.body.append(checkinEl);
    }
  }
}

function studySheet() {
  const sheet = h('div.tm-sheet', h('p', T('study_logged')),
    btn(T('finish'), () => { if (confirm(T('finish_confirm'))) { sheet.remove(); setPhase('final'); } }, 'primary'),
    btn(T('delete_study'), () => { if (confirm(T('delete_confirm'))) { wipeNamespace(); rawStorage.remove(NS.ACTIVE_STUDY); S = { phase: 'deleted', lang }; sheet.remove(); render(); } }, 'danger'),
    btn('×', () => sheet.remove()));
  document.body.append(sheet);
}
