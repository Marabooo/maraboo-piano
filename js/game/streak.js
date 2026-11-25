// Days played / runs — exact rules from design/04_daily_game_and_streak.md §5.
//
//  1. Day boundary 03:00 local time (dayKey() in puzzle.js).
//  2. A day counts when the learner completes ≥ 1 lesson step OR solves the daily puzzle.
//  3. Days played = number of counted days, ever. Never decreases.
//  4. Current run = counted days since the run began. ONE missed day between counted days is a
//     rest day (moon) — it does not break the run and adds nothing.
//  5. Two missed days in a row end the run silently (no message, no icon).
//  6. On return after a run ended: days.welcome_back (total only). Next counted day starts a run at 1.
//     Best run is kept; shown only in the "Your days" sheet.
//  7. No notifications, no freezes, no repairs (nothing here schedules anything).
//  8. No fake history: starts empty; resetDays() clears everything. Nothing here ever writes a day
//     that the learner did not play.
//
// Storage: localStorage 'klang.days.v1' = { v:1, days: { 'YYYY-MM-DD': { lesson?:true, puzzle?:true, notes?:['C'] } },
//                                           welcomeDismissed?: 'YYYY-MM-DD' }
// Pure computation lives in computeDays(record, todayKey) so it can be unit-tested in Node.

import { dayKey, daysBetween, addDays } from './puzzle.js';

export const DAYS_KEY = 'klang.days.v1';
const empty = () => ({ v: 1, days: {} });
const subs = new Set();

function storage() { try { return globalThis.localStorage || null; } catch { return null; } }
export function loadDays() {
  try { const raw = storage()?.getItem(DAYS_KEY); if (raw) { const r = JSON.parse(raw); if (r && r.days) return r; } } catch { /* */ }
  return empty();
}
function saveDays(r) {
  try { storage()?.setItem(DAYS_KEY, JSON.stringify(r)); } catch { /* private mode / full */ }
  for (const fn of subs) { try { fn(getDays()); } catch (e) { console.error(e); } }
}
/** Listen for changes (e.g. to update the home chip). Returns an unsubscribe function. */
export function subscribeDays(fn) { subs.add(fn); return () => subs.delete(fn); }

function mark(kind, { note = null, now = new Date() } = {}) {
  const r = loadDays();
  const k = dayKey(now);
  const d = r.days[k] || (r.days[k] = {});
  const before = JSON.stringify(d);
  d[kind] = true;
  if (note && /^[A-G]$/.test(note)) { d.notes = d.notes || []; if (!d.notes.includes(note)) d.notes.push(note); }
  if (JSON.stringify(d) !== before) saveDays(r);
  return getDays(now);
}
/** Call when the learner completes a lesson step. note = that lesson's colour letter ('C'…'B'), for the week dot. */
export const recordLessonStep = (opts) => mark('lesson', opts);
/** Called by the daily game when today's puzzle is solved (practice puzzles never call this). */
export const recordPuzzleSolved = (opts) => mark('puzzle', opts);

/** Hide the welcome-back line for the rest of today (call after showing it once). */
export function dismissWelcomeBack(now = new Date()) { const r = loadDays(); r.welcomeDismissed = dayKey(now); saveDays(r); }
/** Clear all day history (used by ?reset=1 and "Reset all progress"). */
export function resetDays() { try { storage()?.removeItem(DAYS_KEY); } catch { /* */ } for (const fn of subs) { try { fn(getDays()); } catch { /* */ } } }

/** Current summary for the UI. */
export function getDays(now = new Date()) { return computeDays(loadDays(), dayKey(now)); }

/**
 * Pure: summary for a record and a "today" game-day key.
 * → { total, run, best, todayCounted, runAlive, welcomeBack, week: [{ date, state, note, today }] }
 *   week = Mon–Sun containing today; state: 'played' | 'rest' | 'missed' | 'today' | 'future';
 *   note = first note learned that day ('C'…), or null (puzzle-only → cream dot).
 */
export function computeDays(record, today) {
  const days = record?.days || {};
  const counted = Object.keys(days).filter((k) => days[k] && (days[k].lesson || days[k].puzzle) && daysBetween(k, today) >= 0).sort();
  const nums = counted.map((k) => daysBetween(counted[0] || today, k));
  // runs: break when the gap between counted days is ≥ 3 (= two or more missed days in a row)
  let best = 0, len = 0;
  for (let i = 0; i < nums.length; i++) {
    len = i > 0 && nums[i] - nums[i - 1] <= 2 ? len + 1 : 1;
    best = Math.max(best, len);
  }
  const last = counted[counted.length - 1];
  const sinceLast = last ? daysBetween(last, today) : Infinity;
  const runAlive = sinceLast <= 2;              // today, yesterday, or one rest day in between
  const run = runAlive ? len : 0;
  const todayCounted = sinceLast === 0;
  const isCounted = (k) => !!(days[k] && (days[k].lesson || days[k].puzzle));
  // welcome back: the last counted day before today is ≥ 3 days ago (run ended while away)
  const prev = counted.filter((k) => k < today).pop();
  const welcomeBack = !!prev && daysBetween(prev, today) >= 3 && record.welcomeDismissed !== today;

  // week strip, Mon–Sun
  const [y, m, d] = today.split('-').map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // 0 = Monday
  const monday = addDays(today, -dow);
  const week = [];
  for (let i = 0; i < 7; i++) {
    const k = addDays(monday, i);
    let state;
    if (isCounted(k)) state = 'played';
    else if (k > today) state = 'future';
    else if (k === today) state = 'today';
    else {
      // rest = a single missed day right after a counted day, followed by a counted day or by today
      const before = addDays(k, -1), after = addDays(k, 1);
      state = isCounted(before) && (isCounted(after) || after === today) ? 'rest' : 'missed';
    }
    week.push({ date: k, state, note: (days[k]?.notes || [])[0] || null, today: k === today });
  }
  return { total: counted.length, run, best, todayCounted, runAlive, welcomeBack, week, today };
}

/**
 * Optional convenience: count a day automatically whenever the lesson engine logs a finished
 * (not skipped) step. noteFor(lessonId) → the lesson's colour letter, or null.
 * Returns an unsubscribe function. Use EITHER this OR call recordLessonStep() yourself, not both
 * (both is harmless — recording the same day twice changes nothing).
 */
export function attachLessonTracking(log, { noteFor = () => null } = {}) {
  if (!log?.subscribe) return () => {};
  return log.subscribe((e) => {
    if (e.type === 'step_done' && !e.skipped) recordLessonStep({ note: noteFor(e.lesson) });
  });
}
