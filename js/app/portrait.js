// "Turn your phone sideways" hint on screens with a keyboard, with a way to continue in portrait.
import { h, ICONS, isTouchPhone } from './ui.js';
import { log } from '../engine/log.js';

// 01 §3.7: practice works in portrait and is never blocked — the tip is shown inside practice instead.
const KEYBOARD_SCREENS = new Set([]);
let el = null;
let screenName = 'home';
let dismissed = false; // per app session
const mq = matchMedia('(orientation: portrait)');
mq.addEventListener?.('change', () => updatePortraitHint(screenName));

const canLock = () => !!(screen.orientation && screen.orientation.lock && document.documentElement.requestFullscreen) &&
  !/iPhone|iPad|iPod/.test(navigator.userAgent);

export function updatePortraitHint(name) {
  screenName = name;
  const need = KEYBOARD_SCREENS.has(name) && mq.matches && isTouchPhone() && !dismissed;
  if (need && !el) show();
  else if (!need && el) hide();
}

function show() {
  log.event('portrait_hint_show', { screen: screenName });
  const card = h('div.card',
    h('div.rotate-ic', { html: ICONS.phone }),
    h('h2', 'Turn your phone sideways'),
    h('p.muted', 'The keys get bigger and easier to hit.'),
    h('div.row', { style: { justifyContent: 'center', marginTop: '8px' } },
      canLock() ? h('button.btn.primary', { type: 'button', on: { click: lockLandscape } }, 'Turn it for me') : null,
      h('button.btn', { type: 'button', on: { click: () => { dismissed = true; log.event('portrait_continue'); hide(); } } }, 'Continue like this'),
    ),
  );
  el = h('div.overlay', { role: 'dialog', 'aria-modal': 'true' }, card);
  document.getElementById('overlay-root').append(el);
}

function hide() { el?.remove(); el = null; }

async function lockLandscape() {
  try {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    await screen.orientation.lock('landscape');
    log.event('orientation_locked');
  } catch (e) {
    log.event('orientation_lock_failed', { err: String(e && e.name) });
    dismissed = true; hide();
  }
}
