import { useState, useEffect, useRef } from 'react';
import { useAudioRecording } from '../../context/AudioRecordingContext';
import { formatDuration } from '../../utils/formatters';
import WaveformVisualizer from './WaveformVisualizer';
import type { AudioMarkerType } from '../../types';

const TOGGLE_BUTTONS: { type: AudioMarkerType; icon: string; label: string; activeClass: string; inactiveClass: string }[] = [
  {
    type: 'important',
    icon: '❗',
    label: 'Important',
    activeClass: 'bg-red-600 border-red-400 text-white ring-2 ring-red-400',
    inactiveClass: 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600',
  },
  {
    type: 'question',
    icon: '❓',
    label: 'Question',
    activeClass: 'bg-blue-600 border-blue-400 text-white ring-2 ring-blue-400',
    inactiveClass: 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600',
  },
  {
    type: 'similar_question',
    icon: '↔',
    label: 'Sim Q',
    activeClass: 'bg-purple-600 border-purple-400 text-white ring-2 ring-purple-400',
    inactiveClass: 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600',
  },
];

const VOICE_FLASH_COLORS: Record<AudioMarkerType, string> = {
  important: 'text-red-400 border-red-600 bg-red-900/40',
  question: 'text-blue-400 border-blue-600 bg-blue-900/40',
  similar_question: 'text-purple-400 border-purple-600 bg-purple-900/40',
};

const MARKER_LABELS: Record<AudioMarkerType, string> = {
  important: 'important',
  question: 'question',
  similar_question: 'similar',
};

export default function AudioRecordingBar() {
  const {
    isRecording,
    isPaused,
    duration,
    analyserNode,
    target,
    isSaving,
    activeToggles,
    voiceCommandsEnabled,
    lastVoiceCommand,
    pauseRecording,
    resumeRecording,
    stopAndSave,
    cancelRecording,
    addMarkerToggle,
    toggleVoiceCommands,
  } = useAudioRecording();

  const [modelStatus, setModelStatus] = useState<'unknown' | 'missing' | 'ready'>('unknown');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [flashCmd, setFlashCmd] = useState<{ type: AudioMarkerType; on: boolean } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastVoiceCmdTs = useRef<number>(0);

  useEffect(() => {
    window.electronAPI.voiceModel.status().then(s => {
      setModelStatus(s.downloaded ? 'ready' : 'missing');
    });
  }, []);

  // Show flash indicator when a voice command fires
  useEffect(() => {
    if (!lastVoiceCommand) return;
    if (lastVoiceCommand.ts === lastVoiceCmdTs.current) return;
    lastVoiceCmdTs.current = lastVoiceCommand.ts;
    setFlashCmd({ type: lastVoiceCommand.type, on: lastVoiceCommand.on });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashCmd(null), 1800);
  }, [lastVoiceCommand]);

  const handleDownloadModel = async () => {
    setIsDownloading(true);
    setDownloadProgress(0);
    const unsub = window.electronAPI.voiceModel.onProgress(({ progress }) => {
      setDownloadProgress(progress);
    });
    const result = await window.electronAPI.voiceModel.download();
    unsub();
    setIsDownloading(false);
    if (result.success) {
      setModelStatus('ready');
    }
  };

  if (!isRecording && !isSaving) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 dark:bg-gray-950 border-t border-gray-700 dark:border-gray-800 shadow-2xl">
      {/* Voice command flash indicator */}
      {flashCmd && (
        <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 rounded border text-xs font-medium whitespace-nowrap pointer-events-none ${VOICE_FLASH_COLORS[flashCmd.type]}`}>
          🎙 {MARKER_LABELS[flashCmd.type]} → {flashCmd.on ? 'ON' : 'OFF'}
        </div>
      )}

      {/* Model download progress */}
      {isDownloading && (
        <div className="absolute bottom-full left-0 right-0 bg-gray-800 border-t border-gray-700 px-4 py-2 flex items-center gap-3">
          <span className="text-xs text-gray-300">Downloading speech model…</span>
          <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all"
              style={{ width: `${downloadProgress}%` }}
            />
          </div>
          <span className="text-xs text-gray-400 tabular-nums">{downloadProgress}%</span>
        </div>
      )}

      <div className="flex items-center gap-3 px-4 h-14 max-w-screen-2xl mx-auto">
        {/* Status indicator */}
        <div className="flex items-center gap-2 min-w-[120px]">
          {isSaving ? (
            <>
              <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium text-blue-400">SAVING...</span>
            </>
          ) : isPaused ? (
            <>
              <span className="w-2.5 h-2.5 bg-yellow-500 rounded-full" />
              <span className="text-sm font-medium text-yellow-400">PAUSED</span>
            </>
          ) : (
            <>
              <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium text-red-400">REC</span>
            </>
          )}
        </div>

        {/* Target label */}
        {target && (
          <div className="text-sm text-gray-300 truncate max-w-[200px]" title={target.label}>
            {target.label}
          </div>
        )}

        {/* Timer */}
        <div className="text-sm font-mono text-gray-100 tabular-nums min-w-[48px]">
          {formatDuration(duration)}
        </div>

        {/* Waveform */}
        <div className="flex-1 h-8 min-w-[80px]">
          <WaveformVisualizer
            analyser={analyserNode}
            isRecording={isRecording && !isPaused}
          />
        </div>

        {/* Toggle marker buttons */}
        {isRecording && !isSaving && (
          <div className="flex items-center gap-1">
            {TOGGLE_BUTTONS.map(({ type, icon, label, activeClass, inactiveClass }) => {
              const isActive = activeToggles.has(type);
              return (
                <button
                  key={type}
                  onClick={() => addMarkerToggle(type)}
                  className={`flex items-center gap-0.5 px-1.5 py-1 rounded border text-xs font-medium transition-all ${isActive ? activeClass : inactiveClass}`}
                  title={`${isActive ? 'Stop' : 'Start'} ${label} marker`}
                >
                  <span>{icon}</span>
                  <span className="hidden sm:inline">{label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Voice command toggle */}
        {isRecording && !isSaving && (
          <div className="flex items-center">
            {modelStatus === 'missing' ? (
              <button
                onClick={handleDownloadModel}
                disabled={isDownloading}
                className="flex items-center gap-1 px-2 py-1 rounded border border-dashed border-gray-600 text-gray-500 hover:border-green-600 hover:text-green-400 text-xs transition-colors disabled:opacity-50"
                title="Download offline speech model (~40MB) to enable voice commands"
              >
                <span>🎙</span>
                <span className="hidden sm:inline">{isDownloading ? `${downloadProgress}%` : 'Get voice'}</span>
              </button>
            ) : (
              <button
                onClick={toggleVoiceCommands}
                className={`flex items-center gap-1 px-2 py-1 rounded border text-xs font-medium transition-all ${
                  voiceCommandsEnabled && isRecording
                    ? 'bg-green-700/40 border-green-500 text-green-300'
                    : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600'
                }`}
                title={voiceCommandsEnabled ? 'Voice commands ON — "mark important on/off", "mark question on/off", "mark similar on/off", "pause recording", "resume recording", "stop recording"' : 'Enable voice commands'}
              >
                <span className={voiceCommandsEnabled && isRecording ? 'animate-pulse' : ''}>🎙</span>
                <span className="hidden sm:inline">{voiceCommandsEnabled ? 'Voice' : 'Voice'}</span>
              </button>
            )}
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-2">
          {!isSaving && (
            <>
              <button
                onClick={isPaused ? resumeRecording : pauseRecording}
                className="w-8 h-8 flex items-center justify-center rounded-full
                           bg-gray-700 hover:bg-gray-600 text-white transition-colors
                           text-sm"
                title={isPaused ? 'Resume' : 'Pause'}
              >
                {isPaused ? '▶' : '⏸'}
              </button>
              <button
                onClick={stopAndSave}
                className="w-8 h-8 flex items-center justify-center rounded-full
                           bg-red-600 hover:bg-red-500 text-white transition-colors
                           text-sm"
                title="Stop & Save"
              >
                ⏹
              </button>
              <button
                onClick={cancelRecording}
                className="w-8 h-8 flex items-center justify-center rounded-full
                           bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white
                           transition-colors text-xs"
                title="Cancel"
              >
                ✕
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
