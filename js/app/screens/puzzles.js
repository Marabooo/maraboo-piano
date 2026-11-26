// Puzzles tab (v2): the daily puzzle now, more games later (phase 4).
import { h } from '../ui.js';
import { t } from '../i18n.js';
import { log } from '../../engine/log.js';
import { days } from '../days.js';
import { loadDays } from '../../game/streak.js';

export function puzzlesScreen(root, _p, { go }) {
  const solved = !!loadDays()?.days?.[days.get().today]?.puzzle;
  const row = (ic, title, sub, onClick, cls = '') => h('button.pz-row' + cls, { type: 'button', disabled: !onClick, on: onClick ? { click: onClick } : {} },
    h('span.pz-ic', ic), h('span.pz-txt', h('b', title), sub ? h('span', sub) : null), h('span.pz-go', onClick ? '›' : ''));
  root.append(h('div.screen.scroll.puzzles', h('h1.tab-title', t('tab.puzzles')),
    h('div.pz-list',
      row('🧩', t('home.daily_title'), solved ? t('home.daily_done') : null, () => { log.event('daily_open', { solved, from: 'puzzles' }); go('game'); }, solved ? '' : '.glow'),
      row('🎹', t('pz.tiles'), t('pz.tiles_sub'), () => go('tiles')),
      row('🎯', t('pz.findkey'), t('pz.findkey_sub'), () => go('findkey')))));
  return null;
}
