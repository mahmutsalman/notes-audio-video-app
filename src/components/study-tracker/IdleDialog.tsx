import { useState, useEffect } from 'react';
import { useStudyTrackerFull } from '../../context/StudyTrackerContext';

function formatMinSec(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

export default function IdleDialog() {
  const { idleState, resolveIdle } = useStudyTrackerFull();
  const [credited, setCredited] = useState(0);

  // Reset slider when dialog opens
  useEffect(() => {
    if (idleState.show) {
      setCredited(0);
    }
  }, [idleState.show]);

  if (!idleState.show) return null;

  const idleSecs = idleState.idleSeconds;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) resolveIdle(0); }}
    >
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-2xl border border-gray-200 dark:border-dark-border w-[380px] p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <circle cx="12" cy="13" r="8" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4l2.5 2.5" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 3h5M12 3v2" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
              You were away for {formatMinSec(idleSecs)}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              How much of that time was study?
            </p>
          </div>
        </div>

        {/* Slider */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mb-2">
            <span>0</span>
            <span className="font-medium text-gray-700 dark:text-gray-200">
              {formatMinSec(credited)} credited
            </span>
            <span>{formatMinSec(idleSecs)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={idleSecs}
            step={30}
            value={credited}
            onChange={e => setCredited(Number(e.target.value))}
            className="w-full accent-emerald-500"
          />
        </div>

        {/* Quick presets */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {[0, Math.round(idleSecs * 0.25), Math.round(idleSecs * 0.5), Math.round(idleSecs * 0.75), idleSecs]
            .filter((v, i, arr) => arr.indexOf(v) === i)
            .map(v => (
              <button
                key={v}
                onClick={() => setCredited(v)}
                className={[
                  'text-xs px-2 py-0.5 rounded-full border transition-colors',
                  v === credited
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : 'border-gray-200 dark:border-dark-border text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-hover',
                ].join(' ')}
              >
                {v === 0 ? 'None' : v === idleSecs ? 'All' : formatMinSec(v)}
              </button>
            ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => resolveIdle(0)}
            className="text-sm px-3 py-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
          >
            Discard all
          </button>
          <button
            onClick={() => resolveIdle(credited)}
            className="text-sm px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium transition-colors"
          >
            Credit {credited > 0 ? formatMinSec(credited) : 'nothing'}
          </button>
        </div>
      </div>
    </div>
  );
}
