// One microphone listener for the whole app (permission is asked once, in the mode-choice flow).
import { MicListener, micSupport } from '../engine/pitch.js';
import { audio } from '../engine/audio.js';
import { log } from '../engine/log.js';

let mic = null;

export const micSession = {
  support: micSupport,
  get running() { return !!mic?.running; },
  get listener() { return mic; },
  /** Ask for permission and start. Throws { code } (see MIC_MESSAGES in pitch.js). */
  async start() {
    if (mic?.running) return mic;
    audio.unlock();
    mic = new MicListener();
    // Klang's own sounds would be heard: ignore notes while the app is sounding (+300 ms, 01 §8.1)
    mic.suppress = () => audio.isOutputActive(0.3);
    try {
      await mic.start(audio.ctx);
      log.event('mic_start', { sampleRate: audio.ctx.sampleRate });
    } catch (e) {
      log.event('mic_error', { code: e.code });
      mic = null;
      throw e;
    }
    return mic;
  },
  stop() { mic?.stop(); mic = null; },
};
