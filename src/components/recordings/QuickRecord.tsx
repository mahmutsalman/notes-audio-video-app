import { useState, useEffect, useCallback } from 'react';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import Modal from '../common/Modal';
import Button from '../common/Button';
import AudioRecorder from '../audio/AudioRecorder';
import AudioPlayer from '../audio/AudioPlayer';
import { formatDuration, formatTimestampName } from '../../utils/formatters';

interface QuickRecordProps {
  topicId: number;
  onRecordingSaved: () => void;
}

export default function QuickRecord({ topicId, onRecordingSaved }: QuickRecordProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [phase, setPhase] = useState<'recording' | 'review'>('recording');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedImages, setSelectedImages] = useState<{ data: ArrayBuffer; extension: string }[]>([]);
  const [selectedVideos, setSelectedVideos] = useState<string[]>([]); // File paths from clipboard

  const recorder = useVoiceRecorder();

  const handleOpen = () => {
    setIsOpen(true);
    setPhase('recording');
    setNotes('');
    setSelectedImages([]);
    setSelectedVideos([]);
  };

  const handleClose = () => {
    if (recorder.isRecording) {
      recorder.stopRecording();
    }
    recorder.resetRecording();
    setIsOpen(false);
  };

  const handleStopRecording = async () => {
    await recorder.stopRecording();
    setPhase('review');
  };

  const handlePickImages = async () => {
    try {
      const result = await window.electronAPI.clipboard.readImage();

      if (result.success && result.buffer) {
        setSelectedImages(prev => [...prev, { data: result.buffer!, extension: result.extension || 'png' }]);
      } else {
        alert('No image found in clipboard. Copy an image first, then click Paste.');
      }
    } catch (error) {
      console.error('Failed to read clipboard:', error);
      alert('Could not read clipboard. Make sure you have copied an image.');
    }
  };

  const handlePickVideos = async () => {
    try {
      // Try to read file URL from clipboard (works with CleanShot, Finder, etc.)
      const result = await window.electronAPI.clipboard.readFileUrl();

      if (result.success && result.filePath) {
        // Check if the file is a video by extension
        const videoExtensions = ['.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v'];
        const ext = result.filePath.toLowerCase().slice(result.filePath.lastIndexOf('.'));

        if (videoExtensions.includes(ext)) {
          setSelectedVideos(prev => [...prev, result.filePath!]);
        } else {
          alert(`The copied file is not a video (${ext}). Supported formats: MP4, MOV, WebM, AVI, MKV, M4V`);
        }
      } else {
        alert('No file found in clipboard. Copy a video file first (e.g., from CleanShot or Finder), then click Paste.');
      }
    } catch (error) {
      console.error('Failed to read clipboard:', error);
      alert('Could not read clipboard. Make sure you have copied a video file.');
    }
  };

  // Handle Cmd+V to add image to the last duration mark (works in both recording and review phases)
  const handlePasteToMark = useCallback(async () => {
    if (recorder.completedMarks.length === 0) return false;

    try {
      const result = await window.electronAPI.clipboard.readImage();
      if (result.success && result.buffer) {
        const added = recorder.addImageToLastMark({
          data: result.buffer,
          extension: result.extension || 'png'
        });
        return added;
      }
    } catch (error) {
      console.error('Failed to read clipboard for mark:', error);
    }
    return false;
  }, [recorder]);

  // Keyboard listener for Cmd+V to add image to last mark (works in both recording and review phases)
  useEffect(() => {
    if (!isOpen) return;
    if (recorder.completedMarks.length === 0) return;

    const handleKeyDown = async (e: KeyboardEvent) => {
      // Check for Cmd+V (macOS) or Ctrl+V (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        const added = await handlePasteToMark();
        if (added) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, recorder.completedMarks.length, handlePasteToMark]);

  const handleSave = async () => {
    if (!recorder.audioBlob) return;

    setIsSaving(true);

    try {
      // Create the recording with a default timestamp name
      const recording = await window.electronAPI.recordings.create({
        topic_id: topicId,
        name: formatTimestampName(),
        audio_path: null,
        audio_duration: recorder.duration,
        notes_content: notes || null,
      });

      // Save the audio file
      const arrayBuffer = await recorder.audioBlob.arrayBuffer();
      await window.electronAPI.audio.save(
        recording.id,
        arrayBuffer,
        `recording_${Date.now()}.webm`
      );

      // Add images from clipboard data
      for (const image of selectedImages) {
        await window.electronAPI.media.addImageFromClipboard(recording.id, image.data, image.extension);
      }

      // Add videos from file paths
      for (const videoPath of selectedVideos) {
        await window.electronAPI.media.addVideo(recording.id, videoPath);
      }

      // Save duration marks and their images
      for (const mark of recorder.completedMarks) {
        const duration = await window.electronAPI.durations.create({
          recording_id: recording.id,
          start_time: mark.start,
          end_time: mark.end,
          note: mark.note ?? null,
        });

        // Save images attached to this mark
        if (mark.images && mark.images.length > 0) {
          for (const image of mark.images) {
            await window.electronAPI.durationImages.addFromClipboard(
              duration.id,
              image.data,
              image.extension
            );
          }
        }
      }

      // Reset and close
      recorder.resetRecording();
      setIsOpen(false);
      onRecordingSaved();
    } catch (error) {
      console.error('Failed to save recording:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {/* FAB Button */}
      <button
        onClick={handleOpen}
        className="fixed bottom-8 right-8 w-16 h-16 bg-primary-600 hover:bg-primary-700
                   text-white rounded-full shadow-lg hover:shadow-xl transition-all
                   flex items-center justify-center text-2xl
                   focus:outline-none focus:ring-4 focus:ring-primary-500/50"
        title="Add new recording"
      >
        🎙️
      </button>

      {/* Recording Modal */}
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title={phase === 'recording' ? 'New Recording' : 'Review Recording'}
        size="lg"
      >
        {phase === 'recording' ? (
          <div className="space-y-4">
            <AudioRecorder
              recorder={recorder}
              onStopRecording={handleStopRecording}
            />

            {/* Show completed marks during recording */}
            {recorder.completedMarks.length > 0 && (
              <div className="p-3 bg-gray-50 dark:bg-dark-hover rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Marked Sections ({recorder.completedMarks.length})
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    ⌘V adds image to last mark
                  </span>
                </div>
                <div className="space-y-2">
                  {recorder.completedMarks.map((mark, index) => {
                    const imageCount = mark.images?.length || 0;
                    const isLastMark = index === recorder.completedMarks.length - 1;
                    return (
                      <div key={index} className="flex items-center gap-2 text-sm">
                        <span className="text-gray-600 dark:text-gray-400">
                          {formatDuration(mark.start)} → {formatDuration(mark.end)}
                        </span>
                        {imageCount > 0 ? (
                          <span className="px-1.5 py-0.5 bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 rounded text-xs font-medium">
                            📷 {imageCount}
                          </span>
                        ) : isLastMark ? (
                          <button
                            onClick={() => handlePasteToMark()}
                            className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-dark-border text-gray-600 dark:text-gray-400 hover:bg-primary-100 dark:hover:bg-primary-900/50 hover:text-primary-700 dark:hover:text-primary-300 rounded transition-colors"
                          >
                            📋 Paste Image
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400 dark:text-gray-500 italic">
                            No images
                          </span>
                        )}
                        {mark.note && (
                          <span className="text-gray-500 dark:text-gray-400 text-xs">
                            ({mark.note})
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Playback */}
            {recorder.audioUrl && (
              <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-dark-hover rounded-lg">
                <span className="text-green-500 text-xl">✓</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  Recording saved
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                  {formatDuration(recorder.duration)}
                </span>
              </div>
            )}

            {/* Audio player */}
            {recorder.audioUrl && (
              <AudioPlayer src={recorder.audioUrl} duration={recorder.duration} />
            )}

            {/* Completed duration marks with image indicators */}
            {recorder.completedMarks.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Marked Sections ({recorder.completedMarks.length})
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Press ⌘V to add image to last mark
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recorder.completedMarks.map((mark, index) => {
                    const imageCount = mark.images?.length || 0;
                    return (
                      <div
                        key={index}
                        className="relative px-3 py-1.5 bg-gray-100 dark:bg-dark-hover rounded-lg text-sm"
                      >
                        <span className="text-gray-700 dark:text-gray-300">
                          {formatDuration(mark.start)} → {formatDuration(mark.end)}
                        </span>
                        {imageCount > 0 && (
                          <span className="ml-2 px-1.5 py-0.5 bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 rounded text-xs font-medium">
                            📷 {imageCount}
                          </span>
                        )}
                        {mark.note && (
                          <span className="ml-2 text-gray-500 dark:text-gray-400 text-xs">
                            ({mark.note})
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Notes input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes about this recording..."
                rows={4}
                className="input-field resize-none"
              />
            </div>

            {/* Media attachments */}
            <div className="flex gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={handlePickImages}
                type="button"
              >
                📋 Paste Image {selectedImages.length > 0 && `(${selectedImages.length})`}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handlePickVideos}
                type="button"
              >
                📋 Paste Video {selectedVideos.length > 0 && `(${selectedVideos.length})`}
              </Button>
            </div>

            {/* Preview selected files */}
            {(selectedImages.length > 0 || selectedVideos.length > 0) && (
              <div className="flex flex-wrap gap-2">
                {selectedImages.map((image, i) => {
                  // Create a blob URL for preview
                  const blob = new Blob([image.data], { type: `image/${image.extension}` });
                  const previewUrl = URL.createObjectURL(blob);
                  return (
                    <div
                      key={i}
                      className="relative w-16 h-16 rounded overflow-hidden bg-gray-100 dark:bg-dark-border"
                    >
                      <img
                        src={previewUrl}
                        alt=""
                        className="w-full h-full object-cover"
                        onLoad={() => URL.revokeObjectURL(previewUrl)}
                      />
                      <button
                        onClick={() => setSelectedImages(prev => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-0 right-0 bg-red-500 text-white text-xs w-5 h-5 flex items-center justify-center"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
                {selectedVideos.map((videoPath, i) => (
                  <div
                    key={i}
                    className="relative w-16 h-16 rounded overflow-hidden bg-gray-100 dark:bg-dark-border flex items-center justify-center"
                    title={videoPath.split('/').pop()}
                  >
                    <span className="text-2xl">🎬</span>
                    <button
                      onClick={() => setSelectedVideos(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute top-0 right-0 bg-red-500 text-white text-xs w-5 h-5 flex items-center justify-center"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="secondary" onClick={handleClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Recording'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
