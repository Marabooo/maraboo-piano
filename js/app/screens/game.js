// Daily game screen: mounts the teammate's Note Sort (js/game/daily-game.js, see js/game/README.md).
import { mountDailyGame } from '../../game/daily-game.js';
import { audio } from '../../engine/audio.js';
import { log } from '../../engine/log.js';
import { store } from '../store.js';
import { lang } from '../i18n.js';
import { lessonById } from '../../lessons/index.js';

export function gameScreen(root, params, { go }) {
  const game = mountDailyGame(root, {
    audio, store, log, lang: lang(),
    lessonDone: (n) => !!store.lessonProgress('L' + n)?.completed,
    onExit: () => go('home'),
    // Jingle Bells → Lesson 4 (built). Unbuilt lessons fall back to the path.
    onGoToLesson: ({ lesson }) => (lessonById('L' + lesson) ? go('home', { data: { openLesson: 'L' + lesson } }) : go('home')),
  });
  return { destroy: () => game?.destroy?.() };
}
