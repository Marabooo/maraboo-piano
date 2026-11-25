// Browser checks for the daily game in Chromium (Playwright), using the standalone harness dev.html.
//   $env:PLAYWRIGHT_DIR = "<folder with node_modules/playwright>"; node app/js/game/checks/browser.mjs
// Screenshots → testing/team-checks/screens/game-*.png. These are team checks (predictions), not findings.
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { startServer } from '../../../dev/serve.mjs';
import { loadPlaywright } from '../../../dev/checks/pw.mjs';

const SHOTS = resolve(fileURLToPath(new URL('../../../../testing/team-checks/screens/', import.meta.url)));
await mkdir(SHOTS, { recursive: true });
const { chromium } = await loadPlaywright();
const { server, url } = await startServer({ port: 8190, quiet: true });
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const DATE = '2026-11-25';
const base = (extra = '') => `${url}js/game/dev.html?date=${DATE}&shots=1${extra}`;

let failures = 0; const notes = [];
const ok = (cond, msg) => { if (cond) console.log('  ok  ', msg); else { failures++; console.log('  FAIL', msg); } };

const VIEWPORTS = [
  { name: 'landscape-844x390', width: 844, height: 390, touch: true },
  { name: 'landscape-667x375', width: 667, height: 375, touch: true },
  { name: 'portrait-390x844', width: 390, height: 844, touch: true },
  { name: 'desktop-1280x800', width: 1280, height: 800, touch: false },
];

async function newPage(vp, { reducedMotion = 'no-preference', share = 'none' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: false, reducedMotion, deviceScaleFactor: 2 });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url });
  await ctx.addInitScript((mode) => {
    window.__shared = [];
    if (mode === 'none') Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    if (mode === 'mock') Object.defineProperty(navigator, 'share', { value: async (d) => { window.__shared.push(d); }, configurable: true });
  }, share);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
  return { ctx, page, errors };
}
const tube = (page, i) => page.locator('.kg-tube').nth(i);
async function tap(page, vp, i) { if (vp.touch) await tube(page, i).tap(); else await tube(page, i).click(); }
async function idle(page) { await page.waitForFunction(() => !window.kgame.debug.busy); }
async function move(page, vp, a, b) { await tap(page, vp, a); await tap(page, vp, b); await idle(page); }
async function solveAll(page, vp, { stopAfter = Infinity } = {}) {
  const sol = await page.evaluate(() => window.kgame.debug.solutionFromHere());
  let n = 0;
  for (const [a, b] of sol) { if (n++ >= stopAfter) return; await move(page, vp, a, b); }
}
async function layoutReport(page) {
  return page.evaluate(() => {
    const vw = innerWidth, vh = innerHeight;
    const tubes = [...document.querySelectorAll('.kg-tube')].map((e) => e.getBoundingClientRect());
    const glass = [...document.querySelectorAll('.kg-glass')].map((e) => e.getBoundingClientRect());
    const ctrls = [...document.querySelectorAll('.kg-controls .kg-btn, .kg-back')].filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect());
    const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    return {
      hScroll: document.documentElement.scrollWidth > vw || document.body.scrollWidth > vw,
      inside: glass.every((r) => r.left >= 0 && r.right <= vw && r.top >= 0 && r.bottom <= vh),
      minTubeW: Math.min(...tubes.map((r) => r.width)), minTubeH: Math.min(...tubes.map((r) => r.height)),
      minCtrl: Math.min(...ctrls.map((r) => Math.min(r.width, r.height))),
      tubeOverlap: tubes.some((a, i) => tubes.some((b, j) => i < j && overlap(a, b))),
      ctrlOverlap: glass.some((g) => ctrls.some((c) => overlap(g, c))),
      cols: document.querySelector('.kg-board').dataset.cols,
      layerPx: Math.round(document.querySelector('.kg-layer').getBoundingClientRect().height),
    };
  });
}

for (const vp of VIEWPORTS) {
  console.log(`\n${vp.name}`);
  const { ctx, page, errors } = await newPage(vp);
  await page.goto(base('&reset=1'));
  await page.waitForSelector('.kg-tube');
  await page.waitForTimeout(150);
  const L = await layoutReport(page);
  ok(!L.hScroll, 'no horizontal scroll');
  ok(L.inside, 'all tubes fully on screen');
  ok(L.minTubeW >= 44 && L.minTubeH >= 44, `tube tap targets ≥ 44 px (min ${Math.round(L.minTubeW)}×${Math.round(L.minTubeH)})`);
  ok(L.minCtrl >= 44, `controls ≥ 44 px (min ${Math.round(L.minCtrl)})`);
  ok(!L.tubeOverlap && !L.ctrlOverlap, 'no overlap between tubes / controls');
  notes.push(`${vp.name}: ${L.cols === '7' ? '1 row of 7' : '4 + 3'}, layer ${L.layerPx}px`);
  await page.screenshot({ path: `${SHOTS}/game-${vp.name}-start.png` });

  const start = await page.evaluate(() => window.kgame.debug.start);
  ok(JSON.stringify(start.map((t) => t.length)) === '[4,4,4,4,4,0,0]', '5 full + 2 empty tubes');
  const ev0 = await page.evaluate(() => window.kdev.log.events((e) => e.type === 'game_opened').length);
  ok(ev0 === 1, 'game_opened logged');

  // lift
  await tap(page, vp, 0);
  ok(await page.evaluate(() => window.kgame.debug.selected) === 0, 'tap lifts the tube');
  if (vp.name === 'landscape-844x390' || vp.name === 'portrait-390x844') await page.screenshot({ path: `${SHOTS}/game-${vp.name}-lifted.png` });
  await tap(page, vp, 0);
  ok(await page.evaluate(() => window.kgame.debug.selected) === null, 'tap again puts it down');

  // invalid target → shake, no move
  const bad = await page.evaluate(() => {
    const s = window.kgame.debug.state;
    for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) if (a !== b && s[a][s[a].length - 1] !== s[b][s[b].length - 1]) return [a, b];
    return null;
  });
  if (bad) {
    await tap(page, vp, bad[0]); await tap(page, vp, bad[1]);
    const r = await page.evaluate((a) => ({ sel: window.kgame.debug.selected, anim: document.querySelectorAll('.kg-glass')[a].getAnimations().length, same: JSON.stringify(window.kgame.debug.state) === JSON.stringify(window.kgame.debug.start), status: document.querySelector('.kg-status').textContent }), bad[0]);
    ok(r.sel === null && r.same && r.status === '', 'invalid target: no move, no message, tube put down');
    ok(r.anim > 0 || false, 'invalid target: source shakes');
  }

  // undo / start over
  const first = (await page.evaluate(() => window.kgame.debug.solutionFromHere()))[0];
  await move(page, vp, first[0], first[1]);
  ok(await page.evaluate(() => JSON.stringify(window.kgame.debug.state) !== JSON.stringify(window.kgame.debug.start)), 'a pour changes the board');
  await page.locator('.kg-undo').click();
  ok(await page.evaluate(() => JSON.stringify(window.kgame.debug.state) === JSON.stringify(window.kgame.debug.start)), 'Undo restores');
  await solveAll(page, vp, { stopAfter: 3 });
  await page.locator('.kg-restart').click();
  ok(await page.evaluate(() => JSON.stringify(window.kgame.debug.state) === JSON.stringify(window.kgame.debug.start)), 'Start over resets to the start position');

  // play to the middle, check resume after reload
  await solveAll(page, vp, { stopAfter: 6 });
  if (vp.name !== 'desktop-1280x800') await page.screenshot({ path: `${SHOTS}/game-${vp.name}-midway.png` });
  const mid = await page.evaluate(() => JSON.stringify(window.kgame.debug.state));
  await page.goto(base()); await page.waitForSelector('.kg-tube');
  ok(await page.evaluate(() => JSON.stringify(window.kgame.debug.state)) === mid, 'leaving mid-puzzle resumes the same position');

  // solve
  await solveAll(page, vp);
  ok(await page.evaluate(() => window.kgame.debug.solved), 'puzzle solved through taps');
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${SHOTS}/game-${vp.name}-tune.png` });
  await page.waitForSelector('.kg-result:not([hidden])', { timeout: 20000 });
  await page.waitForTimeout(300);
  const L2 = await page.evaluate(() => ({ hScroll: document.documentElement.scrollWidth > innerWidth, card: (() => { const r = document.querySelector('.kg-result').getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1; })(), text: document.querySelector('.kg-result').innerText }));
  ok(!L2.hScroll && L2.card, 'result card fits the screen');
  ok(/Solved!/.test(L2.text) && /It played: Jingle Bells/.test(L2.text) && /Lesson 4/.test(L2.text), 'result: solved, tune (#3 → Jingle Bells), lesson link');
  ok(!/move|time|second|\d+ ?s\b/i.test(L2.text.replace(/Lesson \d|#\d+/g, '')), 'no move count or time shown');
  await page.screenshot({ path: `${SHOTS}/game-${vp.name}-solved.png` });

  const evs = await page.evaluate(() => window.kdev.log.events((e) => e.type.startsWith('game')).map((e) => e.type));
  ok(evs.includes('game_played') && evs.includes('game_solved'), 'game_played + game_solved logged');
  const snd = await page.evaluate(() => [...new Set(window.kgame.debug.sounds.map((s) => s[0]))]);
  ok(['lift', 'glug', 'bell', 'tune'].every((k) => snd.includes(k)), `sounds fired: ${snd.join(', ')}`);
  const days = await page.evaluate(() => window.kdev.getDays());
  ok(days.total === 1 && days.todayCounted && days.run === 1, 'solving counts today (1 day played)');
  const usage = await page.evaluate(() => window.kdev.log.usage().game);
  ok(usage.plays >= 1, 'usage log game.plays updated');

  if (vp.name === 'landscape-844x390') {
    // share (copy fallback) — exact, spoiler-free text
    await page.locator('.kg-share').click();
    await page.waitForFunction(() => document.querySelector('.kg-copied')?.textContent);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    ok(clip === 'Klang note sort #3 ✓ — it played Jingle Bells 🎵 🟥🟧🟨🟩🟦', `share text copied: "${clip}"`);
    await page.screenshot({ path: `${SHOTS}/game-${vp.name}-copied.png` });
    // lesson link
    await page.locator('.kg-lesson').click();
    ok((await page.locator('#devlog').textContent()).includes('"lesson":4'), 'lesson link calls onGoToLesson({lesson:4})');
    // reopen: already solved, card shown, no second day
    await page.goto(base()); await page.waitForSelector('.kg-result:not([hidden])', { timeout: 3000 });
    ok(await page.evaluate(() => window.kgame.debug.solved && window.kdev.getDays().total === 1), 'reopening after solving shows the result, still 1 day');
    // practice
    await page.locator('.kg-practice').click();
    ok(/Practice/.test(await page.locator('.kg-number').textContent()), 'practice puzzle opens');
    await solveAll(page, vp);
    await page.waitForSelector('.kg-result:not([hidden])', { timeout: 20000 });
    ok(await page.locator('.kg-share').count() === 0, 'practice result has no Share');
    ok(await page.evaluate(() => window.kdev.getDays().total) === 1, 'practice does not change days');
    await page.screenshot({ path: `${SHOTS}/game-${vp.name}-practice-solved.png` });
  }
  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

// Romanian + Do-Re-Mi, portrait; mocked OS share sheet
{
  const vp = VIEWPORTS[2];
  console.log('\nportrait RO + solfège + share sheet');
  const { ctx, page, errors } = await newPage(vp, { share: 'mock' });
  await page.goto(base('&reset=1&lang=ro&labels=solfege&done=4'));
  await page.waitForSelector('.kg-tube');
  ok(/Sortează notele/.test(await page.locator('.kg-title').textContent()), 'Romanian title');
  ok(/^(Do|Re|Mi|Fa|Sol)$/.test(await page.locator('.kg-layer').first().textContent()), 'layers show Do-Re-Mi');
  await page.screenshot({ path: `${SHOTS}/game-portrait-ro-solfege-start.png` });
  await solveAll(page, vp);
  await page.locator('.kg-board').dispatchEvent('pointerup'); // skip the tune wait
  await page.waitForSelector('.kg-result:not([hidden])', { timeout: 20000 });
  const text = await page.locator('.kg-result').innerText();
  ok(/Rezolvat!/.test(text) && /O poți cânta și tu — Lecția 4/.test(text), 'RO result, known-lesson wording');
  await page.locator('.kg-share').click();
  const shared = await page.evaluate(() => window.__shared);
  ok(shared.length === 1 && shared[0].text === 'Klang · Sortează notele #3 ✓ — a cântat Jingle Bells 🎵 🟥🟧🟨🟩🟦', 'OS share sheet gets the RO text only on tap');
  await page.screenshot({ path: `${SHOTS}/game-portrait-ro-solved.png` });
  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

// labels Off still shows names; reduced motion works
{
  const vp = VIEWPORTS[0];
  console.log('\nlabels off + reduced motion');
  const { ctx, page, errors } = await newPage(vp, { reducedMotion: 'reduce' });
  await page.goto(base('&reset=1&labels=off'));
  await page.waitForSelector('.kg-tube');
  ok(/^[CDEFG]$/.test(await page.locator('.kg-layer').first().textContent()), 'labels Off: game still shows letters');
  await solveAll(page, vp);
  await page.waitForSelector('.kg-result:not([hidden])', { timeout: 20000 });
  ok(await page.locator('.kg-fly').count() === 0, 'reduced motion: no flying layers left');
  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

// other dates: puzzle number + tune rotation
{
  const vp = VIEWPORTS[3];
  console.log('\ndate handling');
  const { ctx, page } = await newPage(vp);
  await page.goto(`${url}js/game/dev.html?date=2026-11-26&hour=2&reset=1&shots=1`);
  await page.waitForSelector('.kg-tube');
  ok(/#3 ·/.test(await page.locator('.kg-number').textContent()), '02:00 on 26 Nov is still puzzle #3 (03:00 boundary)');
  await page.goto(`${url}js/game/dev.html?date=2026-11-26&hour=4&shots=1`);
  await page.waitForSelector('.kg-tube');
  ok(/#4 ·/.test(await page.locator('.kg-number').textContent()), '04:00 on 26 Nov is puzzle #4');
  await ctx.close();
}

console.log('\nLayouts: ' + notes.join('; '));
await browser.close(); server.close();
console.log(failures ? `\n${failures} FAILED` : '\nAll browser checks passed.');
process.exit(failures ? 1 : 0);
