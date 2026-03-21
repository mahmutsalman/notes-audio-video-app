import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatTimestampName } from '../../utils/formatters';
import { extractTextFromPdf } from '../../services/textExtraction';
import ExtractionProgressModal from '../reader/ExtractionProgress';
import { ExtractionProgress } from '../../types';

interface QuickReaderNoteProps {
  topicId: number;
  onRecordingSaved: () => void;
}

export default function QuickReaderNote({ topicId, onRecordingSaved }: QuickReaderNoteProps) {
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState<ExtractionProgress | null>(null);

  const handleCreate = async () => {
    if (isCreating) return;
    setIsCreating(true);

    try {
      // 1. Pick a PDF file
      const pdfPath = await window.electronAPI.pdf.pickFile();
      if (!pdfPath) {
        setIsCreating(false);
        return;
      }

      // 2. Create a new recording with type 'reader'
      const recording = await window.electronAPI.recordings.create({
        topic_id: topicId,
        name: formatTimestampName(),
        recording_type: 'reader',
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

      // 3. Copy PDF to media directory
      const copiedPath = await window.electronAPI.pdf.copyToMedia(recording.id, pdfPath);
      await window.electronAPI.recordings.update(recording.id, { pdf_path: copiedPath });

      // 4. Show progress and extract text
      setExtractionProgress({ percent: 0, page: 0, totalPages: 0, phase: 'Reading PDF...' });

      const pdfBuffer = await window.electronAPI.pdf.readFile(copiedPath);
      const bookData = await extractTextFromPdf(pdfBuffer, (progress) => {
        setExtractionProgress(progress);
      });

      // 5. Save extracted book data via main process
      const bookDataPath = await window.electronAPI.pdf.saveBookData(recording.id, bookData);

      // 6. Update recording with book metadata
      await window.electronAPI.recordings.update(recording.id, {
        book_data_path: bookDataPath,
        total_pages: bookData.total_pages,
        total_words: bookData.total_words,
      });

      onRecordingSaved();
      setExtractionProgress(null);

      // 7. Navigate to the recording page
      navigate(`/recording/${recording.id}`);
    } catch (error) {
      console.error('Failed to create reader note:', error);
      setExtractionProgress(null);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      {extractionProgress && <ExtractionProgressModal progress={extractionProgress} />}

      <button
        onClick={handleCreate}
        disabled={isCreating}
        className="fixed bottom-8 right-72 w-16 h-16 bg-violet-500 hover:bg-violet-600
                   text-white rounded-full shadow-lg hover:shadow-xl transition-all
                   flex items-center justify-center
                   focus:outline-none focus:ring-4 focus:ring-violet-500/50
                   disabled:opacity-50 disabled:cursor-not-allowed"
        title="Add reader note (PDF with text extraction)"
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
    </>
  );
}
