// Persistent app state in localStorage (settings, progress, resume point).
// Everything is wrapped in try/catch: private browsing or full storage must never break the app.

const KEY = 'klang.state.v1';

export const DEFAULT_SETTINGS = {
  labels: 'letters',       // 'letters' | 'solfege' | 'off'  — default Letters for everyone (test task T2)
  lastNaming: 'letters',   // naming used in text while labels are off
  practiceMode: null,      // null = ask at the first lesson start; then 'touch' | 'mic'
  waitMode: 'soft',        // 'soft' | 'strict' (01 §4.5; ?wait= overrides)
  hints: 'auto',           // 'auto' | 'ask'
  keySize: 'normal',       // 'bigger' | 'normal' | 'more' (64 / 52 / 44 px)
  backing: true,           // soft pad
  volume: 0.8,
  lessMotion: false,
  lang: null,              // null = browser language
  completionVariant: 'A',  // 'A' "You can now…" | 'B' neutral (exploratory A/B, test plan §6)
  soundConfirmed: false,
};

const empty = () => ({
  v: 1,
  settings: { ...DEFAULT_SETTINGS },
  progress: {},        // lessonId -> { completed: true, completedAt, timesCompleted, foundAlone: [...] }
  resume: null,        // { lessonId, stepIndex, stepState, at }
  seenCoach: [],
  songs: {},           // songId -> { title, lessonId, learnedAt, recordings: [ {notes, tempo, at} ] (last 3) }
});

class Store {
  constructor() {
    this.state = empty();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        this.state = { ...empty(), ...s, settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) } };
      }
    } catch { /* keep defaults */ }
    this._subs = new Set();
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* storage full / private mode */ }
    for (const fn of this._subs) fn(this.state);
  }
  subscribe(fn) { this._subs.add(fn); return () => this._subs.delete(fn); }

  get settings() { return this.state.settings; }
  set(key, value) { this.state.settings[key] = value; this.save(); }

  lessonProgress(id) { return this.state.progress[id] || null; }
  markComplete(id, extra = {}) {
    const p = this.state.progress[id] || { timesCompleted: 0 };
    this.state.progress[id] = { ...p, ...extra, completed: true, completedAt: new Date().toISOString(), timesCompleted: (p.timesCompleted || 0) + 1 };
    if (this.state.resume?.lessonId === id) this.state.resume = null;
    this.save();
  }

  setResume(r) { this.state.resume = r ? { ...r, at: new Date().toISOString() } : null; this.save(); }
  get resume() { return this.state.resume; }

  markCoachSeen(id) { if (!this.state.seenCoach.includes(id)) { this.state.seenCoach.push(id); this.save(); } }
  coachSeen(id) { return this.state.seenCoach.includes(id); }

  addSong(song, lessonId, recording) {
    if (!song) return;
    const cur = this.state.songs[song.id] || { title: song.title, lessonId, learnedAt: new Date().toISOString(), recordings: [] };
    if (recording) { cur.recordings.unshift({ ...recording, at: new Date().toISOString() }); cur.recordings = cur.recordings.slice(0, 3); }
    this.state.songs[song.id] = cur;
    this.save();
  }
  get songs() { return this.state.songs || {}; }

  resetProgress() { const s = this.state.settings; this.state = empty(); this.state.settings = s; this.save(); }
  resetAll() { this.state = empty(); this.save(); }
}

export const store = new Store();
