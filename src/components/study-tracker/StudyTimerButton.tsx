import { useStudyTracker } from '../../context/StudyTrackerContext';

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function StudyTimerButton() {
  const { isTracking, elapsedSeconds, startSession, stopSession } = useStudyTracker();

  return (
    <button
      onClick={isTracking ? stopSession : startSession}
      className={[
        'titlebar-no-drag flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors text-sm font-mono font-medium',
        isTracking
          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50'
          : 'hover:bg-gray-100 dark:hover:bg-dark-hover text-gray-500 dark:text-gray-400',
      ].join(' ')}
      title={isTracking ? 'Stop study session' : 'Start study session'}
    >
      {/* Stopwatch icon */}
      <svg
        className={`w-4 h-4 flex-shrink-0 ${isTracking ? 'text-emerald-600 dark:text-emerald-400' : ''}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth={1.8}
      >
        <circle cx="12" cy="13" r="8" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4l2.5 2.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 3h5M12 3v2" />
      </svg>

      {isTracking && (
        <span className="tabular-nums">{formatElapsed(elapsedSeconds)}</span>
      )}
    </button>
  );
}
