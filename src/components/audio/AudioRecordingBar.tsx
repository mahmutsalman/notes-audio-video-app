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

export default function AudioRecordingBar() {
  const {
    isRecording,
    isPaused,
    duration,
    analyserNode,
    target,
    isSaving,
    activeToggles,
    pauseRecording,
    resumeRecording,
    stopAndSave,
    cancelRecording,
    addMarkerToggle,
  } = useAudioRecording();

  if (!isRecording && !isSaving) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 dark:bg-gray-950 border-t border-gray-700 dark:border-gray-800 shadow-2xl">
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
