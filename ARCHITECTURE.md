# Klang app — architecture

Static web app: plain HTML/CSS/JavaScript ES modules. **No build step, no framework, no dependencies.**
Installable PWA (manifest + service worker). Only relative paths, so it runs from any HTTPS static host
(e.g. GitHub Pages under `/<repo>/`). Behaviour follows `design/01_interaction_spec.md`; lesson content is
copied from `design/02_lesson_curriculum.md`; the daily game is the teammate's (`js/game/`, see its README).

## Run it locally (PowerShell)
```powershell
cd "C:\Users\mahru\OneDrive\SCHOOL\UXU\Piano project\app"
npm start            # = node dev/serve.mjs  → http://localhost:8080/
# alternative without Node: python -m http.server 8080
```
The server prints a "Same Wi-Fi" URL for phones. On that plain-http URL the on-screen keys work, but the
**microphone only works on https or localhost** — test "I have a piano" from the deployed (GitHub Pages) link.

Deploy: copy the `app/` folder to the web root (or a GitHub Pages repo). `dev/` is not needed online.
After changing files, bump `VERSION` in `sw.js` (the SW is network-first, so online testers get new files anyway).

## Module map
```
index.html, manifest.webmanifest, sw.js
css/app.css, css/keyboard.css, css/game.css (game: teammate)
js/main.js                    boot: audio preload + unlock listeners, URL hooks, router, SW
js/engine/                    no DOM knowledge except keyboard/falling's own elements
  notes.js                    MIDI ↔ names, colours, solfège, white-key maths, relation()
  emitter.js                  tiny event emitter
  audio.js                    PianoAudio (samples, synth fallback, pad, pedal, iOS silent switch)
  keyboard.js                 Keyboard (DOM keys, geometry hit-testing, multi-touch, labels, states)
  falling.js                  FallingNotes (canvas lane, song clock, wait modes, chords, holds)
  pitch.js                    yin(), PitchTracker, MicListener (beta)
  input.js                    InputHub: keyboard / mic / computer keys → one 'noteon'/'noteoff' stream
  lesson.js                   LessonRunner (steps, hint ladder, phrase-end, earned rules)
  log.js                      event log + usage log (local only)
js/app/                       UI shell
  router.js                   hash routes: #/home #/lesson/L1 #/mode/L1 #/play/L1 #/done/L1 #/settings #/free #/game
  store.js                    settings, progress, resume, songs (localStorage 'klang.state.v1')
  i18n.js, strings.js         EN/RO microcopy (01 §12), {C} note tokens
  days.js                     wrapper over js/game/streak.js (shared "days played")
  micSession.js, sheets.js, ui.js, portrait.js
  screens/                    home, lessonIntro, mode, practice, complete, settings, game
js/lessons/                   index.js (catalogue + tune resolution), shared.js, L1–L6.js
js/testmode/                  test mode (?test=1&pid=T05[&m=1]) and 5-day study mode (?study=S03), testing/06
  ns.js                       FIRST import in main.js: rewrites 'klang.*' storage keys to 'klang.test.*' / 'klang.study.*'
  testmode.js, texts.js       flow screens, task bar, auto-checks, plain-text summaries (06 §8)
  study-config.js             STUDY_VARIANTS, AB_ENABLED, LESSON2_PLAYABLE, SEED_STREAK (student edits)
js/game/                      daily Note Sort — owned by the game engineer (do not edit here)
assets/samples/               17 Salamander piano MP3s (~500 KB) + LICENSE.md
dev/                          serve.mjs, pitch-test.html/js, checks/*.mjs (Playwright)
```

## Public APIs (short)
**audio** (`js/engine/audio.js`, singleton `audio`)
`preload()` · `installUnlockListeners()` · `unlock()` (call inside a tap) · `noteOn(midi,{velocity,when})` ·
`noteOff(midi)` · `playNote(midi, seconds, {when, velocity})` · `padOn(midis,{gain})` / `padOff({release})` ·
`setPedal(bool)` · `allOff()` · `isOutputActive(margin)` · `latency()` · `now()`.
Flags: `usingFallback`, `samplesFailed`, `isIOS`, `mightBeSilenced` (iOS → show "Can't hear anything?"),
`silentMitigation` ('audioSession' | 'htmlAudio' | 'none'), `state`. Events: `state`, `samples`, `samplesready`, `samplesfailed`.

**Keyboard** `new Keyboard(el, {start, whites, labels, minKeyPx, maxKeyPx, glissando:false})` · events `noteon/noteoff {midi,time,source}` ·
`setLabels('letters'|'solfege'|'off')` (live, no re-mount) · `setRange(start, whites, {animate, focus})` · `ensureVisible(midis)` ·
`setViewStart(w)` · `shiftOctave(±1)` · `isVisible(midi)` · `keySpan(midi)` · `visibleRange()/visibleNotes(fn)` ·
`setTargets(midis,{level:'soft'|'strong'})` · `setHighlight(midis)` · `setFound(midis)` · `setForcedLabels(midis)` ·
`flash(midi,'correct'|'wrong'|'done')` · `showPress(midi, ms)`.

**FallingNotes** `new FallingNotes(canvas, keyboard, {waitMode, follow, chordWindowMs, earlyRelease})` ·
`load({tempo, notes:[{midi,beat,dur}], app:[{type:'pad'|'note', beat, dur, midis}]})` · `start/pause/resume/stop` ·
`noteOn/noteOff` · `skipPending()` · `setWaitMode/setLabels/setSpeed/setOption` · events `pending, approach,
waitstart, waitend, hit, wrong{octave,nextButOne}, partial, early, app, autonote, holdtip, earlyrelease, end`.

**LessonRunner** `new LessonRunner({lesson, keyboard, falling, audio, input, log, options})` · `start(i,{auto})` ·
`action('start'|'hear'|'again'|'slower'|'next'|'skipnote'|'skipdemo'|'hint')` · `pause/resume/stop` ·
UI events `step, card, cardhide, bar, skipnote, tag, tagsclear, lane, chips, labels, demo, phraseend, save, complete`.

**Pitch** `yin(frame, sr)` · `new PitchTracker({sampleRate}).process(frame, ms)` · `new MicListener().start(ctx)` (throws `{code}`:
denied | nodevice | busy | insecure | unsupported | error; texts in `MIC_MESSAGES`) · `mic.suppress = () => bool`.

**log** `log.event(type, data)` · `log.events()` · `log.exportJSON()/exportCSV()` · `log.usage()` · `log.usageSummary()` (plain text) ·
`log.dayClasses()` → per date `lesson-led | game-then-lesson | game-only | opened-only` · `log.subscribe(fn)`.

**Game mount point** `#/game` → `mountDailyGame(container, {audio, store, log, lang, lessonDone, onExit, onGoToLesson})`.
Days played: `js/game/streak.js` (shared); lesson steps count via `days.markToday('lesson', colour)` in practice.

`window.klang = { audio, log, store, version, practice }` is exposed for the team's checks and the test mode (read-only use).

## Data formats
**Lesson** — exactly the format of `02_lesson_curriculum.md` §3 (JS object, `{en, ro}` texts, `{C}` tokens). Events
`[name|names, midi|midis, beat, durBeats]`; `notes: {tune, bars:[a,b]}` references `TUNES` in `shared.js`; pads likewise
from `PADS`; `notes: "L6S4.notes"` reuses another step's notes. Step types: `find` (prompts), `chord-find`, `listen`,
`play`, `recall`. `guidance`, `follow`, `record`, `earnedIf/fallbackIf/almost/practise` as in the curriculum.

**Storage** (all localStorage, nothing sent anywhere):
`klang.state.v1` settings/progress/resume/songs · `klang.events.v1` event ring buffer (4000) · `klang.usage.v1` usage aggregate ·
`klang.days.v1` days played (game's streak.js) · `klang.game.v1` daily puzzle state (game).

**Event log** entries: `{ t: ms since app start, at: ISO time, s: random session id, type, ...data }`. No names, no audio.
Key types: `session_start, lesson_start, step_start, step_end, note_accepted{hint,wrongsBefore}, wrong, near_miss, hint{level,why},
skip, phrase_end, phrase_choice, done_choice{choice,ms,variant}, labels_change, keys_change, size_change, pause, leave,
lesson_abandon, mic_*, game_*` (game ones from the game module).

**Usage log** (`log.usageSummary()`): days opened (dates only) + per-day class, lessons started/finished/furthest step,
completion choices (next / done / again / practise, with time to choose and A/B variant), wrong notes, fixed after a mistake,
retries after a mistake, hints shown by level, lessons left early, daily game plays/days.

## How to add a lesson
1. Write `js/lessons/L7.js` in the curriculum format (copy `L2.js`); reuse tunes from `shared.js` or add one there.
2. Import it in `js/lessons/index.js`, add to `LESSONS`, remove it from `COMING`.
3. Add the file to `PRECACHE` in `sw.js` and bump `VERSION`.
4. Run `npm run check:screens` (or open `?lesson=L7&step=1`).

## URL hooks (01 §11)
`?wait=soft|strict` · `?lang=en|ro` · `?mode=screen|mic` · `?reset=1` (asks first) · `?lesson=L2&step=3` · `?done=A|B` · `?nosw`.

## Test mode / study mode (testing/06)
- `?test=1&pid=T05` (+`&m=1` moderated, `&lang=ro`, `&reset=1`), `?study=S03` (+ for X-codes only `&dev=1&today=YYYY-MM-DD`).
- Storage: all app, log, days and game keys are transparently namespaced (`klang.test.*` / `klang.study.*`), so every test
  participant starts fresh and the normal app is untouched. "Delete" wipes only that namespace. No network calls (checked:
  no external requests in the Playwright run).
- The task bar takes its own 44 px at the top (`body.tm-bar-on #app { top: 44px }`); the practice layout sizes the keyboard
  from the app root's height, so the bar can never cover keys. The task panel stops above the keyboard's top edge.
- Data source = the app's event log (namespaced) + `tm_*` events. Auto-checks: T1 `lesson_complete` L1 · T2 labels = Do Re Mi ·
  T3 a later `kb_range` reaches higher than the first one in the task · T4 `app_hidden` in a lesson, then a step ≥ the one left
  and ≥ 1 accepted note · T5 `game_opened` + (`game_solved` or `game_played`) · T6 mode = mic.
- Not built: the standalone "Enter your study code" screen (§3) and the T5 streak seed (`SEED_STREAK = false`, by design).
- Test/study screens and the app default to **English** (student decision); `&lang=ro` or the first-screen switch changes it.
  The summary header records `lang EN (start EN, switched 0x)`.
- Settings ▸ Play on ▸ My piano goes through the same explainer → permission → sound check as the lesson route (`#/mode/settings?explain=1`).
- Re-check script for the v0.3.1 fixes: `node dev/checks/testmode.mjs`.
- Study mode: Home chip "ⓘ Study" (no day counter), one optional check-in card per day on Home after the first lesson/game,
  SM-4 on day ≥ 6 (logged `day6_open`, not counted as a return), per-day table and return routes in the summary.

## Colours
One note-colour map in `js/engine/notes.js` (`NOTE_COLORS`, `NOTE_DEEP`), written to `--n-C … --n-B` and `--n-X-deep` on
`:root` at boot. The keyboard CSS and the daily game (`css/game.css`, which reads `--n-*`) both use it. **C is rose pink
(#FF7AC6 / deep #A3206E), not the red of design/03**, after the lead's check (a red C target read as "wrong").
Target keys ("play here") use the gold `--focus` ring + a small bobbing arrow, never a note colour; wrong presses use the
neutral `--miss` grey; found keys keep their note colour with a 3 px deep border. Dark theme tokens from design/03 §1.
Nunito is not self-hosted yet (falls back to ui-rounded / system-ui).

## Decisions taken by the implementer (please review)
- **Default key names = Letters for everyone** (lead's hard requirement for test task T2). The spec's "Do Re Mi for
  Romanian UI" default is not applied; RO UI language still follows the browser.
- Find-step H1 pattern hint is shown as a key tag over the nearest black-key group, so the top bar keeps naming the note.
- Hold notes are never judged (spec). `earlyRelease: 'hold'` exists in the engine only for team comparison.
- Piano map in the Keys sheet is a simplified canvas map (drag/tap) plus "◀ Lower / Higher ▶" buttons and key size.
- Not built yet: Lesson 7–10 (coming-soon stones), compact next-notes strip (lane < 96 px — lane just gets small),
  mic "trouble" card, pad swell, building-rise animation, `03_visual_system.md` colours/dark theme.
  (The in-app test mode and 5-day study mode from `testing/06` **are built** in v0.3; see "Test mode / study mode" above.
  Still missing there: the standalone "Enter your study code" screen and the T5 streak seed, which is off by design.)

## Audio notes
- Samples: one every minor third, decoded on the first tap, trimmed onset offset computed at decode time. Until
  decoding finishes (or if it fails) a synthesized piano-ish voice plays.
- Signal chain: voices → master → soft-clip WaveShaper (no look-ahead latency) → out, plus a short synthetic reverb.
  No DynamicsCompressor (it adds ~6 ms look-ahead in Chrome).
- **iPhone silent switch:** on the first tap we set `navigator.audioSession.type = 'playback'` (Safari 16.4+/17) or, on older
  iOS, loop a silent `<audio playsinline>` while the page is visible. The page cannot detect the switch, so the
  "Can't hear anything?" sheet (intro link, pause sheet, Settings, and a chip if the AudioContext is not running after a tap)
  explains it. **Not yet verified on a real iPhone.** When the mic starts we switch the session to 'play-and-record'.

## Latency (software only, headless Chromium, `npm run check:latency`)
pointerdown → `audio.noteOn()` median **3.4 ms** (max 6.4 ms, n = 28). AudioContext reports baseLatency 10 ms + outputLatency 40 ms
(headless/virtual device — not representative). Real phones add touch-panel latency (~20–60 ms) and the device's audio output
latency (iOS ~10–30 ms, Android 20–150 ms). The sound starts on pointerdown (not on release/click). **Measure on the test phones.**

## Pitch detection (beta) — offline test results
`npm run check:pitch` renders every note C3–C6 (37 notes) with the app's own piano samples in an OfflineAudioContext,
optionally adds noise, and feeds 2048-sample frames every 1/60 s through the same `PitchTracker` the mic uses
(YIN on a 2× decimated signal, threshold 0.12; 3 stable frames; adaptive noise gate learned only while silent; RMS-jump
onset detection re-arms repeated notes; octave flips without a new onset are ignored).

| Condition (48 kHz) | Correct first note | Octave errors | Other | Missed | Extra note-ons | Median / max latency after onset |
|---|---|---|---|---|---|---|
| clean | 37/37 | 0 | 0 | 0 | 0 | 76 / 93 ms |
| clean, −20 dB (far from mic) | 37/37 | 0 | 0 | 0 | 0 | 76 / 93 ms |
| white noise, SNR 20 dB | 37/37 | 0 | 0 | 0 | 0 | 76 / 93 ms |
| pink noise, SNR 15 dB | 37/37 | 0 | 0 | 0 | 0 | 76 / 93 ms |
| pink + 50 Hz hum, SNR 12 dB | 37/37 | 0 | 0 | 0 | 0 | 93 / 159 ms |
| white noise, SNR 10 dB | 37/37 | 0 | 0 | 0 | 0 | 93 / 93 ms |
| white noise, SNR 5 dB | 36/37 | 0 | 0 | 1 (B5) | 0 | 93 / 176 ms |
| out-of-tune piano (+35 cents) | 37/37 | 0 | 0 | 0 | 1 | 93 / 209 ms |
| weak bass (4th-order high-pass 300 Hz) | 37/37 | 0 | 0 | 0 | 0 | 76 / 126 ms |
| weak bass + pink noise 15 dB | 37/37 | 0 | 0 | 0 | 0 | 76 / 126 ms |

Repeated same note, 3 strikes (13 notes C3–C6): 13/13 when released between strikes, 13/13 when re-struck while ringing.
Hot Cross Buns melody incl. fast repeated notes (17 notes): exact sequence clean and with pink noise 15 dB.
Noise only (3 s at four levels): 0 false notes. At 44.1 kHz the first six conditions, repeats and melody gave the same results.
During development the first version failed some of these (noise floor rising with the music → missed notes; octave
flips in decaying tails → extra notes); both were fixed and the numbers above are after the fixes.

**Limits — read before claiming anything:** these signals are the same samples the app plays, without a room, a phone
speaker/mic chain, AGC, reverberation, other instruments or real piano action noise. They are a *best case*. Chords are
not detected (chord steps accept chord notes one at a time in mic mode). **The student must verify with a real piano
and the test phones** (iPhone + Android): correct-note rate, missed notes, repeated notes, and what happens with talking nearby.

## Team checks (predictions, not findings) — `npm run check:screens`
Plays Lesson 1 end to end with touch taps in headless Chromium at 844×390, 667×375, 740×360, 390×844 and 1024×768;
screenshots go to `testing/team-checks/screens/` and a JSON report to `testing/team-checks/screens-report.json`.
Checks: no horizontal overflow, white keys ≥ 44 px at the default range, top-bar controls never overlap the keys,
label switching mid-phrase keeps the place, soft wait sinks 0.35 beat / strict stops at 0, equal completion buttons,
no console errors.

## What must be verified on real devices (not done by the implementer)
Sound on iPhone with the silent switch ON (both mitigations) · tap-to-sound latency feel on each phone · keys ≥ 44 px and
no browser gestures (pull-to-refresh, back swipe, long-press loupe) while playing · landscape heights in browser vs
installed (log `session_start` viewport) · mic mode with a real piano · offline after first load · Android fullscreen button.
