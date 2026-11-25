// Tiny event emitter used by every engine module.
export class Emitter {
  constructor() { this._h = new Map(); }
  /** Subscribe; returns an unsubscribe function. Use '*' to receive every event as (type, data). */
  on(type, fn) {
    if (!this._h.has(type)) this._h.set(type, new Set());
    this._h.get(type).add(fn);
    return () => this.off(type, fn);
  }
  once(type, fn) {
    const off = this.on(type, (d) => { off(); fn(d); });
    return off;
  }
  off(type, fn) { this._h.get(type)?.delete(fn); }
  emit(type, data) {
    for (const fn of [...(this._h.get(type) || [])]) {
      try { fn(data); } catch (e) { console.error(`[emitter] ${type} handler failed`, e); }
    }
    for (const fn of [...(this._h.get('*') || [])]) {
      try { fn(type, data); } catch (e) { console.error('[emitter] * handler failed', e); }
    }
  }
}
