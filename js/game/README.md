# Daily game — Note Sort (integration notes)

Owner: game engineer. Spec: `design/04_daily_game_and_streak.md`. Strings: `01_interaction_spec.md` §12.8 (copied into `strings.js`).
Everything lives in `app/js/game/` and `app/css/game.css`. Nothing outside those was edited.

## Files
| File | What |
|---|---|
| `daily-game.js` | `mountDailyGame(container, opts)` — the whole screen (UI, input, animation, result card, share). |
| `puzzle.js` | Pure rules, date/seed, generator, solver. No DOM — runs in Node. |
| `streak.js` | Days played / runs / rest days (spec §5). Shared API for the home screen and lessons. |
| `sound.js` | Lift / pour / bell sounds + tune playback via the shared `PianoAudio`. |
| `strings.js` | EN + RO strings (§12.8, plus a few marked *engineer-added* screen-reader labels and tune names). |
| `dev.html` | Standalone harness: `http://localhost:8080/js/game/dev.html?date=2026-11-25&reset=1` |
| `checks/unit.mjs`, `checks/browser.mjs` | Node checks (30 seeded days solvable, streak rules) and Playwright checks. |

## 1. Mount it (the `#/game` route)
CSS, in `index.html` after `app.css`:
```html
<link rel="stylesheet" href="./css/game.css">
```
Screen module (`js/app/screens/game.js`, which `router.js` already imports):
```js
import { mountDailyGame } from '../../game/daily-game.js';
import { audio } from '../../engine/audio.js';
import { log } from '../../engine/log.js';
import { store } from '../store.js';

export function gameScreen(root, params, { go }) {
  const game = mountDailyGame(root, {
    audio, store, log,
    onExit: () => go('home'),
    onGoToLesson: ({ lesson }) => go(`lesson/L${lesson}`),   // lesson = 1…10; Jingle Bells → 4 (not built yet: route to the path / "coming soon")
  });
  return { destroy: () => game.destroy() };
}
```
- `container` needs a definite height (the router's `#app`, `position: fixed; inset: 0`, is fine). The game draws its own background, header (back button) and safe-area padding — mount it directly, no `.screen` wrapper.
- Other options: `lang` ('en'|'ro', default `?lang` → `store.settings.lang` → browser), `labels` (default `store.settings.labels`; **Off still shows names** in the game, spec §2), `lessonDone(n)` (default: `store.lessonProgress('L'+n)` or `('l'+n)` is completed — override if lesson ids change).
- Store is read-only here. Theme: dark tokens from design 03, scoped under `.kg`; if the shell defines `--n-C … --n-G` (and `-deep`) on `:root`, the game uses them.

## 2. Days played for the home screen
```js
import { getDays, subscribeDays, dismissWelcomeBack, recordLessonStep, attachLessonTracking, resetDays } from './game/streak.js';

const d = getDays();          // { total, run, best, todayCounted, runAlive, welcomeBack, week: [{date, state, note, today}] }
chip.textContent = `☀ ${d.total}`;                       // days.total is the main number
if (d.welcomeBack) { show(t('days.welcome_back', { n: d.total })); dismissWelcomeBack(); }   // once, total only
const off = subscribeDays(render);                        // updates after a solve / lesson step
```
`week` is Mon–Sun; `state` ∈ `played | rest | missed | today | future`; `note` = colour letter of a note learned that day (`null` → cream dot = puzzle-only). Strings for the *Your days* sheet (`days.*`) are in `strings.js` (`GAME_STRINGS`, `makeT(lang)`).

**Lessons must count days too (rule 2).** Pick one, once, in `main.js`:
```js
attachLessonTracking(log, { noteFor: (id) => lessonById(id)?.colour });   // counts a day on every logged step_done (not skipped)
// or call recordLessonStep({ note: lesson.colour }) yourself when a step completes
```
**Reset** (`?reset=1`, "Reset all progress"): call `resetDays()` and `resetGameData()` (from `daily-game.js`). Storage keys: `klang.days.v1`, `klang.game.v1` (today's moves, so a puzzle resumes).

## 3. Logged events (via `log.event`)
`game_opened {n, practice, resumed, alreadySolved}`, `game_played` (first move — feeds the existing `usage.game` aggregate), `game_solved {n, practice, tune, ms}`, `game_undo`, `game_restart`, `game_stuck`, `game_tune_replay`, `game_tune_link {lesson, known}`, `game_share {method}`, `game_share_cancel`, `game_practice_start`, `game_exit {solved}`. `n` is `null` for practice puzzles.

## 4. Decisions / deviations to review (designer)
- **Generator:** spec §3 as written (seeded shuffle → reject rules → DFS solver → re-seed). Each puzzle carries the solver's move list; the checks replay it and rebuild the start from the solved board with exact reverse pours. A pure reverse-pour random walk was tried first and almost never reaches the 5-full/2-empty start.
- **Mary Had a Little Lamb is left out** of the tune rotation: it is not in `TUNES` and no lesson teaches it, so the result card could not link to a lesson. Rotation: #1 Frère Jacques (L1), #2 Ode to Joy (L2), #3 Jingle Bells (L4), repeat.
- Yesterday missed + today not yet played shows yesterday as a **rest** moon (the run is still waiting), per `days.rule`.
- Result card also shows `days.today_counted` after a daily solve. Tune replays when "It played: …" is tapped. Tune tempo 110 bpm.
- Engineer-added strings (screen-reader tube labels, "Practice" header, tune names) need a RO check.

## 5. Running the checks
```
node app/js/game/checks/unit.mjs
$env:PLAYWRIGHT_DIR="<folder with node_modules/playwright>"; node app/js/game/checks/browser.mjs
```
Screenshots: `testing/team-checks/screens/game-*.png`. These are team checks (predictions), not user findings.
