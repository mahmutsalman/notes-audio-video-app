import type { Topic } from '../../types';
import TopicCard from './TopicCard';

interface TopicListProps {
  topics: Topic[];
  loading?: boolean;
}

export default function TopicList({ topics, loading }: TopicListProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="card p-4 animate-pulse"
          >
            <div className="h-4 bg-gray-200 dark:bg-dark-border rounded w-3/4 mb-2" />
            <div className="h-6 bg-gray-200 dark:bg-dark-border rounded w-full mb-2" />
            <div className="h-4 bg-gray-200 dark:bg-dark-border rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (topics.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">📝</div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          No topics yet
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          Create your first topic to start organizing your audio notes
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {topics.map(topic => (
        <TopicCard key={topic.id} topic={topic} />
      ))}
    </div>
  );
}
