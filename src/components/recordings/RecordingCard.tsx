import { useNavigate } from 'react-router-dom';
import type { Recording } from '../../types';
import Card from '../common/Card';
import { formatDuration, formatRelativeTime, truncateNotes } from '../../utils/formatters';
import { getImportanceBorderStyle } from '../../utils/importance';
import { isWrittenNote, isBookNote, isReaderNote, isMarkBasedNote } from '../../utils/marks';
import { HighlightedText } from '../common/HighlightedText';
import type { SearchMatch } from '../../utils/searchUtils';

interface RecordingCardProps {
  recording: Recording;
  onContextMenu?: (e: React.MouseEvent, recording: Recording) => void;
  matchMetadata?: SearchMatch['matchedFields'];
}

export default function RecordingCard({ recording, onContextMenu, matchMetadata }: RecordingCardProps) {
  const navigate = useNavigate();

  const images = recording.images ?? [];
  const videos = recording.videos ?? [];
  // For mark-based notes (written/book), show main_notes_content; for audio/video recordings, show notes_content
  const isMarkBased = isMarkBasedNote(recording);
  const truncatedNotes = truncateNotes(
    isMarkBased ? recording.main_notes_content : recording.notes_content
  );

  const handleContextMenu = (e: React.MouseEvent) => {
    if (onContextMenu) {
      e.preventDefault();
      onContextMenu(e, recording);
    }
  };

  const importanceBorderStyle = getImportanceBorderStyle(recording.importance_color);

  return (
    <Card
      onClick={() => navigate(`/recording/${recording.id}`)}
      onContextMenu={handleContextMenu}
      hoverable
      className="p-4"
      style={importanceBorderStyle}
    >
      {/* Recording name */}
      <div className="font-medium text-gray-800 dark:text-gray-200 mb-1 truncate">
        <HighlightedText
          text={recording.name || formatRelativeTime(recording.created_at)}
          positions={matchMetadata?.name?.positions}
        />
      </div>

      {/* Type indicator - Show video duration for screen recordings, audio for voice recordings, or written note indicator */}
      <div className="flex items-center gap-2 mb-2">
        {isReaderNote(recording) ? (
          <>
            <span className="text-violet-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </span>
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Reader{recording.reading_progress && recording.reading_progress > 0 ? ` · ${Math.round(recording.reading_progress * 100)}%` : ''}
            </span>
          </>
        ) : isBookNote(recording) ? (
          <>
            <span className="text-indigo-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </span>
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Book Note
            </span>
          </>
        ) : isWrittenNote(recording) ? (
          <>
            <span className="text-teal-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </span>
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Written Note
            </span>
          </>
        ) : recording.video_path ? (
          <>
            <span className="text-red-500">🎬</span>
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
              {formatDuration(recording.video_duration)}
            </span>
          </>
        ) : (
          <>
            <span className="text-red-500">🎙️</span>
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
              {formatDuration(recording.audio_duration)}
            </span>
          </>
        )}
      </div>

      {/* Truncated notes */}
      {truncatedNotes && (
        <p className="text-gray-700 dark:text-gray-300 text-sm mb-3 line-clamp-2">
          "<HighlightedText
            text={truncatedNotes}
            positions={matchMetadata?.notes?.positions}
          />"
        </p>
      )}

      {/* Media previews */}
      {(images.length > 0 || videos.length > 0) && (
        <div className="flex items-center gap-2 mb-3">
          {/* First 2 image thumbnails */}
          {images.slice(0, 2).map((img) => (
            <div
              key={img.id}
              className="w-12 h-12 rounded overflow-hidden bg-gray-100 dark:bg-dark-border flex-shrink-0"
            >
              <img
                src={window.electronAPI.paths.getFileUrl(img.thumbnail_path || img.file_path)}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          ))}

          {/* Remaining images count */}
          {images.length > 2 && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              +{images.length - 2} 🖼️
            </span>
          )}

          {/* Video thumbnail + count */}
          {videos.length > 0 && (
            <div className="relative">
              <div className="w-12 h-12 rounded overflow-hidden bg-gray-100 dark:bg-dark-border flex items-center justify-center">
                {videos[0].thumbnail_path ? (
                  <img
                    src={window.electronAPI.paths.getFileUrl(videos[0].thumbnail_path)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-2xl">🎬</span>
                )}
              </div>
              {videos.length > 1 && (
                <span className="absolute -bottom-1 -right-1 bg-gray-800 dark:bg-gray-700 text-white text-xs px-1.5 rounded">
                  +{videos.length - 1}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Timestamp */}
      <div className="text-xs text-gray-400 dark:text-gray-500">
        {formatRelativeTime(recording.created_at)}
      </div>
    </Card>
  );
}
