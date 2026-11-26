// Bottom tab bar (v2, 26 Nov): Home · Puzzles · Learn · Settings. Added by the router on tab screens.
import { h, svg, ICONS } from '../ui.js';
import { t } from '../i18n.js';

const IC = {
  home: svg('<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>'),
  puzzles: svg('<path d="M19.4 7.9c0 .3.1.6.3.9l1.6 1.5a2.4 2.4 0 0 1 0 3.4l-1.6 1.6a1 1 0 0 1-.8.3c-.5-.1-.8-.5-1-.9a2.5 2.5 0 1 0-3.2 3.2c.4.2.9.5.9 1a1 1 0 0 1-.3.8l-1.6 1.6a2.4 2.4 0 0 1-3.4 0l-1.5-1.6a1 1 0 0 0-.9-.3c-.5.1-.8.5-1 1a2.5 2.5 0 1 1-3.3-3.3c.5-.2.9-.5 1-1a1 1 0 0 0-.3-.9L2.7 13.7a2.4 2.4 0 0 1 0-3.4l1.5-1.5c.3-.3.6-.4 1-.3.5.1.8.5 1 1a2.5 2.5 0 1 0 3.3-3.3c-.5-.2-.9-.5-1-1 0-.4.1-.7.3-1l1.5-1.5a2.4 2.4 0 0 1 3.4 0l1.6 1.6c.2.2.5.3.8.3.5-.1.9-.5 1-1a2.5 2.5 0 1 1 3.3 3.3c-.5.2-.9.5-1 1z"/>'),
  learn: svg('<path d="M3 9l9-5 9 5-9 5z"/><path d="M7 11v5c3 2 7 2 10 0v-5"/>'),
  settings: ICONS.gear,
};
export const TAB_ROUTES = ['home', 'puzzles', 'learn', 'settings'];

export function tabBar(active, go) {
  return h('nav.tabbar', TAB_ROUTES.map((name) => h('button.tab' + (name === active ? '.on' : ''), { type: 'button', 'aria-current': name === active ? 'page' : null, on: { click: () => go(name) } },
    h('span.tab-ic', { html: IC[name] }), h('span.tab-lbl', t('tab.' + name)))));
}
