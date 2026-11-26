// Klang service worker: network-first for app files (testers always get the latest version when
// online), cache fallback offline; cache-first for the immutable piano samples.
// After adding files, add them to PRECACHE and bump VERSION.
const VERSION = 'klang-v0.9.12';
const PRECACHE = [
  './', './index.html', './manifest.webmanifest', './css/app.css', './css/keyboard.css',
  './js/main.js',
  './js/engine/audio.js', './js/engine/emitter.js', './js/engine/falling.js', './js/engine/input.js',
  './js/engine/keyboard.js', './js/engine/lesson.js', './js/engine/log.js', './js/engine/notes.js', './js/engine/pitch.js',
  './js/app/router.js', './js/app/store.js', './js/app/ui.js', './js/app/i18n.js', './js/app/notemark.js', './js/app/da.js', './js/app/screens/tabs.js', './js/app/screens/learn.js', './js/app/screens/puzzles.js', './js/app/screens/minigames.js', './js/app/strings.js',
  './js/app/days.js', './js/app/micSession.js', './js/app/sheets.js', './js/app/portrait.js',
  './js/app/screens/home.js', './js/app/screens/lessonIntro.js', './js/app/screens/mode.js',
  './js/app/screens/practice.js', './js/app/screens/complete.js', './js/app/screens/settings.js', './js/app/screens/game.js',
  './css/game.css', './js/game/daily-game.js', './js/game/puzzle.js', './js/game/sound.js', './js/game/streak.js', './js/game/strings.js',
  './js/testmode/ns.js', './js/testmode/testmode.js', './js/testmode/texts.js', './js/testmode/study-config.js',
  './js/lessons/index.js', './js/lessons/shared.js',
  './js/lessons/L1.js', './js/lessons/L2.js', './js/lessons/L3.js', './js/lessons/L4.js', './js/lessons/L5.js', './js/lessons/L6.js', './js/lessons/L7.js', './js/lessons/L8.js', './js/lessons/L9.js', './js/lessons/L10.js', './js/lessons/L11.js', './js/lessons/L12.js',
  './assets/icons/icon.svg', './assets/icons/icon-192.png', './assets/icons/icon-512.png', './assets/icons/apple-touch-icon.png',
  ...['Fs2', 'A2', 'C3', 'Ds3', 'Fs3', 'A3', 'C4', 'Ds4', 'Fs4', 'A4', 'C5', 'Ds5', 'Fs5', 'A5', 'C6', 'Ds6', 'Fs6'].map((n) => `./assets/samples/${n}.mp3`),
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.url.includes('/dev/')) return;
  if (req.url.includes('/assets/samples/')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res; })));
    return;
  }
  // always revalidate app files with the server (cheap 304s) so a new version shows on the next open
  e.respondWith(fetch(req, { cache: 'no-cache' }).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html'))));
});
