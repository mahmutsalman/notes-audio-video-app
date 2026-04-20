import { createModel } from 'vosk-browser';
import type { AudioMarkerType } from '../types';

const VOICE_MODEL_FILENAME = 'vosk-model-small-en-us-0.15.zip';
const MODEL_URL = `vosk://${VOICE_MODEL_FILENAME}`;
const GRAMMAR = [
  'important on', 'important off',
  'questions on', 'questions off',
  'similar on', 'similar off',
  '[unk]',
];
const COMMAND_COOLDOWN_MS = 2000;

type CommandCallback = (type: AudioMarkerType, on: boolean) => void;

const COMMANDS: Array<{ pattern: string; type: AudioMarkerType; on: boolean }> = [
  { pattern: 'important on',  type: 'important',        on: true  },
  { pattern: 'important off', type: 'important',        on: false },
  { pattern: 'questions on',  type: 'question',         on: true  },
  { pattern: 'questions off', type: 'question',         on: false },
  { pattern: 'similar on',    type: 'similar_question', on: true  },
  { pattern: 'similar off',   type: 'similar_question', on: false },
];

class VoiceCommandService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private model: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private recognizer: any = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private silentGain: GainNode | null = null;
  private lastCommandTime = new Map<AudioMarkerType, number>();
  private commandCallback: CommandCallback | null = null;
  private initPromise: Promise<void> | null = null;

  onCommand(cb: CommandCallback) {
    this.commandCallback = cb;
  }

  async ensureModelLoaded(): Promise<boolean> {
    if (this.model) return true;
    if (this.initPromise) {
      await this.initPromise;
      return !!this.model;
    }
    this.initPromise = (async () => {
      try {
        this.model = await createModel(MODEL_URL);
      } catch (err) {
        console.error('[VoiceCommand] Failed to load Vosk model:', err);
        this.model = null;
      }
    })();
    await this.initPromise;
    return !!this.model;
  }

  async start(audioContext: AudioContext, sourceNode: MediaStreamAudioSourceNode): Promise<void> {
    if (!(await this.ensureModelLoaded())) return;

    // Grammar as a flat JSON array (vosk-browser format)
    this.recognizer = new this.model.KaldiRecognizer(16000, JSON.stringify(GRAMMAR));

    this.recognizer.on('result', (msg: { result: { text: string } }) => {
      const text = msg?.result?.text?.trim().toLowerCase();
      if (text) this.processCommand(text);
    });

    // Tap the audio graph: source → scriptProcessor → silent gain → destination
    // acceptWaveformFloat handles resampling internally when given the source sample rate
    const bufferSize = 4096;
    this.scriptProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);
    this.silentGain = audioContext.createGain();
    this.silentGain.gain.value = 0;

    const inputRate = audioContext.sampleRate;
    this.scriptProcessor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      this.recognizer?.acceptWaveformFloat(input, inputRate);
    };

    sourceNode.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.silentGain);
    this.silentGain.connect(audioContext.destination);
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
    if (this.recognizer) {
      try { this.recognizer.remove?.(); } catch { /* ignore */ }
      this.recognizer = null;
    }
    this.lastCommandTime.clear();
  }

  private processCommand(text: string) {
    for (const cmd of COMMANDS) {
      if (text.includes(cmd.pattern)) {
        const now = Date.now();
        const last = this.lastCommandTime.get(cmd.type) ?? 0;
        if (now - last < COMMAND_COOLDOWN_MS) return;
        this.lastCommandTime.set(cmd.type, now);
        this.commandCallback?.(cmd.type, cmd.on);
        return;
      }
    }
  }

}

export const voiceCommandService = new VoiceCommandService();
