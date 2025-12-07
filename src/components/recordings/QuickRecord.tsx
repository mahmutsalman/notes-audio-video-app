import { useState } from 'react';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import Modal from '../common/Modal';
import Button from '../common/Button';
import AudioRecorder from '../audio/AudioRecorder';
import AudioPlayer from '../audio/AudioPlayer';
import { formatDuration } from '../../utils/formatters';

interface QuickRecordProps {
  topicId: number;
  onRecordingSaved: () => void;
}

export default function QuickRecord({ topicId, onRecordingSaved }: QuickRecordProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [phase, setPhase] = useState<'recording' | 'review'>('recording');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [selectedVideos, setSelectedVideos] = useState<string[]>([]);

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
    const files = await window.electronAPI.media.pickFiles('image');
    setSelectedImages(prev => [...prev, ...files]);
  };

  const handlePickVideos = async () => {
    const files = await window.electronAPI.media.pickFiles('video');
    setSelectedVideos(prev => [...prev, ...files]);
  };

  const handleSave = async () => {
    if (!recorder.audioBlob) return;

    setIsSaving(true);

    try {
      // Create the recording
      const recording = await window.electronAPI.recordings.create({
        topic_id: topicId,
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

      // Add images
      for (const imagePath of selectedImages) {
        await window.electronAPI.media.addImage(recording.id, imagePath);
      }

      // Add videos
      for (const videoPath of selectedVideos) {
        await window.electronAPI.media.addVideo(recording.id, videoPath);
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
          <AudioRecorder
            recorder={recorder}
            onStopRecording={handleStopRecording}
          />
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
                + Images {selectedImages.length > 0 && `(${selectedImages.length})`}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handlePickVideos}
                type="button"
              >
                + Videos {selectedVideos.length > 0 && `(${selectedVideos.length})`}
              </Button>
            </div>

            {/* Preview selected files */}
            {(selectedImages.length > 0 || selectedVideos.length > 0) && (
              <div className="flex flex-wrap gap-2">
                {selectedImages.map((path, i) => (
                  <div
                    key={i}
                    className="relative w-16 h-16 rounded overflow-hidden bg-gray-100 dark:bg-dark-border"
                  >
                    <img
                      src={window.electronAPI.paths.getFileUrl(path)}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={() => setSelectedImages(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute top-0 right-0 bg-red-500 text-white text-xs w-5 h-5 flex items-center justify-center"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {selectedVideos.map((_path, i) => (
                  <div
                    key={i}
                    className="relative w-16 h-16 rounded overflow-hidden bg-gray-100 dark:bg-dark-border flex items-center justify-center"
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
