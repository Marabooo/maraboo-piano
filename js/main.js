// Klang boot.
import { NS } from './testmode/ns.js'; // MUST stay first: namespaces storage in test/study mode
import { audio } from './engine/audio.js';
import { log } from './engine/log.js';
import { store } from './app/store.js';
import { startRouter } from './app/router.js';
import { applyNoteColorVars } from './engine/notes.js';
import { resetDays } from './game/streak.js';
import { resetGameData } from './game/daily-game.js';

audio.volume = store.settings.volume;
audio.preload();                 // fetch samples now; decoding starts on the first tap
audio.installUnlockListeners();  // first tap anywhere creates/resumes the AudioContext
audio.on('samplesfailed', (e) => log.event('samples_failed', e));
audio.on('samplesready', (e) => log.event('samples_ready', { ...e, latency: audio.latency() }));
audio.on('unlocked', () => {});

// URL hooks for testing (01 Â§11): ?wait=soft|strict (read in practice), ?lang=en|ro (i18n),
// ?mode=screen|mic, ?reset=1, ?lesson=L2&step=3, ?done=A|B (completion variant)
{
  const q = new URLSearchParams(location.search);
  if (q.get('reset') === '1' && confirm('Reset all Klang progress on this device?')) {
    store.resetAll(); log.resetUsage(); log.clearEvents(); resetDays(); resetGameData();
  }
  if (q.get('mode') === 'screen') store.set('practiceMode', 'touch');
  if (q.get('mode') === 'mic') store.set('practiceMode', 'mic');
  if (q.get('lesson')) location.hash = `#/play/${q.get('lesson')}?resume=0${q.get('step') ? '&step=' + q.get('step') : ''}`;
}
audio.setVolume(store.settings.volume);
applyNoteColorVars();
// Handy for the team and for the test-mode module (read-only use, please).
window.klang = { audio, log, store, version: '0.9.5' };
startRouter(document.getElementById('app'));
if (NS.mode) import('./testmode/testmode.js').then((m) => { window.klang.testmode = m.startTestMode(); });

// Offline support (network-first, see sw.js). ?nosw disables it for debugging.
if ('serviceWorker' in navigator && !location.search.includes('nosw')) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch((e) => console.warn('SW registration failed', e)));
}


