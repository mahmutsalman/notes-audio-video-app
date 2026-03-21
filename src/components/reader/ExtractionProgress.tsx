import { ExtractionProgress } from '../../types';

interface ExtractionProgressModalProps {
  progress: ExtractionProgress;
}

export default function ExtractionProgressModal({ progress }: ExtractionProgressModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl p-8 w-80 flex flex-col items-center gap-5">
        <div className="w-12 h-12 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
          <svg className="w-6 h-6 text-violet-600 dark:text-violet-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </div>

        <div className="text-center">
          <p className="font-semibold text-stone-800 dark:text-stone-200 mb-1">Processing PDF</p>
          <p className="text-sm text-stone-500 dark:text-stone-400">{progress.phase}</p>
          {progress.totalPages > 0 && (
            <p className="text-xs text-stone-400 dark:text-stone-500 mt-1">
              Page {progress.page} of {progress.totalPages}
            </p>
          )}
        </div>

        <div className="w-full">
          <div className="flex justify-between text-xs text-stone-400 dark:text-stone-500 mb-1">
            <span>Progress</span>
            <span>{progress.percent}%</span>
          </div>
          <div className="w-full h-2 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-all duration-300"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
