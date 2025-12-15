import { useEffect, useRef } from 'react';
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
    handleMarkToggle,
    setMarkNote,
    isMarking,
    pendingMarkStart,
    pendingMarkNote,
    pendingMarkImages,
    pendingMarkVideos,
    completedMarks,
  } = recorder;

  const noteInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus note input when marking starts
  useEffect(() => {
    if (isMarking && noteInputRef.current) {
      noteInputRef.current.focus();
    }
  }, [isMarking]);

  // Keyboard shortcuts: Space for pause/resume, Enter for marking durations
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle when recording is active
      if (!isRecording) return;

      // Don't intercept keyboard events when typing in note input (except Enter/Space)
      const target = e.target as HTMLElement;
      const isTypingNote = target === noteInputRef.current;

      if (e.code === 'Space' && !isTypingNote) {
        e.preventDefault(); // Prevent page scroll
        if (isPaused) {
          resumeRecording();
        } else {
          pauseRecording();
        }
      } else if (e.code === 'Enter') {
        e.preventDefault();
        handleMarkToggle();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRecording, isPaused, pauseRecording, resumeRecording, handleMarkToggle]);

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

      {/* Duration marking indicator */}
      {isRecording && (
        <div className="flex flex-col items-center gap-2 mb-2">
          {isMarking ? (
            <>
              <div className="flex items-center gap-2 text-primary-600 dark:text-primary-400 font-medium">
                <span className="w-2 h-2 bg-primary-600 dark:bg-primary-400 rounded-full animate-pulse" />
                Marking from {formatDuration(pendingMarkStart ?? 0)}...
                {pendingMarkImages.length > 0 && (
                  <span className="px-2 py-0.5 bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 rounded text-sm font-medium">
                    📷 {pendingMarkImages.length}
                  </span>
                )}
                {pendingMarkVideos.length > 0 && (
                  <span className="px-2 py-0.5 bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 rounded text-sm font-medium">
                    🎬 {pendingMarkVideos.length}
                  </span>
                )}
              </div>
              <input
                ref={noteInputRef}
                type="text"
                value={pendingMarkNote}
                onChange={(e) => setMarkNote(e.target.value)}
                placeholder="Type a note (optional)..."
                className="w-64 px-3 py-1.5 text-sm rounded-lg border border-primary-300 dark:border-primary-600
                           bg-white dark:bg-dark-bg text-gray-900 dark:text-gray-100
                           focus:outline-none focus:ring-2 focus:ring-primary-500
                           placeholder-gray-400 dark:placeholder-gray-500"
              />
            </>
          ) : completedMarks.length > 0 ? (
            <div className="text-gray-500 dark:text-gray-400 text-sm">
              {completedMarks.length} mark{completedMarks.length !== 1 ? 's' : ''} saved
            </div>
          ) : null}
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
      <p className="mt-4 text-sm text-gray-500 dark:text-gray-400 text-center">
        {isRecording
          ? 'Space: pause/resume • Enter: mark duration • Stop when finished'
          : 'Click the microphone to start recording'}
      </p>
    </div>
  );
}
