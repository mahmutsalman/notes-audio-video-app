import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatTimestampName } from '../../utils/formatters';

interface QuickWrittenNoteProps {
  topicId: number;
  onRecordingSaved: () => void;
}

export default function QuickWrittenNote({ topicId, onRecordingSaved }: QuickWrittenNoteProps) {
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (isCreating) return;

    setIsCreating(true);
    try {
      // Create a new recording with type 'written'
      const recording = await window.electronAPI.recordings.create({
        topic_id: topicId,
        name: formatTimestampName(),
        recording_type: 'written',
        audio_path: null,
        audio_duration: null,
        audio_size: null,
        video_path: null,
        video_duration: null,
        video_resolution: null,
        video_fps: null,
        video_size: null,
        notes_content: null,
      });

      // Notify parent that a recording was saved
      onRecordingSaved();

      // Navigate to the recording page
      navigate(`/recording/${recording.id}`);
    } catch (error) {
      console.error('Failed to create written note:', error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <button
      onClick={handleCreate}
      disabled={isCreating}
      className="fixed bottom-8 right-32 w-16 h-16 bg-teal-500 hover:bg-teal-600
                 text-white rounded-full shadow-lg hover:shadow-xl transition-all
                 flex items-center justify-center text-2xl
                 focus:outline-none focus:ring-4 focus:ring-teal-500/50
                 disabled:opacity-50 disabled:cursor-not-allowed"
      title="Add written note"
    >
      {isCreating ? (
        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
      ) : (
        <svg
          className="w-8 h-8"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      )}
    </button>
  );
}
