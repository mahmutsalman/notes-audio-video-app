import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface RecordingDebugEvent {
  type: string;
  atMs: number;
  origin?: string;
  payload?: JsonValue;
  pid?: number;
  processType?: 'main' | 'renderer' | 'unknown';
}

function getMediaDir(): string {
  return path.join(app.getPath('userData'), 'media');
}

export function getRecordingDebugDir(recordingId: number): string {
  return path.join(getMediaDir(), 'screen_recordings', String(recordingId), 'debug');
}

export function getRecordingDebugLogPath(recordingId: number): string {
  return path.join(getRecordingDebugDir(recordingId), 'timeline.jsonl');
}

export async function clearAllRecordingDebugLogs(): Promise<void> {
  try {
    const screenRecordingsDir = path.join(getMediaDir(), 'screen_recordings');
    const entries = await fs.readdir(screenRecordingsDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);

    // Only clear numeric recording folders (leave any legacy/non-recording folders alone).
    const recordingDirs = dirs.filter(name => /^\d+$/.test(name));
    await Promise.all(
      recordingDirs.map(async (recordingIdStr) => {
        const debugDir = path.join(screenRecordingsDir, recordingIdStr, 'debug');
        await fs.rm(debugDir, { recursive: true, force: true });
      })
    );
  } catch (error) {
    console.warn('[recordingDebugLogger] Failed to clear debug logs:', error);
  }
}

function safeJsonStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? String(v) : v));
}

export async function appendRecordingDebugEvent(recordingId: number, event: RecordingDebugEvent): Promise<void> {
  try {
    const debugDir = getRecordingDebugDir(recordingId);
    await fs.mkdir(debugDir, { recursive: true });

    const line = safeJsonStringify({
      ...event,
      pid: event.pid ?? process.pid,
      processType: event.processType ?? 'main'
    }) + '\n';

    await fs.appendFile(getRecordingDebugLogPath(recordingId), line, 'utf8');
  } catch (error) {
    console.warn('[recordingDebugLogger] Failed to write debug event:', error);
  }
}
