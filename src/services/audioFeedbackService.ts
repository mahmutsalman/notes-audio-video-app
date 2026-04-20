import type { AudioMarkerType } from '../types';

// Pitch centers per marker type (Hz)
// important → A family, question → C family, similar → E family
const TONES: Record<AudioMarkerType, { low: number; high: number }> = {
  important:        { low: 440,  high: 880  },  // A4 → A5
  question:         { low: 523,  high: 1046 },  // C5 → C6
  similar_question: { low: 659,  high: 1318 },  // E5 → E6
};

function playTone(ctx: AudioContext, freq: number, startAt: number, duration: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, startAt);

  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(0.35, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startAt);
  osc.stop(startAt + duration + 0.01);
}

class AudioFeedbackService {
  private play(tones: { freq: number; start: number }[], totalDuration: number) {
    try {
      const ctx = new AudioContext();
      const noteDuration = 0.12;
      for (const { freq, start } of tones) {
        playTone(ctx, freq, ctx.currentTime + start, noteDuration);
      }
      setTimeout(() => ctx.close(), (totalDuration + 0.1) * 1000);
    } catch {
      // Silently ignore if audio is unavailable
    }
  }

  playFeedback(type: AudioMarkerType, on: boolean) {
    const { low, high } = TONES[type];
    const gap = 0.05;
    const step = 0.12 + gap;
    if (on) {
      // Ascending: low → high
      this.play([{ freq: low, start: 0 }, { freq: high, start: step }], step + 0.12);
    } else {
      // Descending: high → low
      this.play([{ freq: high, start: 0 }, { freq: low, start: step }], step + 0.12);
    }
  }

  // Pause: two low descending notes (clearly "stopping")
  playPauseFeedback() {
    const step = 0.12 + 0.05;
    this.play([{ freq: 277, start: 0 }, { freq: 196, start: step }], step + 0.12);
  }

  // Resume: two low ascending notes (clearly "starting")
  playResumeFeedback() {
    const step = 0.12 + 0.05;
    this.play([{ freq: 196, start: 0 }, { freq: 277, start: step }], step + 0.12);
  }

  // Stop: three descending notes (G4→E4→C4) — feels final/conclusive
  playStopFeedback() {
    const step = 0.12 + 0.04;
    this.play([
      { freq: 392, start: 0 },
      { freq: 330, start: step },
      { freq: 262, start: step * 2 },
    ], step * 2 + 0.12);
  }
}

export const audioFeedbackService = new AudioFeedbackService();
