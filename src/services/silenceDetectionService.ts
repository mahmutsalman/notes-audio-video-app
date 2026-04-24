const SILENCE_THRESHOLD = 0.01;   // RMS below this = silence
const VOICE_THRESHOLD   = 0.015;  // RMS above this = voice (hysteresis)
const SILENCE_DURATION_MS = 500;  // ms of silence before firing onAutoPause
const BUFFER_SIZE = 4096;
const RESUME_GUARD_MS = 300;      // ignore voice bursts for this long after auto-pause fires
const VOICE_SUSTAIN_MS = 200;     // voice must stay above threshold for this long to trigger resume

class SilenceDetectionService {
  onAutoPause?: () => void;
  onAutoResume?: () => void;

  private scriptProcessor: ScriptProcessorNode | null = null;
  private silentGain: GainNode | null = null;
  private enabled = false;

  private isInSilence = false;
  private silenceStartTime: number | null = null;
  private autoPauseFired = false;
  private resumeIgnoreUntil = 0;
  private voiceStartTime: number | null = null; // tracks sustained voice while auto-paused

  start(audioContext: AudioContext, sourceNode: MediaStreamAudioSourceNode) {
    if (this.scriptProcessor) return; // already running

    this.scriptProcessor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
    this.silentGain = audioContext.createGain();
    this.silentGain.gain.value = 0;

    this.scriptProcessor.onaudioprocess = (e) => {
      if (!this.enabled) return;

      const samples = e.inputBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
      const rms = Math.sqrt(sum / samples.length);

      const now = Date.now();

      if (rms < SILENCE_THRESHOLD) {
        if (!this.isInSilence) {
          this.isInSilence = true;
          this.silenceStartTime = now;
        }
        if (!this.autoPauseFired && this.silenceStartTime !== null) {
          if (now - this.silenceStartTime >= SILENCE_DURATION_MS) {
            this.autoPauseFired = true;
            this.resumeIgnoreUntil = now + RESUME_GUARD_MS;
            this.onAutoPause?.();
          }
        }
        // Brief drop back to silence resets the sustained-voice counter
        this.voiceStartTime = null;
      } else if (rms >= VOICE_THRESHOLD) {
        if (this.isInSilence && now > this.resumeIgnoreUntil) {
          if (!this.autoPauseFired) {
            // Silence was brief (pause not fired yet) — reset immediately
            this.isInSilence = false;
            this.silenceStartTime = null;
          } else {
            // Auto-paused — require sustained voice before resuming
            if (this.voiceStartTime === null) this.voiceStartTime = now;
            if (now - this.voiceStartTime >= VOICE_SUSTAIN_MS) {
              this.isInSilence = false;
              this.silenceStartTime = null;
              this.voiceStartTime = null;
              this.autoPauseFired = false;
              this.onAutoResume?.();
            }
          }
        }
      }
    };

    sourceNode.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.silentGain);
    this.silentGain.connect(audioContext.destination);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) {
      this.isInSilence = false;
      this.silenceStartTime = null;
      this.autoPauseFired = false;
      this.resumeIgnoreUntil = 0;
      this.voiceStartTime = null;
    }
  }

  stop() {
    if (this.scriptProcessor) {
      try { this.scriptProcessor.disconnect(); } catch { /* ignore */ }
      this.scriptProcessor = null;
    }
    if (this.silentGain) {
      try { this.silentGain.disconnect(); } catch { /* ignore */ }
      this.silentGain = null;
    }
    this.isInSilence = false;
    this.silenceStartTime = null;
    this.autoPauseFired = false;
    this.resumeIgnoreUntil = 0;
    this.voiceStartTime = null;
    this.enabled = false;
  }

  get isAutoPaused() {
    return this.autoPauseFired;
  }
}

export const silenceDetectionService = new SilenceDetectionService();
