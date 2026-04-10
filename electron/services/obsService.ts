import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import OBSWebSocket from 'obs-websocket-js';

export interface OBSStatus {
  isConnected: boolean;
  isConnecting: boolean;
  isRecording: boolean;
  isPaused: boolean;
  recordTimecode: string;
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error';
}

class OBSService extends EventEmitter {
  private obs: OBSWebSocket;
  isConnected: boolean;
  isConnecting: boolean;
  private _toggleInFlight: boolean;

  // Recording state
  private recordingState: { isRecording: boolean; isPaused: boolean; recordTimecode: string };

  // Mark tracking
  currentSessionId: string | null;
  lastResumeTimecode: number;  // seconds — start_time for next explicit mark
  pauseTimecode: number;       // seconds — end_time for current span
  currentMarkCaption: string;  // updated by overlay IPC as user types
  private stoppingTimecode: number; // timecode captured on STOPPING (used for final mark when stopped while recording)
  lastVideoPath: string | null;     // output path of the most recently completed OBS recording
  lastRecordDirectory: string | null; // OBS output directory (fetched on recording start)

  constructor() {
    super();
    this.obs = new OBSWebSocket();
    this.isConnected = false;
    this.isConnecting = false;
    this._toggleInFlight = false;
    this.recordingState = { isRecording: false, isPaused: false, recordTimecode: '00:00:00' };
    this.currentSessionId = null;
    this.lastResumeTimecode = 0;
    this.pauseTimecode = 0;
    this.currentMarkCaption = '';
    this.stoppingTimecode = 0;
    this.lastVideoPath = null;
    this.lastRecordDirectory = null;
  }

  // Parse "HH:MM:SS.mmm" → seconds
  parseTimecode(tc: string): number {
    if (!tc || tc === '00:00:00') return 0;
    const parts = tc.split(':');
    if (parts.length !== 3) return 0;
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const secs = parseFloat(parts[2]);
    return hours * 3600 + minutes * 60 + secs;
  }

  async connect(address = 'ws://127.0.0.1:4455', password = '') {
    if (this.isConnecting || this.isConnected) return;
    this.isConnecting = true;
    console.log('[OBS] Connecting to', address);
    this.emit('statusChange', this.getStatus());

    try {
      await this.obs.connect(address, password || undefined);
      this.isConnected = true;
      this.isConnecting = false;
      this.setupEventListeners();
      await this.getInitialStatus();
      console.log('[OBS] Connected to OBS WebSocket');
      this.emit('statusChange', this.getStatus());
    } catch (error) {
      this.isConnecting = false;
      this.isConnected = false;
      console.error('[OBS] Failed to connect:', error);
      this.emit('statusChange', this.getStatus());
      throw error;
    }
  }

  async disconnect() {
    if (this.isConnected) {
      await this.obs.disconnect();
      this.isConnected = false;
      console.log('[OBS] Disconnected');
      this.emit('statusChange', this.getStatus());
    }
  }

  getStatus(): OBSStatus {
    return {
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      isRecording: this.recordingState.isRecording,
      isPaused: this.recordingState.isPaused,
      recordTimecode: this.recordingState.recordTimecode,
      connectionStatus: this.isConnecting ? 'connecting' : this.isConnected ? 'connected' : 'disconnected',
    };
  }

  private setupEventListeners() {
    this.obs.on('RecordStateChanged', async (data: any) => {
      const state = data.outputState as string;
      console.log('[OBS] RecordStateChanged:', state);

      if (state === 'OBS_WEBSOCKET_OUTPUT_STARTED') {
        this.recordingState.isRecording = true;
        this.recordingState.isPaused = false;
        this.currentSessionId = randomUUID();
        this.lastResumeTimecode = 0;
        this.pauseTimecode = 0;
        this.currentMarkCaption = '';
        this.stoppingTimecode = 0;
        this.lastVideoPath = null; // reset so a stale path from a previous session is never reused
        // Fetch the OBS recording directory so we can find the newest file even if outputPath is null
        this.obs.call('GetRecordDirectory' as any).then((res: any) => {
          this.lastRecordDirectory = res?.recordDirectory ?? null;
          console.log('[OBS] Recording directory:', this.lastRecordDirectory);
        }).catch(() => {});
        console.log('[OBS] Recording started, session:', this.currentSessionId);
        this.emit('started', { sessionId: this.currentSessionId });

      } else if (state === 'OBS_WEBSOCKET_OUTPUT_RESUMED') {
        this.recordingState.isRecording = true;
        this.recordingState.isPaused = false;
        // lastResumeTimecode already set when mark was saved
        this.emit('resumed');

      } else if (state === 'OBS_WEBSOCKET_OUTPUT_PAUSED') {
        this.recordingState.isRecording = true;
        this.recordingState.isPaused = true;
        try {
          const recordStatus = await this.obs.call('GetRecordStatus');
          const tc = (recordStatus as any).outputTimecode || '00:00:00';
          this.recordingState.recordTimecode = tc;
          this.pauseTimecode = this.parseTimecode(tc);
          console.log('[OBS] Paused at timecode:', tc, '=', this.pauseTimecode, 's');
          this.emit('paused', { timecode: this.pauseTimecode, timecodeStr: tc });
        } catch (err) {
          console.error('[OBS] Failed to fetch timecode on pause:', err);
          this.emit('paused', { timecode: this.pauseTimecode, timecodeStr: '00:00:00' });
        }

      } else if (state === 'OBS_WEBSOCKET_OUTPUT_PAUSING' || state === 'OBS_WEBSOCKET_OUTPUT_STARTING') {
        // Transitional — ignore
        return;

      } else if (state === 'OBS_WEBSOCKET_OUTPUT_STOPPING') {
        // Capture final timecode before OBS resets it — only matters when actively recording
        if (this.recordingState.isRecording && !this.recordingState.isPaused) {
          try {
            const recordStatus = await this.obs.call('GetRecordStatus');
            this.stoppingTimecode = this.parseTimecode((recordStatus as any).outputTimecode || '00:00:00');
            console.log('[OBS] Stopping — captured final timecode:', this.stoppingTimecode, 's');
          } catch (err) {
            console.error('[OBS] Failed to capture timecode on STOPPING:', err);
            this.stoppingTimecode = 0;
          }
        }
        return;

      } else {
        // STOPPED or unknown state
        let pendingMark: any = null;

        if (this.currentSessionId) {
          if (this.recordingState.isPaused) {
            // Stopped while paused — save the mark for the paused interval
            const hasDuration = this.pauseTimecode > this.lastResumeTimecode;
            const hasCaption  = this.currentMarkCaption.trim().length > 0;
            if (hasDuration || hasCaption) {
              pendingMark = {
                session_id: this.currentSessionId,
                start_time: this.lastResumeTimecode,
                end_time:   this.pauseTimecode,
                caption:    this.currentMarkCaption.trim() || null,
              };
            }
          } else if (this.recordingState.isRecording && this.stoppingTimecode > this.lastResumeTimecode) {
            // Stopped while actively recording (e.g. via OBS UI) — save the final interval
            pendingMark = {
              session_id: this.currentSessionId,
              start_time: this.lastResumeTimecode,
              end_time:   this.stoppingTimecode,
              caption:    this.currentMarkCaption.trim() || null,
            };
            console.log('[OBS] Stopped while recording — saving final mark:', pendingMark);
          }
        }

        const filePath = (data as any).outputPath as string | undefined || null;
        if (filePath) this.lastVideoPath = filePath;
        const recordDirectory = this.lastRecordDirectory;

        this.recordingState.isRecording = false;
        this.recordingState.isPaused = false;
        this.recordingState.recordTimecode = '00:00:00';
        this.stoppingTimecode = 0;
        const sessionId = this.currentSessionId;
        this.currentSessionId = null;
        this.currentMarkCaption = '';
        this.emit('stopped', { sessionId, pendingMark, filePath, recordDirectory });
      }

      this.emit('statusChange', this.getStatus());
    });

    this.obs.on('ConnectionClosed' as any, () => {
      console.log('[OBS] Connection closed');
      this.isConnected = false;
      this.emit('statusChange', this.getStatus());
    });

    this.obs.on('ConnectionError' as any, (error: any) => {
      console.error('[OBS] Connection error:', error);
      this.isConnected = false;
      this.emit('statusChange', this.getStatus());
    });
  }

  private async getInitialStatus() {
    try {
      const recordStatus = await this.obs.call('GetRecordStatus');
      this.recordingState.isRecording = (recordStatus as any).outputActive;
      this.recordingState.isPaused = (recordStatus as any).outputPaused || false;
      this.recordingState.recordTimecode = (recordStatus as any).outputTimecode || '00:00:00';
    } catch (err) {
      console.error('[OBS] Failed to get initial status:', err);
    }
  }

  async startRecording() {
    if (this._toggleInFlight) return;
    this._toggleInFlight = true;
    try {
      await this.obs.call('StartRecord');
    } catch (err) {
      console.error('[OBS] Failed to start recording:', err);
    } finally {
      this._toggleInFlight = false;
    }
  }

  async stopRecording() {
    if (this._toggleInFlight) return;
    this._toggleInFlight = true;
    try {
      await this.obs.call('StopRecord');
    } catch (err) {
      console.error('[OBS] Failed to stop recording:', err);
    } finally {
      this._toggleInFlight = false;
    }
  }

  async pauseRecording() {
    if (this._toggleInFlight) return;
    this._toggleInFlight = true;
    try {
      await this.obs.call('PauseRecord');
    } catch (err) {
      console.error('[OBS] Failed to pause recording:', err);
    } finally {
      this._toggleInFlight = false;
    }
  }

  async resumeRecording() {
    if (this._toggleInFlight) return;
    this._toggleInFlight = true;
    try {
      await this.obs.call('ResumeRecord');
    } catch (err) {
      console.error('[OBS] Failed to resume recording:', err);
    } finally {
      this._toggleInFlight = false;
    }
  }

}

export const obsService = new OBSService();
