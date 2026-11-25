// Tiny hash router: #/home, #/lesson/l1, #/mode/l1, #/play/l1, #/done/l1, #/settings, #/free, #/game
// Hash routes keep the phone's Back gesture working and survive reloads (GitHub Pages friendly).
import { homeScreen } from './screens/home.js';
import { lessonIntroScreen } from './screens/lessonIntro.js';
import { modeScreen } from './screens/mode.js';
import { practiceScreen } from './screens/practice.js';
import { completeScreen } from './screens/complete.js';
import { settingsScreen } from './screens/settings.js';
import { gameScreen } from './screens/game.js';
import { updatePortraitHint } from './portrait.js';
import { log } from '../engine/log.js';

const ROUTES = {
  home: homeScreen,
  lesson: lessonIntroScreen,
  mode: modeScreen,
  play: practiceScreen,
  free: (root, p, ctx) => practiceScreen(root, { ...p, free: true }, ctx),
  done: completeScreen,
  settings: settingsScreen,
  game: gameScreen,
};

let root = null;
let current = null;
let passed = null;
let lastHash = null;

export function go(path, { replace = false, data = null } = {}) {
  passed = data;
  const hash = '#/' + path.replace(/^#?\/?/, '');
  if (replace) { history.replaceState(null, '', hash); render(); }
  else if (location.hash === hash) render();
  else location.hash = hash;
}

/** Data handed to the next screen by go(..., { data }) (e.g. the lesson summary). */
export const takePassed = () => { const d = passed; passed = null; return d; };

function parse() {
  const [path, qs] = (location.hash || '#/home').replace(/^#\/?/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  return { name: parts[0] || 'home', param: parts[1] || null, query: new URLSearchParams(qs || '') };
}

function render() {
  if (location.hash === lastHash && current && !passed) return;
  lastHash = location.hash;
  const { name, param, query } = parse();
  const screen = ROUTES[name] || ROUTES.home;
  try { current?.destroy?.(); } catch (e) { console.error(e); }
  root.innerHTML = '';
  log.event('screen', { name, param });
  current = screen(root, { id: param, query }, { go, takePassed }) || null;
  updatePortraitHint(name);
}

export function startRouter(el) {
  root = el;
  addEventListener('hashchange', render);
  if (!location.hash) history.replaceState(null, '', '#/home');
  render();
}
