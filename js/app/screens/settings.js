// Settings (01 §2.12) + "What I can play" (01 §2.10, reached with #/settings?rep=1).
import { h, ICONS, toast, segmented } from '../ui.js';
import { t, tx, lang, setLang, cardText, songTitle } from '../i18n.js';
import { store } from '../store.js';
import { micSession } from '../micSession.js';
import { soundHelp, confirmDialog } from '../sheets.js';
import { audio } from '../../engine/audio.js';
import { log } from '../../engine/log.js';
import { LESSONS } from '../../lessons/index.js';
import { playBack } from './complete.js';
import { resetDays } from '../../game/streak.js';
import { resetGameData } from '../../game/daily-game.js';

export function settingsScreen(root, { query }, { go }) {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  if (q.get('rep')) return repertoire(root, go);
  const S = store.settings;
  const row = (label, control, sub) => h('div.set-row', h('div.lbl', h('b', label), sub ? h('span', sub) : null), control);
  const seg = (key, opts, after) => segmented(opts.map(([v, l]) => ({ value: v, label: l })), S[key], (v) => { store.set(key, v); log.event('setting', { key, value: v }); after?.(v); });
  const vol = h('input', { type: 'range', min: 0, max: 100, value: Math.round(S.volume * 100), 'aria-label': t('settings.volume'), on: { input: (e) => { const v = e.target.value / 100; store.set('volume', v); audio.setVolume(v); } } });
  const toggle = (key, after) => { const b = h('button.toggle', { type: 'button', role: 'switch', 'aria-checked': String(!!S[key]), on: { click: () => { const v = !store.settings[key]; store.set(key, v); b.setAttribute('aria-checked', String(v)); after?.(v); } } }); return b; };
  // "Play on": choosing My piano never switches silently (D2): it opens the beta explainer -> permission ->
  // sound check (mode.js), which sets the mode only on success and falls back to the screen otherwise.
  const modeSeg = () => {
    const cur = S.practiceMode === 'mic' ? 'mic' : 'touch';
    const sg = segmented([{ value: 'touch', label: t('intro.mode_screen') }, { value: 'mic', label: t('intro.mode_mic') }], cur, (v) => {
      log.event('mode_choice', { mode: v, from: 'settings' });
      if (v === 'mic') { sg.setValue(cur); go('mode/settings?explain=1'); return; }
      store.set('practiceMode', 'touch'); micSession.stop(); log.event('setting', { key: 'practiceMode', value: 'touch' });
    }, { label: t('settings.mode') });
    return sg;
  };
  const summary = h('textarea.summary', { readonly: true, style: { display: 'none' } });
  const testing = h('div.set-group', { style: { display: 'none' } },
    row(t('settings.wait'), seg('waitMode', [['soft', 'Soft'], ['strict', 'Stop']]), `${t('wait.soft')} · ${t('wait.strict')}`),
    row('Completion screen (A/B)', seg('completionVariant', [['A', 'A: You can now…'], ['B', 'B: Lesson complete']])),
    row(t('settings.summary'), h('button.btn', { type: 'button', on: { click: () => { summary.style.display = ''; summary.value = log.usageSummary(); copy(summary.value); } } }, 'Copy')),
    h('div.set-row', summary),
    row(t('settings.export'), h('button.btn', { type: 'button', on: { click: () => exportLog() } }, 'JSON')),
    row(t('settings.reset'), h('button.btn', { type: 'button', style: { color: '#a33' }, on: { click: () => confirmDialog({ text: t('settings.reset_confirm'), yes: t('settings.reset_yes'), no: t('settings.reset_no'), onYes: () => { store.resetAll(); resetDays(); resetGameData(); log.resetUsage(); log.clearEvents(); toast('Reset.'); go('home'); } }) } }, t('settings.reset_yes'))),
  );
  const el = h('div.screen.scroll', h('div.settings',
    h('div.topbar', h('button.icon-btn', { type: 'button', 'aria-label': t('common.back'), html: ICONS.back, on: { click: () => go('home') } }), h('h2', t('settings.title'))),
    h('div.set-group',
      row(t('settings.labels'), seg('labels', [['letters', t('labels.letters')], ['solfege', t('labels.solfege')], ['off', t('labels.off')]], (v) => { if (v !== 'off') store.set('lastNaming', v); })),
      row(t('settings.mode'), modeSeg()),
      row(t('settings.keysize'), seg('keySize', [['bigger', t('keys.bigger')], ['normal', t('keys.normal')], ['more', t('keys.more')]])),
      row(t('settings.hints'), seg('hints', [['auto', t('hints.auto')], ['ask', t('hints.ask')]])),
    ),
    h('div.set-group',
      row(t('settings.volume'), vol),
      row(t('settings.backing'), toggle('backing')),
      row(t('settings.test_sound'), h('button.btn', { type: 'button', on: { click: () => { audio.unlock(); const t0 = audio.now() + 0.05; [60, 64, 67].forEach((m, i) => audio.playNote(m, 0.6, { when: t0 + i * 0.25 })); } } }, '▶')),
      row(t('sound.title'), h('button.btn', { type: 'button', on: { click: () => soundHelp() } }, t('pause.sound_help'))),
      row(t('settings.language'), segmented([{ value: 'en', label: 'English' }, { value: 'ro', label: 'Română' }, { value: 'da', label: 'Dansk' }], lang(), (v) => { go('settings', { replace: true }); setLang(v, 'settings'); })),
    ),
    h('button.set-h.link', { type: 'button', on: { click: () => { testing.style.display = testing.style.display ? '' : 'none'; } } }, t('settings.testing') + ' ▾'),
    testing,
    h('p.muted.small', t('settings.about')),
    h('p.muted.small', t('settings.credits'), ' ', h('a', { href: './assets/samples/LICENSE.md', target: '_blank', rel: 'noopener' }, 'Licence')),
    h('p.muted.small', `Version ${window.klang?.version || ''} · sound: ${audio.usingFallback ? 'synth fallback' : 'samples'} · ${audio.silentMitigation}`),
  ));
  root.append(el);
  return null;
}

async function copy(text) {
  try {
    if (navigator.share) { await navigator.share({ text }); return; }
  } catch { /* user cancelled → copy instead */ }
  try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Select the text and copy it'); }
}
function exportLog() {
  const blob = new Blob([log.exportJSON()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `klang-log-${new Date().toISOString().slice(0, 10)}.json`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  log.event('log_export');
}

function repertoire(root, go) {
  log.event('rep_open');
  const songs = Object.entries(store.songs).sort((a, b) => (b[1].learnedAt || '').localeCompare(a[1].learnedAt || ''));
  const skills = [];
  for (const l of LESSONS) for (const c of store.lessonProgress(l.id)?.cards || []) skills.push({ ...c, lesson: l });
  root.append(h('div.screen.scroll', h('div.settings',
    h('div.topbar', h('button.icon-btn', { type: 'button', 'aria-label': t('common.back'), html: ICONS.back, on: { click: () => go('home') } }), h('h2', t('rep.title'))),
    h('div.set-h', t('rep.songs')),
    songs.length ? h('div.set-group', songs.map(([sid, s]) => h('div.set-row', h('div.lbl', h('b', songTitle(LESSONS.find((l) => l.id === s.lessonId), s.title)), h('span', new Date(s.learnedAt).toLocaleDateString())),
      s.recordings?.[0] ? playToggle(sid, s.recordings[0]) : null,
      null))) : h('p.muted', t('rep.empty')), // v2: "Play again" removed (student request)
    skills.length ? h('div.set-h', t('rep.skills')) : null,
    skills.length ? h('div.set-group', skills.filter((c) => c.kind === 'can').map((c) => h('div.set-row', h('div.lbl', h('b', cardText(c.lesson, c))))),
      skills.filter((c) => c.kind === 'almost').map((c) => h('div.set-row', h('div.lbl', h('span', cardText(c.lesson, c)))))) : null,
  )));
  return { destroy() { if (playing) { audio.allOff(); playing._reset(); } } }; // stop the song when leaving
}

// v2: play / stop toggle for a saved song (student: there was no way to stop it)
const STOP = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>';
let playing = null;
function playToggle(sid, rec) {
  const b = h('button.btn.play-round', { type: 'button', 'aria-label': t('rep.hear'), title: t('rep.hear'), html: ICONS.play });
  const reset = () => { clearTimeout(b._t); b.innerHTML = ICONS.play; b.classList.remove('on'); if (playing === b) playing = null; };
  b.addEventListener('click', () => {
    const wasMe = playing === b;
    if (playing) { audio.allOff(); playing._reset(); }
    if (wasMe) { log.event('rep_play', { song: sid, what: 'stop' }); return; }
    log.event('rep_play', { song: sid, what: 'hear' });
    const secs = playBack(rec);
    playing = b; b.innerHTML = STOP; b.classList.add('on');
    b._t = setTimeout(reset, (secs || 10) * 1000);
  });
  b._reset = reset;
  return b;
}
