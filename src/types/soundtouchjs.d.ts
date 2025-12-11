declare module 'soundtouchjs' {
  export class PitchShifter {
    constructor(
      context: AudioContext,
      buffer: AudioBuffer,
      bufferSize: number,
      onEnd?: () => void
    );

    /** Duration in seconds */
    duration: number;

    /** Sample rate */
    sampleRate: number;

    /** Formatted duration as mm:ss */
    formattedDuration: string;

    /** Formatted time played as mm:ss */
    formattedTimePlayed: string;

    /** Current playback time in seconds */
    timePlayed: number;

    /** Source position in samples */
    sourcePosition: number;

    /** Current playback percentage (0-100), can be set for seeking */
    percentagePlayed: number;

    /** The internal audio node */
    node: ScriptProcessorNode;

    /** Pitch multiplier (1.0 = normal) */
    pitch: number;

    /** Pitch shift in semitones */
    pitchSemitones: number;

    /** Rate (changes both speed and pitch together) */
    rate: number;

    /** Tempo (changes speed without changing pitch) */
    tempo: number;

    /** Connect to an audio node to start playback */
    connect(toNode: AudioNode): void;

    /** Disconnect from audio graph (pauses playback) */
    disconnect(): void;

    /** Listen to events */
    on(
      eventName: 'play',
      callback: (detail: {
        timePlayed: number;
        formattedTimePlayed: string;
        percentagePlayed: number;
      }) => void
    ): void;

    /** Remove event listeners */
    off(eventName?: string): void;
  }

  export class SoundTouch {
    tempo: number;
    pitch: number;
    pitchSemitones: number;
    rate: number;
  }

  export class WebAudioBufferSource {
    constructor(buffer: AudioBuffer);
    extract(target: Float32Array, numFrames: number, position: number): number;
  }

  export class SimpleFilter {
    constructor(
      source: WebAudioBufferSource,
      soundTouch: SoundTouch,
      callback?: () => void
    );
    sourcePosition: number;
  }

  export function getWebAudioNode(
    context: AudioContext,
    filter: SimpleFilter,
    onUpdate: (position: number) => void,
    bufferSize?: number
  ): ScriptProcessorNode;
}
