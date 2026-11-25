// "Days played" — thin wrapper over the game engineer's shared streak API (js/game/streak.js,
// rules in design/04_daily_game_and_streak.md). One storage key: klang.days.v1.
import { getDays, recordLessonStep, subscribeDays, dismissWelcomeBack, resetDays } from '../game/streak.js';

export const days = {
  /** A lesson step was finished (counts the day, rule 2). note = lesson colour letter. */
  markToday(source = 'lesson', note = null) { if (source === 'lesson') recordLessonStep({ note }); },
  get: () => getDays(),
  total: () => getDays().total,
  run: () => getDays().run,
  best: () => getDays().best,
  subscribe: subscribeDays,
  dismissWelcomeBack,
  reset: resetDays,
};
