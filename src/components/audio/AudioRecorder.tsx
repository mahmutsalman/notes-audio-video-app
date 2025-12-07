import { useEffect } from 'react';
import type { UseVoiceRecorderReturn } from '../../hooks/useVoiceRecorder';
import { formatDuration } from '../../utils/formatters';
import WaveformVisualizer from './WaveformVisualizer';

interface AudioRecorderProps {
  recorder: UseVoiceRecorderReturn;
  onStopRecording: () => void;
}

export default function AudioRecorder({ recorder, onStopRecording }: AudioRecorderProps) {
  const {
    isRecording,
    isPaused,
    duration,
    error,
    analyserNode,
    startRecording,
    pauseRecording,
    resumeRecording,
  } = recorder;

  // Space bar keyboard shortcut for pause/resume
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle space bar when recording is active
      if (e.code === 'Space' && isRecording) {
        e.preventDefault(); // Prevent page scroll
        if (isPaused) {
          resumeRecording();
        } else {
          pauseRecording();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRecording, isPaused, pauseRecording, resumeRecording]);

  return (
    <div className="flex flex-col items-center py-8">
      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Recording indicator */}
      {isRecording && !isPaused && (
        <div className="text-red-500 text-lg font-medium mb-2 flex items-center gap-2">
          <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
          RECORDING...
        </div>
      )}

      {isPaused && (
        <div className="text-yellow-500 text-lg font-medium mb-2 flex items-center gap-2">
          <span className="w-3 h-3 bg-yellow-500 rounded-full" />
          PAUSED
        </div>
      )}

      {!isRecording && (
        <div className="text-gray-500 dark:text-gray-400 text-lg font-medium mb-2">
          Ready to record
        </div>
      )}

      {/* Waveform */}
      <div className="w-full h-24 mb-4">
        <WaveformVisualizer analyser={analyserNode} isRecording={isRecording && !isPaused} />
      </div>

      {/* Duration */}
      <div className="text-4xl font-mono text-gray-900 dark:text-gray-100 mb-8">
        {formatDuration(duration)}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        {!isRecording ? (
          <button
            onClick={startRecording}
            className="w-20 h-20 bg-red-500 hover:bg-red-600 text-white rounded-full
                       flex items-center justify-center text-3xl shadow-lg
                       focus:outline-none focus:ring-4 focus:ring-red-500/50
                       transition-all recording-pulse"
            title="Start recording"
          >
            🎙️
          </button>
        ) : (
          <>
            {/* Pause/Resume button */}
            <button
              onClick={isPaused ? resumeRecording : pauseRecording}
              className="w-14 h-14 bg-yellow-500 hover:bg-yellow-600 text-white rounded-full
                         flex items-center justify-center text-xl shadow-lg
                         focus:outline-none focus:ring-4 focus:ring-yellow-500/50
                         transition-all"
              title={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? '▶️' : '⏸️'}
            </button>

            {/* Stop button */}
            <button
              onClick={onStopRecording}
              className="w-20 h-20 bg-gray-700 hover:bg-gray-800 text-white rounded-full
                         flex items-center justify-center text-3xl shadow-lg
                         focus:outline-none focus:ring-4 focus:ring-gray-500/50
                         transition-all"
              title="Stop and save"
            >
              ⏹️
            </button>
          </>
        )}
      </div>

      {/* Instructions */}
      <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
        {isRecording
          ? 'Press Space to pause/resume • Click stop when finished'
          : 'Click the microphone to start recording'}
      </p>
    </div>
  );
}
