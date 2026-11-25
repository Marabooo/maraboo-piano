// Shared sheets: Sound help (01 §10.3), confirm dialog.
import { h, overlay } from './ui.js';
import { t } from './i18n.js';
import { audio } from '../engine/audio.js';
import { log } from '../engine/log.js';
import { store } from './store.js';

export function soundHelp({ onClose } = {}) {
  log.event('sound_help_open');
  const res = h('p.muted', { style: { minHeight: '1.4em' } });
  const after = h('div.row', { style: { justifyContent: 'center', display: 'none' } },
    h('button.btn', { type: 'button', on: { click: () => { log.event('sound_check', { result: 'nothing', mitigation: audio.silentMitigation, state: audio.state }); res.textContent = t('sound.still'); } } }, t('sound.still_btn')),
    h('button.btn', { type: 'button', on: { click: () => { store.set('soundConfirmed', true); log.event('sound_check', { result: 'works' }); o.close(); } } }, t('sound.works')),
  );
  const o = overlay([
    h('h2', t('sound.title')),
    h('ol', { style: { textAlign: 'left', paddingLeft: '20px', lineHeight: '1.45', margin: '6px 0 12px' } },
      h('li', t('sound.s1')), h('li', t('sound.s2')), h('li', t('sound.s3'))),
    h('div.row', { style: { justifyContent: 'center' } },
      h('button.btn.primary', { type: 'button', on: { click: () => { audio.unlock(); audio.playNote(60, 0.8); after.style.display = 'flex'; } } }, t('sound.test')),
      h('button.btn.ghost', { type: 'button', on: { click: () => o.close() } }, t('common.close'))),
    after, res,
  ], { onClose });
  o.el.addEventListener('click', (e) => { if (e.target === o.el) o.close(); });
  return o;
}

export function confirmDialog({ text, yes, no, onYes }) {
  const o = overlay([
    h('p', text),
    h('div.row', { style: { justifyContent: 'center' } },
      h('button.btn', { type: 'button', on: { click: () => o.close() } }, no),
      h('button.btn', { type: 'button', style: { color: '#a33' }, on: { click: () => { o.close(); onYes(); } } }, yes)),
  ]);
  return o;
}
