/**
 * SoundTouchPlayer - Time-stretch audio player with pitch preservation
 *
 * Uses SoundTouchJS to change playback speed without affecting pitch.
 * Web Audio's native playbackRate changes pitch proportionally to speed.
 * SoundTouchJS uses WSOLA algorithm for true time-stretching.
 */

import { PitchShifter } from 'soundtouchjs';

export interface SoundTouchPlayerOptions {
  onTimeUpdate?: (time: number) => void;
  onEnd?: () => void;
  onLoad?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
}

export class SoundTouchPlayer {
  private audioContext: AudioContext | null = null;
  private shifter: PitchShifter | null = null;
  private gainNode: GainNode | null = null;
  private audioBuffer: AudioBuffer | null = null;

  private _isPlaying: boolean = false;
  private _duration: number = 0;
  private _tempo: number = 1.0;
  private _currentTime: number = 0;

  private updateInterval: ReturnType<typeof setInterval> | null = null;
  private options: SoundTouchPlayerOptions;

  constructor(options: SoundTouchPlayerOptions = {}) {
    this.options = options;
  }

  /**
   * Load audio from a blob URL and decode it
   * @returns Promise resolving to duration in seconds
   */
  async load(blobUrl: string): Promise<number> {
    // Clean up previous instance
    this.dispose();

    // Create audio context (must be after user gesture)
    this.audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    this.gainNode = this.audioContext.createGain();
    this.gainNode.connect(this.audioContext.destination);

    try {
      // Fetch and decode the audio
      const response = await fetch(blobUrl);

      // Check if disposed during fetch (e.g., component unmounted)
      if (!this.audioContext) {
        console.log('[SoundTouchPlayer] Aborted: context disposed during fetch');
        return 0;
      }

      const arrayBuffer = await response.arrayBuffer();

      // Check again after arrayBuffer conversion
      if (!this.audioContext) {
        console.log('[SoundTouchPlayer] Aborted: context disposed during buffer read');
        return 0;
      }

      this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      // Check again after decode
      if (!this.audioContext) {
        console.log('[SoundTouchPlayer] Aborted: context disposed during decode');
        return 0;
      }

      this._duration = this.audioBuffer.duration;

      // Create the PitchShifter
      this.createShifter();

      this.options.onLoad?.();

      return this._duration;
    } catch (error) {
      // Ignore errors if we've been disposed (component unmounted)
      if (!this.audioContext) {
        console.log('[SoundTouchPlayer] Load cancelled: player was disposed');
        return 0;
      }
      console.error('[SoundTouchPlayer] Failed to load audio:', error);
      throw error;
    }
  }

  private createShifter(): void {
    if (!this.audioContext || !this.audioBuffer || !this.gainNode) return;

    // Clean up existing shifter
    if (this.shifter) {
      try {
        this.shifter.disconnect();
        this.shifter.off();
      } catch (e) {
        // Ignore disconnect errors
      }
    }

    this.shifter = new PitchShifter(
      this.audioContext,
      this.audioBuffer,
      1024, // Buffer size
      () => this.handleEnd()
    );

    // Keep pitch at 1.0, only change tempo
    this.shifter.pitch = 1.0;
    this.shifter.tempo = this._tempo;

    // Listen for playback updates
    // Note: detail.percentagePlayed is 0-100, but due to the setter bug,
    // we need to convert it back to time ourselves
    this.shifter.on('play', (detail: { timePlayed: number; percentagePlayed: number }) => {
      // Convert percentage (0-100) back to time
      const time = (detail.percentagePlayed / 100) * this._duration;
      this._currentTime = time;
      this.options.onTimeUpdate?.(time);
    });
  }

  private handleEnd(): void {
    this._isPlaying = false;
    this.stopUpdateLoop();
    this.options.onEnd?.();
  }

  /**
   * Start or resume playback
   */
  play(): void {
    if (!this.shifter || !this.gainNode || this._isPlaying) return;

    // Resume audio context if suspended (browser policy)
    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume();
    }

    this.shifter.connect(this.gainNode);
    this._isPlaying = true;
    this.startUpdateLoop();
    this.options.onPlay?.();
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (!this.shifter || !this._isPlaying) return;

    this.shifter.disconnect();
    this._isPlaying = false;
    this.stopUpdateLoop();
    this.options.onPause?.();
  }

  /**
   * Stop playback and reset to beginning
   */
  stop(): void {
    this.pause();
    this.seek(0);
    this._currentTime = 0;
  }

  /**
   * Seek to a specific time in seconds
   */
  seek(time: number): void {
    if (!this.shifter || this._duration === 0) return;

    const clampedTime = Math.max(0, Math.min(time, this._duration));

    // IMPORTANT: soundtouchjs has a bug - the getter returns 0-100 (percentage)
    // but the setter expects 0.0-1.0 (decimal fraction).
    // We must pass a decimal, not a percentage!
    const fraction = clampedTime / this._duration;

    console.log('[SoundTouchPlayer] seek:', time, 's -> fraction:', fraction.toFixed(4));

    // If currently playing, we need to disconnect, seek, then reconnect
    const wasPlaying = this._isPlaying;

    if (wasPlaying) {
      this.shifter.disconnect();
    }

    // The PitchShifter requires recreating after seeking for reliable results
    this.createShifter();
    if (this.shifter) {
      // Pass decimal (0.0-1.0), not percentage (0-100)
      this.shifter.percentagePlayed = fraction;
      this._currentTime = clampedTime;

      if (wasPlaying) {
        this.shifter.connect(this.gainNode!);
      }
    }
  }

  /**
   * Set playback tempo (speed) without changing pitch
   * @param tempo - Playback rate (0.5 to 3.0 typical)
   */
  setTempo(tempo: number): void {
    this._tempo = Math.max(0.25, Math.min(4.0, tempo));

    if (this.shifter) {
      this.shifter.tempo = this._tempo;
    }
  }

  /**
   * Get current playback time in seconds
   */
  getCurrentTime(): number {
    // Use our tracked time, not shifter.timePlayed which has precision issues
    return this._currentTime;
  }

  /**
   * Get total duration in seconds
   */
  getDuration(): number {
    return this._duration;
  }

  /**
   * Check if currently playing
   */
  get isPlaying(): boolean {
    return this._isPlaying;
  }

  /**
   * Get current tempo
   */
  get tempo(): number {
    return this._tempo;
  }

  private startUpdateLoop(): void {
    this.stopUpdateLoop();

    // Update time every 50ms for smooth UI updates
    this.updateInterval = setInterval(() => {
      if (this.shifter && this._isPlaying) {
        this._currentTime = this.shifter.timePlayed;
        this.options.onTimeUpdate?.(this._currentTime);
      }
    }, 50);
  }

  private stopUpdateLoop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Clean up all resources
   */
  dispose(): void {
    this.stopUpdateLoop();

    if (this.shifter) {
      try {
        this.shifter.disconnect();
        this.shifter.off();
      } catch (e) {
        // Ignore errors during cleanup
      }
      this.shifter = null;
    }

    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    this.audioBuffer = null;
    this._isPlaying = false;
    this._duration = 0;
    this._currentTime = 0;
  }
}
