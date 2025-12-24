import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';

const LOG_PATH = path.join(app.getAppPath(), 'localResources', 'extendLog.txt');

export async function appendExtendLog(message: string, data?: Record<string, unknown>) {
  const payload = data ? ` ${JSON.stringify(data)}` : '';
  const line = `[${new Date().toISOString()}] ${message}${payload}\n`;

  try {
    await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
    await fs.appendFile(LOG_PATH, line, 'utf8');
  } catch (error) {
    console.warn('[ExtendLog] Failed to write log:', error);
  }
}

export async function clearExtendLog() {
  try {
    await fs.unlink(LOG_PATH);
    console.log('[ExtendLog] Log file cleared on app start');
  } catch (error: any) {
    // File doesn't exist or couldn't be deleted - that's fine
    if (error.code !== 'ENOENT') {
      console.warn('[ExtendLog] Failed to clear log:', error);
    }
  }
}
