import type { Recording } from '../../types';
import RecordingCard from './RecordingCard';

interface RecordingListProps {
  recordings: Recording[];
  loading?: boolean;
}

export default function RecordingList({ recordings, loading }: RecordingListProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="card p-4 animate-pulse"
          >
            <div className="h-4 bg-gray-200 dark:bg-dark-border rounded w-20 mb-2" />
            <div className="h-4 bg-gray-200 dark:bg-dark-border rounded w-full mb-2" />
            <div className="h-4 bg-gray-200 dark:bg-dark-border rounded w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  if (recordings.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">🎙️</div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          No recordings yet
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          Click the record button to add your first audio note
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {recordings.map(recording => (
        <RecordingCard key={recording.id} recording={recording} />
      ))}
    </div>
  );
}
