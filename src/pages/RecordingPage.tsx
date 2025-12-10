import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRecording, useRecordings } from '../hooks/useRecordings';
import { useTopic } from '../hooks/useTopics';
import { useDurations } from '../hooks/useDurations';
import AudioPlayer, { AudioPlayerHandle } from '../components/audio/AudioPlayer';
import DurationList from '../components/recordings/DurationList';
import Modal from '../components/common/Modal';
import Button from '../components/common/Button';
import { formatDuration, formatDate, formatRelativeTime } from '../utils/formatters';
import type { Duration, DurationColor } from '../types';

export default function RecordingPage() {
  const { recordingId } = useParams<{ recordingId: string }>();
  const navigate = useNavigate();
  const id = recordingId ? parseInt(recordingId, 10) : null;

  const { recording, loading, refetch } = useRecording(id);
  const { topic } = useTopic(recording?.topic_id ?? null);
  const { recordings: topicRecordings } = useRecordings(recording?.topic_id ?? null);
  const {
    durations,
    deleteDuration,
    updateDuration,
    durationImagesCache,
    getDurationImages,
    addDurationImageFromClipboard,
    deleteDurationImage,
  } = useDurations(id);

  // Calculate adjacent recording IDs for navigation
  const currentIndex = topicRecordings.findIndex(r => r.id === id);
  const prevRecordingId = currentIndex > 0 ? topicRecordings[currentIndex - 1].id : null;
  const nextRecordingId = currentIndex >= 0 && currentIndex < topicRecordings.length - 1
    ? topicRecordings[currentIndex + 1].id
    : null;

  const [isEditing, setIsEditing] = useState(false);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [isContentPressed, setIsContentPressed] = useState(false);
  const [activeDurationId, setActiveDurationId] = useState<number | null>(null);
  const [selectedDurationImageIndex, setSelectedDurationImageIndex] = useState<number | null>(null);
  const [audioLoaded, setAudioLoaded] = useState(false);
  const [isSeekingDuration, setIsSeekingDuration] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [imageToDelete, setImageToDelete] = useState<{
    type: 'recording' | 'duration';
    imageId: number;
  } | null>(null);

  const audioPlayerRef = useRef<AudioPlayerHandle>(null);

  // Reset loop state and audio loaded state when changing recordings
  useEffect(() => {
    setActiveDurationId(null);
    setAudioLoaded(false);
    setIsSeekingDuration(false);
  }, [id]);

  // Handle clicks on empty page areas to toggle audio playback
  const handlePageClick = (e: React.MouseEvent) => {
    // Skip if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, textarea, [role="button"], video, img')) return;

    // Skip if modals open or editing
    if (selectedImageIndex !== null || selectedVideo !== null || isEditing || isEditingName || showDeleteConfirm) return;

    // Toggle audio playback (depress effect is handled separately on Audio section)
    audioPlayerRef.current?.toggle();
  };

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

  const handleEditName = () => {
    setEditingName(recording?.name || '');
    setIsEditingName(true);
  };

  const handleSaveName = async () => {
    if (!id) return;
    const trimmedName = editingName.trim();
    await window.electronAPI.recordings.update(id, { name: trimmedName || null });
    await refetch();
    setIsEditingName(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveName();
    } else if (e.key === 'Escape') {
      setIsEditingName(false);
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

  const handleDeleteImage = (imageId: number) => {
    setImageToDelete({ type: 'recording', imageId });
  };

  const handleDeleteVideo = async (videoId: number) => {
    await window.electronAPI.media.deleteVideo(videoId);
    await refetch();
  };

  // Handle duration click for loop playback
  const handleDurationClick = async (duration: Duration) => {
    // Block clicks until audio is fully loaded
    if (!audioPlayerRef.current?.isLoaded) {
      console.log('[RecordingPage] Audio not loaded yet, ignoring duration click');
      return;
    }

    // Block rapid clicks - wait for playback to start before allowing another click
    if (isSeekingDuration) {
      console.log('[RecordingPage] Already seeking to a duration, ignoring click');
      return;
    }

    if (activeDurationId === duration.id) {
      // Already looping this one - stop
      audioPlayerRef.current?.clearLoopRegion();
      setActiveDurationId(null);
    } else {
      // Start looping this duration - block further clicks until playback starts
      setIsSeekingDuration(true);
      audioPlayerRef.current?.setLoopRegion(duration.start_time, duration.end_time);
      setActiveDurationId(duration.id);
      // Fetch images for this duration if not cached
      await getDurationImages(duration.id);
    }
  };

  // Handle adding image to active duration from clipboard
  const handleAddDurationImage = async () => {
    if (!activeDurationId) return;
    const image = await addDurationImageFromClipboard(activeDurationId);
    if (!image) {
      alert('No image found in clipboard. Copy an image first, then click Paste.');
    }
  };

  // Handle deleting a duration image
  const handleDeleteDurationImage = (imageId: number) => {
    setImageToDelete({ type: 'duration', imageId });
  };

  // Confirm and execute image deletion
  const confirmDeleteImage = async () => {
    if (!imageToDelete) return;

    if (imageToDelete.type === 'recording') {
      await window.electronAPI.media.deleteImage(imageToDelete.imageId);
      await refetch();
    } else if (imageToDelete.type === 'duration' && activeDurationId) {
      await deleteDurationImage(imageToDelete.imageId, activeDurationId);
    }

    setImageToDelete(null);
  };

  // Handle duration delete
  const handleDeleteDuration = async (id: number) => {
    // If deleting the active duration, clear the loop first
    if (activeDurationId === id) {
      audioPlayerRef.current?.clearLoopRegion();
      setActiveDurationId(null);
    }
    await deleteDuration(id);
  };

  // Handle duration note update
  const handleUpdateNote = async (durationId: number, note: string | null) => {
    await updateDuration(durationId, { note });
  };

  // Handle duration color change
  const handleColorChange = async (durationId: number, color: DurationColor) => {
    await updateDuration(durationId, { color });
  };

  // Keyboard navigation for image lightbox
  const images = recording?.images ?? [];
  useEffect(() => {
    if (selectedImageIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        setSelectedImageIndex(i => (i !== null && i > 0 ? i - 1 : i));
      } else if (e.key === 'ArrowRight') {
        setSelectedImageIndex(i => (i !== null && i < images.length - 1 ? i + 1 : i));
      } else if (e.key === 'Escape') {
        setSelectedImageIndex(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedImageIndex, images.length]);

  // Keyboard navigation for duration image lightbox
  const activeDurationImages = activeDurationId ? durationImagesCache[activeDurationId] ?? [] : [];
  useEffect(() => {
    if (selectedDurationImageIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        setSelectedDurationImageIndex(i => (i !== null && i > 0 ? i - 1 : i));
      } else if (e.key === 'ArrowRight') {
        setSelectedDurationImageIndex(i => (i !== null && i < activeDurationImages.length - 1 ? i + 1 : i));
      } else if (e.key === 'Escape') {
        setSelectedDurationImageIndex(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDurationImageIndex, activeDurationImages.length]);

  // Keyboard navigation for recording navigation (between recordings in same topic)
  useEffect(() => {
    const handleRecordingNav = (e: KeyboardEvent) => {
      // Skip if image lightbox is open (image navigation takes priority)
      if (selectedImageIndex !== null) return;

      // Skip if duration image lightbox is open
      if (selectedDurationImageIndex !== null) return;

      // Skip if video lightbox is open
      if (selectedVideo !== null) return;

      // Skip if editing notes
      if (isEditing) return;

      // Skip if user is focused on any input field
      const activeEl = document.activeElement;
      if (activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA') return;

      if (e.key === 'ArrowLeft' && prevRecordingId) {
        navigate(`/recording/${prevRecordingId}`);
      } else if (e.key === 'ArrowRight' && nextRecordingId) {
        navigate(`/recording/${nextRecordingId}`);
      } else if (e.key === 'Escape' && activeDurationId !== null) {
        // Stop loop playback on Escape
        audioPlayerRef.current?.clearLoopRegion();
        setActiveDurationId(null);
      }
    };

    window.addEventListener('keydown', handleRecordingNav);
    return () => window.removeEventListener('keydown', handleRecordingNav);
  }, [selectedImageIndex, selectedDurationImageIndex, selectedVideo, isEditing, prevRecordingId, nextRecordingId, navigate, activeDurationId]);

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

  const videos = recording.videos ?? [];
  const audioUrl = recording.audio_path
    ? window.electronAPI.paths.getFileUrl(recording.audio_path)
    : null;

  return (
    <div
      className="min-h-screen cursor-pointer"
      onClick={handlePageClick}
      onMouseDown={(e) => e.button === 0 && setIsContentPressed(true)}
      onMouseUp={() => setIsContentPressed(false)}
      onMouseLeave={() => setIsContentPressed(false)}
    >
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
          {isEditingName ? (
            <input
              type="text"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={handleSaveName}
              onKeyDown={handleNameKeyDown}
              autoFocus
              className="text-2xl font-bold text-gray-900 dark:text-gray-100 bg-transparent border-b-2 border-primary-500 outline-none w-full"
              placeholder="Recording name..."
            />
          ) : (
            <h1
              onClick={handleEditName}
              className="text-2xl font-bold text-gray-900 dark:text-gray-100 cursor-pointer hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              title="Click to edit name"
            >
              {recording.name || formatRelativeTime(recording.created_at)}
            </h1>
          )}
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
      <div
        className={`mb-6 p-4 -mx-4 cursor-pointer rounded-xl
                    bg-gray-50 dark:bg-dark-surface
                    shadow-[0_4px_0_0_rgba(0,0,0,0.08)] dark:shadow-[0_4px_0_0_rgba(0,0,0,0.25)]
                    transition-all duration-75
                    ${isContentPressed ? 'translate-y-1 shadow-none' : ''}`}
      >
        <h2
          className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2 select-none"
          onContextMenu={(e) => {
            e.preventDefault();
            setShowDebug(prev => !prev);
          }}
        >
          <span>🎙️</span>
          Audio
          <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
            ({formatDuration(recording.audio_duration)})
          </span>
        </h2>
        {audioUrl ? (
          <AudioPlayer
            ref={audioPlayerRef}
            src={audioUrl}
            duration={recording.audio_duration ?? undefined}
            onLoad={() => setAudioLoaded(true)}
            onPlay={() => setIsSeekingDuration(false)}
            showDebug={showDebug}
          />
        ) : (
          <p className="text-gray-500 dark:text-gray-400">No audio file available</p>
        )}
      </div>

      {/* Duration markers */}
      <DurationList
        durations={durations}
        activeDurationId={activeDurationId}
        onDurationClick={handleDurationClick}
        onDeleteDuration={handleDeleteDuration}
        onUpdateNote={handleUpdateNote}
        onColorChange={handleColorChange}
        durationImagesCache={durationImagesCache}
        disabled={!audioLoaded || isSeekingDuration}
      />

      {/* Duration Images - shown when a duration is active and has images */}
      {activeDurationId && activeDurationImages.length > 0 && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-blue-700 dark:text-blue-300">
              Images ({activeDurationImages.length})
            </h3>
            <button
              onClick={handleAddDurationImage}
              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
            >
              📋 Paste
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeDurationImages.map((img, index) => (
              <div key={img.id} className="relative group">
                <div
                  className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 dark:bg-dark-border cursor-pointer"
                  onClick={() => setSelectedDurationImageIndex(index)}
                >
                  <img
                    src={window.electronAPI.paths.getFileUrl(img.thumbnail_path || img.file_path)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
                <button
                  onClick={() => handleDeleteDurationImage(img.id)}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full
                             opacity-0 group-hover:opacity-100 transition-opacity
                             flex items-center justify-center text-xs"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Image prompt when duration is active but has no images */}
      {activeDurationId && activeDurationImages.length === 0 && (
        <div className="mb-4 p-3 bg-gray-50 dark:bg-dark-hover border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span>No images for this section</span>
            <button
              onClick={handleAddDurationImage}
              className="px-2 py-1 text-xs bg-gray-200 dark:bg-dark-border rounded hover:bg-gray-300 dark:hover:bg-dark-surface transition-colors"
            >
              📋 Paste Image
            </button>
          </div>
        </div>
      )}

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
            {images.map((img, index) => (
              <div key={img.id} className="relative group">
                {/* Number badge */}
                <div className="absolute top-1 left-1 w-6 h-6 bg-black/70 text-white
                                rounded-full flex items-center justify-center text-xs font-bold z-10">
                  {index + 1}
                </div>
                <div
                  className="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-dark-border cursor-pointer"
                  onClick={() => setSelectedImageIndex(index)}
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
      {selectedImageIndex !== null && images[selectedImageIndex] && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setSelectedImageIndex(null)}
        >
          {/* Close button */}
          <button
            className="absolute top-4 right-4 text-white text-2xl hover:text-gray-300 z-10"
            onClick={() => setSelectedImageIndex(null)}
          >
            ×
          </button>

          {/* Image counter */}
          <div className="absolute top-4 left-4 text-white text-lg font-medium">
            {selectedImageIndex + 1} / {images.length}
          </div>

          {/* Previous button */}
          {selectedImageIndex > 0 && (
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white text-5xl
                         hover:text-gray-300 transition-colors px-2"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedImageIndex(i => i! - 1);
              }}
            >
              ‹
            </button>
          )}

          {/* Image */}
          <img
            src={window.electronAPI.paths.getFileUrl(images[selectedImageIndex].file_path)}
            alt=""
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Next button */}
          {selectedImageIndex < images.length - 1 && (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white text-5xl
                         hover:text-gray-300 transition-colors px-2"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedImageIndex(i => i! + 1);
              }}
            >
              ›
            </button>
          )}
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

      {/* Duration Image lightbox */}
      {selectedDurationImageIndex !== null && activeDurationImages[selectedDurationImageIndex] && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setSelectedDurationImageIndex(null)}
        >
          {/* Close button */}
          <button
            className="absolute top-4 right-4 text-white text-2xl hover:text-gray-300 z-10"
            onClick={() => setSelectedDurationImageIndex(null)}
          >
            ×
          </button>

          {/* Image counter */}
          <div className="absolute top-4 left-4 text-white text-lg font-medium">
            {selectedDurationImageIndex + 1} / {activeDurationImages.length}
          </div>

          {/* Previous button */}
          {selectedDurationImageIndex > 0 && (
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white text-5xl
                         hover:text-gray-300 transition-colors px-2"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedDurationImageIndex(i => i! - 1);
              }}
            >
              ‹
            </button>
          )}

          {/* Image */}
          <img
            src={window.electronAPI.paths.getFileUrl(activeDurationImages[selectedDurationImageIndex].file_path)}
            alt=""
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Next button */}
          {selectedDurationImageIndex < activeDurationImages.length - 1 && (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white text-5xl
                         hover:text-gray-300 transition-colors px-2"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedDurationImageIndex(i => i! + 1);
              }}
            >
              ›
            </button>
          )}
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

      {/* Image delete confirmation modal */}
      <Modal
        isOpen={imageToDelete !== null}
        onClose={() => setImageToDelete(null)}
        title="Delete Image"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-700 dark:text-gray-300">
            Are you sure you want to delete this image?
          </p>
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setImageToDelete(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={confirmDeleteImage}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>
      </div>
    </div>
  );
}
