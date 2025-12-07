import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRecording } from '../hooks/useRecordings';
import { useTopic } from '../hooks/useTopics';
import AudioPlayer from '../components/audio/AudioPlayer';
import Modal from '../components/common/Modal';
import Button from '../components/common/Button';
import { formatDuration, formatDate } from '../utils/formatters';

export default function RecordingPage() {
  const { recordingId } = useParams<{ recordingId: string }>();
  const navigate = useNavigate();
  const id = recordingId ? parseInt(recordingId, 10) : null;

  const { recording, loading, refetch } = useRecording(id);
  const { topic } = useTopic(recording?.topic_id ?? null);

  const [isEditing, setIsEditing] = useState(false);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);

  const handleEditNotes = () => {
    setNotes(recording?.notes_content ?? '');
    setIsEditing(true);
  };

  const handleSaveNotes = async () => {
    if (!id) return;
    setIsSaving(true);
    try {
      await window.electronAPI.recordings.update(id, { notes_content: notes || null });
      await refetch();
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRecording = async () => {
    if (!id || !recording) return;
    setIsDeleting(true);
    try {
      await window.electronAPI.recordings.delete(id);
      navigate(`/topic/${recording.topic_id}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddImages = async () => {
    if (!id) return;
    try {
      const result = await window.electronAPI.clipboard.readImage();

      if (result.success && result.buffer) {
        await window.electronAPI.media.addImageFromClipboard(id, result.buffer, result.extension || 'png');
        await refetch();
      } else {
        alert('No image found in clipboard. Copy an image first, then click Paste.');
      }
    } catch (error) {
      console.error('Failed to read clipboard:', error);
      alert('Could not read clipboard. Make sure you have copied an image.');
    }
  };

  const handleAddVideos = async () => {
    if (!id) return;
    try {
      // Try to read file URL from clipboard (works with CleanShot, Finder, etc.)
      const result = await window.electronAPI.clipboard.readFileUrl();

      if (result.success && result.filePath) {
        // Check if the file is a video by extension
        const videoExtensions = ['.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v'];
        const ext = result.filePath.toLowerCase().slice(result.filePath.lastIndexOf('.'));

        if (videoExtensions.includes(ext)) {
          await window.electronAPI.media.addVideo(id, result.filePath);
          await refetch();
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

  const handleDeleteImage = async (imageId: number) => {
    await window.electronAPI.media.deleteImage(imageId);
    await refetch();
  };

  const handleDeleteVideo = async (videoId: number) => {
    await window.electronAPI.media.deleteVideo(videoId);
    await refetch();
  };

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-dark-border rounded w-1/3" />
          <div className="h-20 bg-gray-200 dark:bg-dark-border rounded" />
          <div className="h-40 bg-gray-200 dark:bg-dark-border rounded" />
        </div>
      </div>
    );
  }

  if (!recording) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center">
        <div className="text-6xl mb-4">🔍</div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Recording not found
        </h2>
        <Button onClick={() => navigate('/')}>
          Back to Topics
        </Button>
      </div>
    );
  }

  const images = recording.images ?? [];
  const videos = recording.videos ?? [];
  const audioUrl = recording.audio_path
    ? window.electronAPI.paths.getFileUrl(recording.audio_path)
    : null;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          {topic && (
            <button
              onClick={() => navigate(`/topic/${topic.id}`)}
              className="text-primary-600 dark:text-primary-400 hover:underline text-sm mb-1"
            >
              ← {topic.name}
            </button>
          )}
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Recording
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {formatDate(recording.created_at)}
          </p>
        </div>
        <Button
          variant="danger"
          size="sm"
          onClick={() => setShowDeleteConfirm(true)}
        >
          Delete
        </Button>
      </div>

      {/* Audio player */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
          <span>🎙️</span>
          Audio
          <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
            ({formatDuration(recording.audio_duration)})
          </span>
        </h2>
        {audioUrl ? (
          <AudioPlayer src={audioUrl} duration={recording.audio_duration ?? undefined} />
        ) : (
          <p className="text-gray-500 dark:text-gray-400">No audio file available</p>
        )}
      </div>

      {/* Notes */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Notes
          </h2>
          {!isEditing && (
            <Button variant="ghost" size="sm" onClick={handleEditNotes}>
              Edit
            </Button>
          )}
        </div>
        {isEditing ? (
          <div className="space-y-3">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input-field resize-none"
              rows={6}
              placeholder="Add notes..."
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveNotes} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-gray-50 dark:bg-dark-hover rounded-lg">
            {recording.notes_content ? (
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {recording.notes_content}
              </p>
            ) : (
              <p className="text-gray-400 dark:text-gray-500 italic">
                No notes added
              </p>
            )}
          </div>
        )}
      </div>

      {/* Images */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Images ({images.length})
          </h2>
          <Button variant="ghost" size="sm" onClick={handleAddImages}>
            📋 Paste
          </Button>
        </div>
        {images.length > 0 ? (
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {images.map((img) => (
              <div key={img.id} className="relative group">
                <div
                  className="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-dark-border cursor-pointer"
                  onClick={() => setSelectedImage(img.file_path)}
                >
                  <img
                    src={window.electronAPI.paths.getFileUrl(img.thumbnail_path || img.file_path)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
                <button
                  onClick={() => handleDeleteImage(img.id)}
                  className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full
                             opacity-0 group-hover:opacity-100 transition-opacity
                             flex items-center justify-center text-sm"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400 dark:text-gray-500 italic">No images attached</p>
        )}
      </div>

      {/* Videos */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Videos ({videos.length})
          </h2>
          <Button variant="ghost" size="sm" onClick={handleAddVideos}>
            📋 Paste
          </Button>
        </div>
        {videos.length > 0 ? (
          <div className="space-y-3">
            {videos.map((video) => (
              <div
                key={video.id}
                className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-dark-hover rounded-lg group"
              >
                <div className="w-16 h-16 rounded bg-gray-200 dark:bg-dark-border flex items-center justify-center overflow-hidden">
                  {video.thumbnail_path ? (
                    <img
                      src={window.electronAPI.paths.getFileUrl(video.thumbnail_path)}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl">🎬</span>
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-gray-900 dark:text-gray-100 font-medium">
                    Video
                  </p>
                  {video.duration && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {formatDuration(video.duration)}
                    </p>
                  )}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelectedVideo(video.file_path)}
                >
                  Play
                </Button>
                <button
                  onClick={() => handleDeleteVideo(video.id)}
                  className="w-8 h-8 bg-red-500 text-white rounded-lg
                             opacity-0 group-hover:opacity-100 transition-opacity
                             flex items-center justify-center"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400 dark:text-gray-500 italic">No videos attached</p>
        )}
      </div>

      {/* Image lightbox */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <button
            className="absolute top-4 right-4 text-white text-2xl"
            onClick={() => setSelectedImage(null)}
          >
            ×
          </button>
          <img
            src={window.electronAPI.paths.getFileUrl(selectedImage)}
            alt=""
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Video lightbox */}
      {selectedVideo && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setSelectedVideo(null)}
        >
          <button
            className="absolute top-4 right-4 text-white text-2xl z-10"
            onClick={() => setSelectedVideo(null)}
          >
            ×
          </button>
          <video
            src={window.electronAPI.paths.getFileUrl(selectedVideo)}
            controls
            autoPlay
            className="max-w-full max-h-full"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Delete confirmation modal */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete Recording"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-700 dark:text-gray-300">
            Are you sure you want to delete this recording? This will also delete all
            attached images and videos.
          </p>
          <p className="text-red-600 dark:text-red-400 text-sm font-medium">
            This action cannot be undone.
          </p>
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteRecording}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete Recording'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
