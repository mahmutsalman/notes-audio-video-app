import { useNavigate } from 'react-router-dom';
import type { Topic } from '../../types';
import Card from '../common/Card';
import Badge from '../common/Badge';
import { formatRelativeTime } from '../../utils/formatters';

interface TopicCardProps {
  topic: Topic;
  onContextMenu?: (e: React.MouseEvent, topic: Topic) => void;
}

export default function TopicCard({ topic, onContextMenu }: TopicCardProps) {
  const navigate = useNavigate();

  const handleContextMenu = (e: React.MouseEvent) => {
    if (onContextMenu) {
      e.preventDefault();
      onContextMenu(e, topic);
    }
  };

  return (
    <Card
      onClick={() => navigate(`/topic/${topic.id}`)}
      onContextMenu={handleContextMenu}
      hoverable
      className="p-4"
    >
      {/* Topic name */}
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
        {topic.name}
      </h3>

      {/* Tags */}
      {topic.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {topic.tags.map(tag => (
            <Badge key={tag} size="sm">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mb-2">
        <span className="flex items-center gap-1">
          <span>🎙️</span>
          <span>{topic.total_recordings ?? 0} recordings</span>
        </span>
        <span className="flex items-center gap-1">
          <span>🖼️</span>
          <span>{topic.total_images ?? 0}</span>
        </span>
        <span className="flex items-center gap-1">
          <span>🎬</span>
          <span>{topic.total_videos ?? 0}</span>
        </span>
      </div>

      {/* Updated time */}
      <div className="text-xs text-gray-400 dark:text-gray-500">
        Updated: {formatRelativeTime(topic.updated_at)}
      </div>
    </Card>
  );
}
