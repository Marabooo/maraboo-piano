// Mode choice (01 §2.4) → mic explainer → permission → sound check (01 §2.5).
import { h, ICONS } from '../ui.js';
import { t, noteName } from '../i18n.js';
import { store } from '../store.js';
import { micSession } from '../micSession.js';
import { log } from '../../engine/log.js';
import { audio } from '../../engine/audio.js';

export function modeScreen(root, { id, query }, { go }) {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const fromSettings = id === 'settings';
  const toLesson = () => (fromSettings ? go('settings', { replace: true }) : go(`play/${id}?resume=0`, { replace: true }));
  const el = h('div.screen');
  root.append(el);
  let cleanup = null;

  const choose = () => {
    el.innerHTML = '';
    const micOk = !micSession.support();
    const card = (kind) => h('button.mode-card', {
      type: 'button', disabled: kind === 'mic' && !micOk,
      on: { click: () => { log.event('mode_choice', { mode: kind }); if (kind === 'touch') { store.set('practiceMode', 'touch'); micSession.stop(); toLesson(); } else explainer(); } },
    },
    h('span.ic', { html: kind === 'touch' ? ICONS.keys : ICONS.mic }),
    h('b', t(kind === 'touch' ? 'mode.screen.title' : 'mode.mic.title')),
    h('span.muted', t(kind === 'touch' ? 'mode.screen.body' : 'mode.mic.body')),
    h('span.mtag.' + (kind === 'touch' ? 'ok' : 'beta'), t(kind === 'touch' ? 'mode.screen.tag' : 'mode.mic.tag')),
    kind === 'mic' && !micOk ? h('span.muted.small', t('mode.mic.unavailable')) : null);
    el.append(
      h('div.topbar', h('button.icon-btn', { type: 'button', 'aria-label': t('common.back'), html: ICONS.back, on: { click: () => go('home') } }), h('h2', t('mode.title'))),
      h('div.center-wrap', h('div', { style: { width: '100%', maxWidth: '720px' } }, h('div.mode-grid', card('touch'), card('mic')), h('p.muted.small', { style: { textAlign: 'center', marginTop: '10px' } }, t('mode.remember')))),
    );
  };

  const explainer = () => {
    el.innerHTML = '';
    el.append(h('div.center-wrap', h('div.card',
      h('h2', t('mic.ex.title')),
      h('ul.bullets', h('li', t('mic.ex.b1')), h('li', t('mic.ex.b2')), h('li', t('mic.ex.b3'))),
      h('div.row', h('button.btn.primary', { type: 'button', on: { click: ask } }, t('mic.ex.allow')),
        h('button.btn', { type: 'button', on: { click: () => { store.set('practiceMode', 'touch'); log.event('mode_choice', { mode: 'touch', from: 'explainer' }); toLesson(); } } }, t('mic.ex.instead'))),
      h('p.muted.small', t('mic.ex.next_prompt')))));
  };

  const ask = async () => {
    audio.unlock();
    try {
      await micSession.start();
      store.set('practiceMode', 'mic');
      log.event('mic', { result: 'granted' });
      check();
    } catch (e) {
      store.set('practiceMode', 'touch');
      log.event('mic', { result: e.code === 'denied' ? 'denied' : 'error', code: e.code });
      el.innerHTML = '';
      el.append(h('div.center-wrap', h('div.card', h('h2', t('mic.denied.title')), h('p', t('mic.denied.body')),
        h('button.btn.primary', { type: 'button', on: { click: toLesson } }, t('mic.denied.btn')))));
    }
  };

  const check = () => {
    el.innerHTML = '';
    const msg = h('p.muted', t('mic.check.body'));
    const bars = h('div.meter', h('i'), h('i'), h('i'));
    const ready = h('button.btn.primary', { type: 'button', style: { display: 'none' }, on: { click: toLesson } }, t('mic.check.ready'));
    el.append(h('div.center-wrap', h('div.card', h('h2', t('mic.check.title')), msg, bars,
      h('div.row', ready, h('button.btn.ghost', { type: 'button', on: { click: toLesson } }, t('mic.check.skip'))))));
    const m = micSession.listener;
    const offL = m.on('level', ({ rms }) => { const v = Math.sqrt(rms) * 6; [...bars.children].forEach((b, i) => b.classList.toggle('on', v > (i + 1) * 0.18)); });
    const offN = m.on('noteon', ({ midi }) => { msg.textContent = t('mic.check.heard', { note: noteName(midi) }); ready.style.display = ''; log.event('mic_check', { heard: midi }); });
    const nothing = setTimeout(() => { if (ready.style.display === 'none') msg.textContent = t('mic.check.nothing'); }, 8000);
    cleanup = () => { offL(); offN(); clearTimeout(nothing); };
  };

  if (q.get('explain') === '1') explainer();
  else if (q.get('mic') === '1') {
    // returning mic user: the permission usually persists, so restart listening and go on
    if (micSession.running) toLesson();
    else micSession.start().then(toLesson, () => { store.set('practiceMode', 'touch'); explainer(); });
  } else choose();
  return { destroy() { cleanup?.(); } };
}
