import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatTimestampName } from '../../utils/formatters';

interface QuickBookNoteProps {
  topicId: number;
  onRecordingSaved: () => void;
}

export default function QuickBookNote({ topicId, onRecordingSaved }: QuickBookNoteProps) {
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (isCreating) return;

    setIsCreating(true);
    try {
      // Pick a PDF file
      const pdfPath = await window.electronAPI.pdf.pickFile();
      if (!pdfPath) {
        setIsCreating(false);
        return;
      }

      // Create a new recording with type 'book'
      const recording = await window.electronAPI.recordings.create({
        topic_id: topicId,
        name: formatTimestampName(),
        recording_type: 'book',
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

      // Copy PDF to media directory
      const copiedPath = await window.electronAPI.pdf.copyToMedia(recording.id, pdfPath);

      // Update recording with PDF path
      await window.electronAPI.recordings.update(recording.id, { pdf_path: copiedPath });

      // Notify parent that a recording was saved
      onRecordingSaved();

      // Navigate to the recording page
      navigate(`/recording/${recording.id}`);
    } catch (error) {
      console.error('Failed to create book note:', error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <button
      onClick={handleCreate}
      disabled={isCreating}
      className="fixed bottom-8 right-52 w-16 h-16 bg-indigo-500 hover:bg-indigo-600
                 text-white rounded-full shadow-lg hover:shadow-xl transition-all
                 flex items-center justify-center text-2xl
                 focus:outline-none focus:ring-4 focus:ring-indigo-500/50
                 disabled:opacity-50 disabled:cursor-not-allowed"
      title="Add book note (PDF)"
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
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
          />
        </svg>
      )}
    </button>
  );
}
