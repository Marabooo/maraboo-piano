// Storage namespace for test/study mode (testing/06 §1.5–1.6). MUST be the first import in main.js.
// In test mode every 'klang.*' localStorage key (app, log, game, days) is transparently rewritten to
// 'klang.test.*' (study: 'klang.study.*'), so normal-app progress is never touched and every
// test participant starts fresh. Nothing is sent anywhere.
const q = new URLSearchParams(location.search);
const ACTIVE_STUDY = 'klang.study.active';
let mode = null, code = null;
const rawGet = Storage.prototype.getItem, rawSet = Storage.prototype.setItem, rawRemove = Storage.prototype.removeItem;
const ls = (() => { try { return window.localStorage; } catch { return null; } })();

if (q.get('study')) { mode = 'study'; code = q.get('study').toUpperCase(); }
else if (q.get('test') === '1') { mode = 'test'; code = q.get('pid') || null; }
else if (ls) {
  // installed icon / reload without the parameters: stay in the study if one is running
  try { const a = JSON.parse(rawGet.call(ls, ACTIVE_STUDY) || 'null'); if (a && a.code && !a.finished) { mode = 'study'; code = a.code; } } catch { /* */ }
}

export const NS = { mode, code, prefix: mode ? `klang.${mode}.` : 'klang.', ACTIVE_STUDY };

if (mode && ls) {
  const map = (k) => (typeof k === 'string' && k.startsWith('klang.') && !k.startsWith('klang.test.') && !k.startsWith('klang.study.') ? NS.prefix + k.slice(6) : k);
  Storage.prototype.getItem = function (k) { return rawGet.call(this, this === ls ? map(k) : k); };
  Storage.prototype.setItem = function (k, v) { return rawSet.call(this, this === ls ? map(k) : k, v); };
  Storage.prototype.removeItem = function (k) { return rawRemove.call(this, this === ls ? map(k) : k); };
}

/** Remove every key of the current namespace (Delete test data). */
export function wipeNamespace() {
  if (!ls || !mode) return;
  const keys = [];
  for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && k.startsWith(NS.prefix)) keys.push(k); }
  keys.forEach((k) => rawRemove.call(ls, k));
}
export const rawStorage = { get: (k) => (ls ? rawGet.call(ls, k) : null), set: (k, v) => { try { ls && rawSet.call(ls, k, v); } catch { /* */ } }, remove: (k) => ls && rawRemove.call(ls, k) };
