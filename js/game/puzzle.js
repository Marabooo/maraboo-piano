// Note Sort — pure puzzle logic (no DOM, no audio). Spec: design/04_daily_game_and_streak.md §2–3.
//
// A state is an array of 7 tubes; each tube is an array of colour indices, bottom → top.
// Colour index 0..4 = notes C D E F G. Tube capacity 4.
//
// Generation (guaranteed solvable): spec §3 — seeded shuffle, reject rules, memoised DFS solver,
// re-seed on reject. A puzzle is only accepted together with a solver-found move list, so every
// daily puzzle ships with a proof that it can be solved. (A pure random walk of reverse pours from
// the solved board was tried first; it gets trapped in 4-full/1-empty states and almost never
// reaches the spec's 5-full/2-empty start, so it is used only to *verify*: rebuildByReverse().)

export const NOTES = ['C', 'D', 'E', 'F', 'G'];
export const MIDI = [60, 62, 64, 65, 67];   // C4 … G4
export const CAP = 4;
export const TUBES = 7;
export const EPOCH = '2026-11-23';           // puzzle #1
export const DAY_BOUNDARY_HOURS = 3;         // 03:00 local time

// ---------- dates (03:00 local day boundary) ----------
const pad2 = (n) => String(n).padStart(2, '0');
/** Game day key 'YYYY-MM-DD' for a Date: local date of (time − 3 h). */
export function dayKey(date = new Date()) {
  const d = new Date(date.getTime() - DAY_BOUNDARY_HOURS * 3600e3);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
/** Whole days from key a to key b (calendar arithmetic, DST-safe). */
export function daysBetween(a, b) {
  const p = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((p(b) - p(a)) / 86400e3);
}
export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}
/** Puzzle number n = days since 2026-11-23 + 1. */
export const puzzleNumber = (key) => daysBetween(EPOCH, key) + 1;

// ---------- seeded randomness ----------
/** 32-bit FNV-1a hash of a string. */
export function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const seedForDay = (key) => hashString('klang-' + key);

// ---------- rules ----------
export const clone = (s) => s.map((t) => t.slice());
export const top = (t) => t[t.length - 1];
export function topRun(t) {
  if (!t.length) return 0;
  const c = top(t); let n = 0;
  for (let i = t.length - 1; i >= 0 && t[i] === c; i--) n++;
  return n;
}
export const tubeDone = (t) => t.length === CAP && t.every((c) => c === t[0]);
/** Solved when every non-empty tube holds 4 layers of one colour. */
export const isSolved = (s) => s.every((t) => t.length === 0 || tubeDone(t));

/** How many layers a pour from → to would move (0 = not allowed). */
export function pourCount(s, from, to) {
  if (from === to) return 0;
  const a = s[from], b = s[to];
  if (!a || !b || !a.length || b.length >= CAP) return 0;
  if (b.length && top(b) !== top(a)) return 0;
  return Math.min(topRun(a), CAP - b.length);
}
/** Apply a pour. Returns { state, count, colour } or null if not allowed. Does not mutate s. */
export function pour(s, from, to) {
  const count = pourCount(s, from, to);
  if (!count) return null;
  const n = clone(s);
  const colour = top(n[from]);
  for (let i = 0; i < count; i++) n[to].push(n[from].pop());
  return { state: n, count, colour };
}
export function legalMoves(s) {
  const out = [];
  for (let a = 0; a < s.length; a++) for (let b = 0; b < s.length; b++) if (pourCount(s, a, b)) out.push([a, b]);
  return out;
}
export const hasLegalMove = (s) => legalMoves(s).length > 0;

// ---------- solver (memoised DFS) ----------
const key = (s) => s.map((t) => t.join('')).sort().join('|'); // tube order does not matter

/** Returns a list of moves [[from,to],…] that solves s, or null. */
export function solve(start, { maxNodes = 200000 } = {}) {
  const seen = new Set();
  const path = [];
  let nodes = 0;
  const dfs = (s) => {
    if (isSolved(s)) return true;
    const k = key(s);
    if (seen.has(k) || ++nodes > maxNodes) return false;
    seen.add(k);
    for (const [a, b] of legalMoves(s)) {
      // pointless: moving a whole single-colour tube into an empty tube
      if (!s[b].length && topRun(s[a]) === s[a].length) continue;
      const r = pour(s, a, b);
      path.push([a, b]);
      if (dfs(r.state)) return true;
      path.pop();
    }
    return false;
  };
  return dfs(clone(start)) ? path.slice() : null;
}

// ---------- generation ----------
function same(x, y) {
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) {
    const a = x[i], b = y[i];
    if (a.length !== b.length) return false;
    for (let j = 0; j < a.length; j++) if (a[j] !== b[j]) return false;
  }
  return true;
}
/** All states P such that a single legal forward pour turns P into s. */
export function reverseMoves(s) {
  const out = [];
  for (let b = 0; b < s.length; b++) {
    const run = topRun(s[b]);
    for (let k = 1; k <= run; k++) {
      for (let a = 0; a < s.length; a++) {
        if (a === b || s[a].length + k > CAP) continue;
        const p = clone(s);
        const moved = p[b].splice(p[b].length - k, k);
        p[a].push(...moved);
        const f = pour(p, a, b);
        if (f && same(f.state, s)) out.push({ state: p, from: a, to: b });
      }
    }
  }
  return out;
}
const hasTripleRun = (t) => { for (let i = 2; i < t.length; i++) if (t[i] === t[i - 1] && t[i] === t[i - 2]) return true; return false; };

/** Spec reject rules for a start position. */
export function acceptableStart(s) {
  const full = s.filter((t) => t.length === CAP).length, empty = s.filter((t) => !t.length).length;
  if (full !== 5 || empty !== 2) return false;
  for (const t of s) { if (!t.length) continue; if (tubeDone(t) || hasTripleRun(t)) return false; }
  return true;
}

/**
 * Generate the start position for a numeric seed (spec §3). Deterministic.
 * Seeded Fisher–Yates shuffle of the 20 layers into tubes 1–5 (tubes 6–7 empty); reject if a tube
 * starts solved, has 3+ identical layers in a row, or the DFS solver finds no solution; then re-seed
 * with seed+1. The solver's move list is kept as a solvability certificate (tests replay it, and
 * also rebuild the start from the solved board with exact reverse pours).
 * Returns { tubes, seed (the one that worked), rejects, solution }.
 */
export function generate(seed, { maxReseeds = 500 } = {}) {
  for (let r = 0; r < maxReseeds; r++) {
    const s0 = (seed + r) >>> 0;
    const rnd = mulberry32(s0);
    const layers = [];
    for (let c = 0; c < NOTES.length; c++) for (let i = 0; i < CAP; i++) layers.push(c);
    for (let i = layers.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [layers[i], layers[j]] = [layers[j], layers[i]]; }
    const tubes = [];
    for (let t = 0; t < NOTES.length; t++) tubes.push(layers.slice(t * CAP, t * CAP + CAP));
    tubes.push([], []);
    if (!acceptableStart(tubes)) continue;
    const solution = solve(tubes);
    if (solution) return { tubes, seed: s0, rejects: r, solution };
  }
  throw new Error('Note Sort: no puzzle found for seed ' + seed);
}

/** Rebuild a start position from the solved end of a solution, using only exact reverse pours. */
export function rebuildByReverse(start, solution) {
  const states = [clone(start)];
  for (const [a, b] of solution) states.push(pour(states[states.length - 1], a, b).state);
  let s = states[states.length - 1];
  if (!isSolved(s)) return null;
  for (let i = solution.length - 1; i >= 0; i--) {
    const [a, b] = solution[i];
    const hit = reverseMoves(s).find((m) => m.from === a && m.to === b && same(m.state, states[i]));
    if (!hit) return null;
    s = hit.state;
  }
  return s;
}

/** Today's (or any day's) daily puzzle. */
export function dailyPuzzle(key) {
  const g = generate(seedForDay(key));
  return { ...g, day: key, n: puzzleNumber(key) };
}
