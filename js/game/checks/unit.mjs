// Node unit checks for the daily game (no browser):  node app/js/game/checks/unit.mjs
//  1. 30 seeded days are solvable (solver path replays to solved; start rebuilt from the solved
//     board with exact reverse pours), match the spec shape and reject rules, and are deterministic.
//  2. Days-played / run rules from design/04 §5.
import assert from 'node:assert/strict';
import * as P from '../puzzle.js';
import { computeDays } from '../streak.js';

let failures = 0;
const check = (name, fn) => { try { fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message); } };

console.log('Puzzle generation — 30 seeded days from 2026-11-23');
const rows = [];
for (let i = 0; i < 30; i++) {
  const day = P.addDays('2026-11-23', i);
  check(`${day} (#${i + 1})`, () => {
    const g = P.dailyPuzzle(day);
    assert.equal(g.n, i + 1);
    assert.equal(g.tubes.length, 7);
    assert.deepEqual(g.tubes.map((t) => t.length), [4, 4, 4, 4, 4, 0, 0]);
    const counts = [0, 0, 0, 0, 0]; g.tubes.flat().forEach((c) => counts[c]++);
    assert.deepEqual(counts, [4, 4, 4, 4, 4], 'each note exactly 4 layers');
    assert.ok(P.acceptableStart(g.tubes), 'reject rules');
    for (const t of g.tubes) if (t.length) { assert.ok(!P.tubeDone(t)); for (let k = 2; k < 4; k++) assert.ok(!(t[k] === t[k - 1] && t[k] === t[k - 2]), '3 in a row'); }
    // replay the certificate with the game's own pour()
    let s = P.clone(g.tubes);
    for (const [a, b] of g.solution) { const r = P.pour(s, a, b); assert.ok(r, `illegal move ${a}->${b}`); s = r.state; }
    assert.ok(P.isSolved(s), 'solution reaches solved');
    // independent re-solve
    assert.ok(P.solve(g.tubes), 'independent solve');
    // rebuild start from the solved board with exact reverse pours
    assert.deepEqual(P.rebuildByReverse(g.tubes, g.solution), g.tubes, 'reverse rebuild');
    // determinism
    assert.deepEqual(P.dailyPuzzle(day).tubes, g.tubes, 'same date -> same puzzle');
    rows.push(`${day} #${g.n} reseeds=${g.rejects} solverMoves=${g.solution.length}`);
  });
}
check('different days give different puzzles', () => {
  const set = new Set(); for (let i = 0; i < 30; i++) set.add(JSON.stringify(P.dailyPuzzle(P.addDays('2026-11-23', i)).tubes));
  assert.equal(set.size, 30);
});
check('day boundary 03:00 local', () => {
  assert.equal(P.dayKey(new Date(2026, 10, 25, 2, 59)), '2026-11-24');
  assert.equal(P.dayKey(new Date(2026, 10, 25, 3, 0)), '2026-11-25');
  assert.equal(P.puzzleNumber('2026-11-25'), 3);
});
check('rules: pour moves the whole top run that fits, only onto same colour or empty', () => {
  const s = [[0, 1, 1], [2, 1], [], [3, 3, 3, 3], [4], [0], [2, 2, 2]];
  assert.equal(P.pourCount(s, 0, 1), 2);   // 1,1 onto 1 (space 2)
  assert.equal(P.pourCount(s, 0, 2), 2);   // into empty
  assert.equal(P.pourCount(s, 0, 4), 0);   // colour mismatch
  assert.equal(P.pourCount(s, 4, 3), 0);   // full target
  assert.equal(P.pourCount(s, 2, 0), 0);   // empty source
  assert.equal(P.pourCount(s, 1, 1), 0);
});
check('stuck detection', () => {
  const stuck = [[0, 1, 0, 1], [1, 0, 1, 0], [2, 3, 2, 3], [3, 2, 3, 2], [4, 4, 4, 0], [0, 1, 2, 4], [4, 3, 1, 2]];
  assert.equal(P.hasLegalMove(stuck), false);
});
check('365 days generate quickly', () => {
  const t0 = Date.now(); for (let i = 0; i < 365; i++) P.dailyPuzzle(P.addDays('2026-11-23', i));
  assert.ok(Date.now() - t0 < 5000, `${Date.now() - t0} ms`);
});

console.log('\nDays played / runs (design/04 §5)');
const rec = (...ks) => ({ v: 1, days: Object.fromEntries(ks.map((k) => [k, { puzzle: true }])) });
check('new user: 0 days, empty week', () => {
  const d = computeDays({ v: 1, days: {} }, '2026-11-25');
  assert.equal(d.total, 0); assert.equal(d.run, 0); assert.equal(d.best, 0); assert.equal(d.welcomeBack, false);
  assert.ok(d.week.every((w) => w.state === 'missed' || w.state === 'today' || w.state === 'future'));
  assert.ok(!d.week.some((w) => w.state === 'played' || w.state === 'rest'));
});
check('consecutive days build a run', () => {
  const d = computeDays(rec('2026-11-23', '2026-11-24', '2026-11-25'), '2026-11-25');
  assert.equal(d.total, 3); assert.equal(d.run, 3); assert.equal(d.todayCounted, true);
});
check('one missed day = rest day, run continues, adds nothing', () => {
  const d = computeDays(rec('2026-11-23', '2026-11-25'), '2026-11-25');
  assert.equal(d.run, 2); assert.equal(d.total, 2);
  assert.equal(d.week.find((w) => w.date === '2026-11-24').state, 'rest');
});
check('yesterday missed, today not yet played: run waits (rest shown)', () => {
  const d = computeDays(rec('2026-11-22', '2026-11-23'), '2026-11-25');
  assert.equal(d.run, 2); assert.equal(d.runAlive, true); assert.equal(d.welcomeBack, false);
  assert.equal(d.week.find((w) => w.date === '2026-11-24').state, 'rest');
});
check('two missed days end the run silently; total kept; welcome back once', () => {
  const d = computeDays(rec('2026-11-20', '2026-11-21', '2026-11-22'), '2026-11-25');
  assert.equal(d.run, 0); assert.equal(d.total, 3); assert.equal(d.best, 3); assert.equal(d.welcomeBack, true);
  const dismissed = computeDays({ ...rec('2026-11-20', '2026-11-21', '2026-11-22'), welcomeDismissed: '2026-11-25' }, '2026-11-25');
  assert.equal(dismissed.welcomeBack, false);
});
check('return after run ended: new run starts at 1, best kept', () => {
  const d = computeDays(rec('2026-11-18', '2026-11-19', '2026-11-20', '2026-11-25'), '2026-11-25');
  assert.equal(d.run, 1); assert.equal(d.best, 3); assert.equal(d.total, 4);
});
check('days played never decreases as time passes', () => {
  const r = rec('2026-11-01', '2026-11-02', '2026-11-10');
  let prev = 0;
  for (let i = 0; i < 60; i++) { const d = computeDays(r, P.addDays('2026-11-01', i)); assert.ok(d.total >= prev); prev = d.total; }
  assert.equal(prev, 3);
});
check('lesson step or puzzle both count; dot colour = note learned', () => {
  const r = { v: 1, days: { '2026-11-24': { lesson: true, notes: ['C'] }, '2026-11-25': { puzzle: true } } };
  const d = computeDays(r, '2026-11-25');
  assert.equal(d.total, 2);
  assert.equal(d.week.find((w) => w.date === '2026-11-24').note, 'C');
  assert.equal(d.week.find((w) => w.date === '2026-11-25').note, null);
});
check('week strip is Mon–Sun', () => {
  const d = computeDays(rec(), '2026-11-25'); // Wednesday
  assert.equal(d.week[0].date, '2026-11-23'); assert.equal(d.week[6].date, '2026-11-29');
  assert.equal(d.week[2].state, 'today'); assert.equal(d.week[3].state, 'future');
});

console.log('\n' + rows.join('\n'));
console.log(failures ? `\n${failures} FAILED` : '\nAll unit checks passed.');
process.exit(failures ? 1 : 0);
