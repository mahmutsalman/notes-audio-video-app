import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRecording, useRecordings } from '../hooks/useRecordings';
import { useTopic } from '../hooks/useTopics';
import { useDurations } from '../hooks/useDurations';
import { useAudios } from '../hooks/useAudios';
import AudioPlayer, { AudioPlayerHandle } from '../components/audio/AudioPlayer';
import SimpleAudioRecordModal from '../components/audio/SimpleAudioRecordModal';
import ThemedAudioPlayer from '../components/audio/ThemedAudioPlayer';
import DurationList from '../components/recordings/DurationList';
import Modal from '../components/common/Modal';
import Button from '../components/common/Button';
import NotesEditor from '../components/common/NotesEditor';
import { formatDuration, formatDate, formatRelativeTime } from '../utils/formatters';
import type { Duration, DurationColor, Image, Video, DurationImage, DurationVideo, DurationAudio, Audio } from '../types';

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
    durationVideosCache,
    getDurationVideos,
    addDurationVideoFromClipboard,
    deleteDurationVideo,
    durationAudiosCache,
    getDurationAudios,
    addDurationAudioFromBuffer,
    deleteDurationAudio,
  } = useDurations(id);

  const {
    audios: recordingAudios,
    addAudioFromBuffer,
    deleteAudio: deleteRecordingAudio,
    updateCaption: updateAudioCaption,
  } = useAudios(id);

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
  const [videoToDelete, setVideoToDelete] = useState<number | null>(null);
  const [durationToDelete, setDurationToDelete] = useState<number | null>(null);
  const [durationVideoToDelete, setDurationVideoToDelete] = useState<{
    videoId: number;
    durationId: number;
  } | null>(null);
  const [selectedDurationVideoPath, setSelectedDurationVideoPath] = useState<string | null>(null);
  const [isRecordingDurationAudio, setIsRecordingDurationAudio] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [durationAudioToDelete, setDurationAudioToDelete] = useState<{
    audioId: number;
    durationId: number;
  } | null>(null);
  const [recordingAudioToDelete, setRecordingAudioToDelete] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    type: 'image' | 'video' | 'durationImage' | 'durationVideo' | 'durationAudio' | 'audio';
    item: Image | Video | DurationImage | DurationVideo | DurationAudio | Audio;
    x: number;
    y: number;
  } | null>(null);
  const [captionModal, setCaptionModal] = useState<{
    type: 'image' | 'video' | 'durationImage' | 'durationVideo' | 'durationAudio' | 'audio';
    id: number;
    currentCaption: string;
  } | null>(null);
  const [captionText, setCaptionText] = useState('');

  const audioPlayerRef = useRef<AudioPlayerHandle>(null);

  // Helper to preserve scroll position across refetch
  const preserveScrollPosition = async (operation: () => Promise<void>) => {
    const scrollY = window.scrollY;
    await operation();
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollY);
    });
  };

  // Reset loop state and audio loaded state when changing recordings
  useEffect(() => {
    setActiveDurationId(null);
    setAudioLoaded(false);
    setIsSeekingDuration(false);
  }, [id]);

  // Handle clicks on empty page areas to toggle audio playback
  const handlePageClick = (e: React.MouseEvent) => {
    // Skip if clicking on interactive elements (including Quill editor)
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, textarea, [role="button"], video, img, .ql-editor, .ql-toolbar, .notes-editor')) return;

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
      await preserveScrollPosition(refetch);
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
    await preserveScrollPosition(refetch);
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
        await preserveScrollPosition(refetch);
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
          await preserveScrollPosition(refetch);
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

  const handleDeleteVideo = (videoId: number) => {
    setVideoToDelete(videoId);
  };

  const confirmDeleteVideo = async () => {
    if (!videoToDelete) return;
    await window.electronAPI.media.deleteVideo(videoToDelete);
    await preserveScrollPosition(refetch);
    setVideoToDelete(null);
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
      // Fetch images, videos, and audios for this duration if not cached
      await Promise.all([
        getDurationImages(duration.id),
        getDurationVideos(duration.id),
        getDurationAudios(duration.id),
      ]);
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

  // Handle adding video to active duration from clipboard
  const handleAddDurationVideo = async () => {
    if (!activeDurationId) return;
    const video = await addDurationVideoFromClipboard(activeDurationId);
    if (!video) {
      alert('No video file found in clipboard. Copy a video file first (e.g., from CleanShot or Finder), then click Paste.');
    }
  };

  // Handle deleting a duration video
  const handleDeleteDurationVideo = (videoId: number) => {
    if (!activeDurationId) return;
    setDurationVideoToDelete({ videoId, durationId: activeDurationId });
  };

  // Confirm and execute duration video deletion
  const confirmDeleteDurationVideo = async () => {
    if (!durationVideoToDelete) return;
    await deleteDurationVideo(durationVideoToDelete.videoId, durationVideoToDelete.durationId);
    setDurationVideoToDelete(null);
  };

  // Handle saving duration audio from recording modal
  const handleSaveDurationAudio = async (audioBlob: Blob) => {
    if (!activeDurationId) return;
    const buffer = await audioBlob.arrayBuffer();
    await addDurationAudioFromBuffer(activeDurationId, buffer, 'webm');
  };

  // Handle deleting a duration audio
  const handleDeleteDurationAudio = (audioId: number) => {
    if (!activeDurationId) return;
    setDurationAudioToDelete({ audioId, durationId: activeDurationId });
  };

  // Confirm and execute duration audio deletion
  const confirmDeleteDurationAudio = async () => {
    if (!durationAudioToDelete) return;
    await deleteDurationAudio(durationAudioToDelete.audioId, durationAudioToDelete.durationId);
    setDurationAudioToDelete(null);
  };

  // Handle saving recording audio from recording modal
  const handleSaveRecordingAudio = async (audioBlob: Blob) => {
    const buffer = await audioBlob.arrayBuffer();
    await addAudioFromBuffer(buffer, 'webm');
  };

  // Handle deleting a recording audio
  const handleDeleteRecordingAudio = (audioId: number) => {
    setRecordingAudioToDelete(audioId);
  };

  // Confirm and execute recording audio deletion
  const confirmDeleteRecordingAudio = async () => {
    if (!recordingAudioToDelete) return;
    await deleteRecordingAudio(recordingAudioToDelete);
    setRecordingAudioToDelete(null);
  };

  // Handle context menu for images/videos/audios
  const handleContextMenu = (
    e: React.MouseEvent,
    type: 'image' | 'video' | 'durationImage' | 'durationVideo' | 'durationAudio' | 'audio',
    item: Image | Video | DurationImage | DurationVideo | DurationAudio | Audio
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ type, item, x: e.clientX, y: e.clientY });
  };

  // Open caption modal
  const openCaptionModal = (type: 'image' | 'video' | 'durationImage' | 'durationVideo' | 'durationAudio' | 'audio', id: number, currentCaption: string | null) => {
    setCaptionModal({ type, id, currentCaption: currentCaption || '' });
    setCaptionText(currentCaption || '');
    setContextMenu(null);
  };

  // Save caption
  const handleSaveCaption = async () => {
    if (!captionModal) return;
    const trimmedCaption = captionText.trim() || null;

    try {
      if (captionModal.type === 'image') {
        await window.electronAPI.media.updateImageCaption(captionModal.id, trimmedCaption);
        await preserveScrollPosition(refetch);
      } else if (captionModal.type === 'video') {
        await window.electronAPI.media.updateVideoCaption(captionModal.id, trimmedCaption);
        await preserveScrollPosition(refetch);
      } else if (captionModal.type === 'durationImage' && activeDurationId) {
        await window.electronAPI.durationImages.updateCaption(captionModal.id, trimmedCaption);
        await getDurationImages(activeDurationId, true);
      } else if (captionModal.type === 'durationVideo' && activeDurationId) {
        await window.electronAPI.durationVideos.updateCaption(captionModal.id, trimmedCaption);
        await getDurationVideos(activeDurationId, true);
      } else if (captionModal.type === 'durationAudio' && activeDurationId) {
        await window.electronAPI.durationAudios.updateCaption(captionModal.id, trimmedCaption);
        await getDurationAudios(activeDurationId, true);
      } else if (captionModal.type === 'audio') {
        await updateAudioCaption(captionModal.id, trimmedCaption);
      }
    } catch (error) {
      console.error('Failed to save caption:', error);
    }

    setCaptionModal(null);
    setCaptionText('');
  };

  // Close context menu when clicking elsewhere
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      window.addEventListener('click', handleClick);
      return () => window.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  // Confirm and execute image deletion
  const confirmDeleteImage = async () => {
    if (!imageToDelete) return;

    if (imageToDelete.type === 'recording') {
      await window.electronAPI.media.deleteImage(imageToDelete.imageId);
      await preserveScrollPosition(refetch);
    } else if (imageToDelete.type === 'duration' && activeDurationId) {
      await deleteDurationImage(imageToDelete.imageId, activeDurationId);
    }

    setImageToDelete(null);
  };

  // Handle duration delete
  const handleDeleteDuration = (id: number) => {
    setDurationToDelete(id);
  };

  const confirmDeleteDuration = async () => {
    if (!durationToDelete) return;
    // If deleting the active duration, clear the loop first
    if (activeDurationId === durationToDelete) {
      audioPlayerRef.current?.clearLoopRegion();
      setActiveDurationId(null);
    }
    await deleteDuration(durationToDelete);
    setDurationToDelete(null);
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
  const activeDurationVideos = activeDurationId ? durationVideosCache[activeDurationId] ?? [] : [];
  const activeDurationAudios = activeDurationId ? durationAudiosCache[activeDurationId] ?? [] : [];
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

  // ESC key handler for recording video lightbox
  useEffect(() => {
    if (!selectedVideo) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedVideo(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedVideo]);

  // ESC key handler for duration video lightbox
  useEffect(() => {
    if (!selectedDurationVideoPath) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedDurationVideoPath(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDurationVideoPath]);

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
        durationVideosCache={durationVideosCache}
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
          <div className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
            {activeDurationImages.map((img, index) => (
              <div key={img.id} className="group">
                <div className="relative">
                  <div
                    className="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-dark-border cursor-pointer"
                    onClick={() => setSelectedDurationImageIndex(index)}
                    onContextMenu={(e) => handleContextMenu(e, 'durationImage', img)}
                  >
                    <img
                      src={window.electronAPI.paths.getFileUrl(img.thumbnail_path || img.file_path)}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <button
                    onClick={() => handleDeleteDurationImage(img.id)}
                    className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full
                               opacity-0 group-hover:opacity-100 transition-opacity
                               flex items-center justify-center text-sm"
                  >
                    ×
                  </button>
                </div>
                {/* Caption */}
                {img.caption && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 line-clamp-2 italic font-light leading-tight">
                    {img.caption}
                  </p>
                )}
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

      {/* Duration Videos - shown when a duration is active and has videos */}
      {activeDurationId && activeDurationVideos.length > 0 && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-blue-700 dark:text-blue-300">
              Videos ({activeDurationVideos.length})
            </h3>
            <button
              onClick={handleAddDurationVideo}
              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
            >
              📋 Paste
            </button>
          </div>
          <div className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
            {activeDurationVideos.map((video, index) => (
              <div key={video.id} className="group">
                <div className="relative">
                  {/* Number badge */}
                  <div className="absolute top-1 left-1 w-5 h-5 bg-black/70 text-white
                                  rounded-full flex items-center justify-center text-xs font-bold z-10">
                    {index + 1}
                  </div>
                  <div
                    className="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-dark-border cursor-pointer"
                    onClick={() => setSelectedDurationVideoPath(video.file_path)}
                    onContextMenu={(e) => handleContextMenu(e, 'durationVideo', video)}
                  >
                    {video.thumbnail_path ? (
                      <img
                        src={window.electronAPI.paths.getFileUrl(video.thumbnail_path)}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl">
                        🎬
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteDurationVideo(video.id)}
                    className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full
                               opacity-0 group-hover:opacity-100 transition-opacity
                               flex items-center justify-center text-sm"
                  >
                    ×
                  </button>
                </div>
                {/* Caption */}
                {video.caption && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 line-clamp-2 italic font-light leading-tight">
                    {video.caption}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Video prompt when duration is active but has no videos */}
      {activeDurationId && activeDurationVideos.length === 0 && (
        <div className="mb-4 p-3 bg-gray-50 dark:bg-dark-hover border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span>No videos for this section</span>
            <button
              onClick={handleAddDurationVideo}
              className="px-2 py-1 text-xs bg-gray-200 dark:bg-dark-border rounded hover:bg-gray-300 dark:hover:bg-dark-surface transition-colors"
            >
              📋 Paste Video
            </button>
          </div>
        </div>
      )}

      {/* Duration Audios - shown when a duration is active and has audios */}
      {activeDurationId && activeDurationAudios.length > 0 && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-blue-700 dark:text-blue-300">
              Audio Recordings ({activeDurationAudios.length})
            </h3>
            <button
              onClick={() => setIsRecordingDurationAudio(true)}
              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
            >
              🎙️ Record
            </button>
          </div>
          <div className="space-y-3">
            {activeDurationAudios.map((audio, index) => (
              <div
                key={audio.id}
                className="group relative"
                onContextMenu={(e) => handleContextMenu(e, 'durationAudio', audio)}
              >
                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 mt-2 bg-blue-500/30 border border-blue-400/50 text-blue-300 rounded-full flex items-center justify-center text-[10px] font-bold">
                    {index + 1}
                  </span>
                  <div className="flex-1">
                    <ThemedAudioPlayer
                      src={window.electronAPI.paths.getFileUrl(audio.file_path)}
                      theme="blue"
                    />
                    {audio.caption && (
                      <p className="text-xs text-blue-400 mt-1 italic font-light leading-tight">
                        {audio.caption}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteDurationAudio(audio.id)}
                    className="w-6 h-6 bg-red-500 text-white rounded-full
                               opacity-0 group-hover:opacity-100 transition-opacity
                               flex items-center justify-center text-sm mt-3"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Audio prompt when duration is active but has no audios */}
      {activeDurationId && activeDurationAudios.length === 0 && (
        <div className="mb-4 p-3 bg-gray-50 dark:bg-dark-hover border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span>No audio recordings for this section</span>
            <button
              onClick={() => setIsRecordingDurationAudio(true)}
              className="px-2 py-1 text-xs bg-gray-200 dark:bg-dark-border rounded hover:bg-gray-300 dark:hover:bg-dark-surface transition-colors"
            >
              🎙️ Record Audio
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
            <NotesEditor
              value={notes}
              onChange={setNotes}
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
              <div
                className="notes-content text-gray-700 dark:text-gray-300"
                dangerouslySetInnerHTML={{ __html: recording.notes_content }}
              />
            ) : (
              <p className="text-gray-400 dark:text-gray-500 italic">
                No notes added
              </p>
            )}
          </div>
        )}
      </div>

      {/* Images */}
      <div className="mb-6 p-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800/50 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-violet-700 dark:text-violet-300">
            Images ({images.length})
          </h2>
          <button
            onClick={handleAddImages}
            className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300"
          >
            📋 Paste
          </button>
        </div>
        {images.length > 0 ? (
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {images.map((img, index) => (
              <div key={img.id} className="group">
                <div className="relative">
                  {/* Number badge */}
                  <div className="absolute top-1 left-1 w-6 h-6 bg-black/70 text-white
                                  rounded-full flex items-center justify-center text-xs font-bold z-10">
                    {index + 1}
                  </div>
                  <div
                    className="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-dark-border cursor-pointer"
                    onClick={() => setSelectedImageIndex(index)}
                    onContextMenu={(e) => handleContextMenu(e, 'image', img)}
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
                {/* Caption */}
                {img.caption && (
                  <p className="text-xs text-violet-600 dark:text-violet-400 mt-1 line-clamp-2 italic font-light leading-tight">
                    {img.caption}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-violet-400 dark:text-violet-500 italic text-sm">No images attached</p>
        )}
      </div>

      {/* Videos */}
      <div className="mb-6 p-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800/50 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-violet-700 dark:text-violet-300">
            Videos ({videos.length})
          </h2>
          <button
            onClick={handleAddVideos}
            className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300"
          >
            📋 Paste
          </button>
        </div>
        {videos.length > 0 ? (
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {videos.map((video, index) => (
              <div key={video.id} className="group">
                <div className="relative">
                  {/* Number badge */}
                  <div className="absolute top-1 left-1 w-6 h-6 bg-black/70 text-white
                                  rounded-full flex items-center justify-center text-xs font-bold z-10">
                    {index + 1}
                  </div>
                  <div
                    className="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-dark-border cursor-pointer"
                    onClick={() => setSelectedVideo(video.file_path)}
                    onContextMenu={(e) => handleContextMenu(e, 'video', video)}
                  >
                    {video.thumbnail_path ? (
                      <img
                        src={window.electronAPI.paths.getFileUrl(video.thumbnail_path)}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl">
                        🎬
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteVideo(video.id)}
                    className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full
                               opacity-0 group-hover:opacity-100 transition-opacity
                               flex items-center justify-center text-sm"
                  >
                    ×
                  </button>
                </div>
                {/* Caption */}
                {video.caption && (
                  <p className="text-xs text-violet-600 dark:text-violet-400 mt-1 line-clamp-2 italic font-light leading-tight">
                    {video.caption}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-violet-400 dark:text-violet-500 italic text-sm">No videos attached</p>
        )}
      </div>

      {/* Recording Audios */}
      <div className="mb-6 p-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800/50 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-violet-700 dark:text-violet-300">
            Audio Recordings ({recordingAudios.length})
          </h2>
          <button
            onClick={() => setIsRecordingAudio(true)}
            className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300"
          >
            🎙️ Record
          </button>
        </div>
        {recordingAudios.length > 0 ? (
          <div className="space-y-3">
            {recordingAudios.map((audio, index) => (
              <div
                key={audio.id}
                className="group relative"
                onContextMenu={(e) => handleContextMenu(e, 'audio', audio)}
              >
                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 mt-2 bg-violet-500/30 border border-violet-400/50 text-violet-300 rounded-full flex items-center justify-center text-[10px] font-bold">
                    {index + 1}
                  </span>
                  <div className="flex-1">
                    <ThemedAudioPlayer
                      src={window.electronAPI.paths.getFileUrl(audio.file_path)}
                      theme="violet"
                    />
                    {audio.caption && (
                      <p className="text-xs text-violet-400 mt-1 italic font-light leading-tight">
                        {audio.caption}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteRecordingAudio(audio.id)}
                    className="w-6 h-6 bg-red-500 text-white rounded-full
                               opacity-0 group-hover:opacity-100 transition-opacity
                               flex items-center justify-center text-sm mt-3"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-violet-400 dark:text-violet-500 italic text-sm">No audio recordings attached</p>
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

      {/* Duration Video lightbox */}
      {selectedDurationVideoPath && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setSelectedDurationVideoPath(null)}
        >
          <button
            className="absolute top-4 right-4 text-white text-2xl z-10"
            onClick={() => setSelectedDurationVideoPath(null)}
          >
            ×
          </button>
          <video
            src={window.electronAPI.paths.getFileUrl(selectedDurationVideoPath)}
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

      {/* Video delete confirmation modal */}
      <Modal
        isOpen={videoToDelete !== null}
        onClose={() => setVideoToDelete(null)}
        title="Delete Video"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-700 dark:text-gray-300">
            Are you sure you want to delete this video?
          </p>
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setVideoToDelete(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={confirmDeleteVideo}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Duration delete confirmation modal */}
      <Modal
        isOpen={durationToDelete !== null}
        onClose={() => setDurationToDelete(null)}
        title="Delete Marked Section"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-700 dark:text-gray-300">
            Are you sure you want to delete this marked section?
          </p>
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setDurationToDelete(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={confirmDeleteDuration}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Duration Video delete confirmation modal */}
      <Modal
        isOpen={durationVideoToDelete !== null}
        onClose={() => setDurationVideoToDelete(null)}
        title="Delete Video"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-700 dark:text-gray-300">
            Are you sure you want to delete this video?
          </p>
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setDurationVideoToDelete(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={confirmDeleteDurationVideo}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Duration Audio delete confirmation modal */}
      <Modal
        isOpen={durationAudioToDelete !== null}
        onClose={() => setDurationAudioToDelete(null)}
        title="Delete Audio"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-700 dark:text-gray-300">
            Are you sure you want to delete this audio recording?
          </p>
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setDurationAudioToDelete(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={confirmDeleteDurationAudio}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Recording Audio delete confirmation modal */}
      <Modal
        isOpen={recordingAudioToDelete !== null}
        onClose={() => setRecordingAudioToDelete(null)}
        title="Delete Audio"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-700 dark:text-gray-300">
            Are you sure you want to delete this audio recording?
          </p>
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setRecordingAudioToDelete(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={confirmDeleteRecordingAudio}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-lg shadow-lg py-1 min-w-[140px]"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 160),
            top: Math.min(contextMenu.y, window.innerHeight - 100),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-hover flex items-center gap-2"
            onClick={() => openCaptionModal(contextMenu.type, contextMenu.item.id, contextMenu.item.caption)}
          >
            <span>✏️</span>
            {contextMenu.item.caption ? 'Edit Caption' : 'Add Caption'}
          </button>
          <button
            className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-dark-hover flex items-center gap-2"
            onClick={() => {
              if (contextMenu.type === 'image') {
                handleDeleteImage(contextMenu.item.id);
              } else if (contextMenu.type === 'video') {
                handleDeleteVideo(contextMenu.item.id);
              } else if (contextMenu.type === 'durationImage') {
                handleDeleteDurationImage(contextMenu.item.id);
              } else if (contextMenu.type === 'durationVideo') {
                handleDeleteDurationVideo(contextMenu.item.id);
              } else if (contextMenu.type === 'durationAudio') {
                handleDeleteDurationAudio(contextMenu.item.id);
              } else if (contextMenu.type === 'audio') {
                handleDeleteRecordingAudio(contextMenu.item.id);
              }
              setContextMenu(null);
            }}
          >
            <span>🗑️</span>
            Delete
          </button>
        </div>
      )}

      {/* Caption Edit Modal */}
      <Modal
        isOpen={captionModal !== null}
        onClose={() => {
          setCaptionModal(null);
          setCaptionText('');
        }}
        title={captionModal?.currentCaption ? 'Edit Caption' : 'Add Caption'}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <textarea
              value={captionText}
              onChange={(e) => setCaptionText(e.target.value.slice(0, 150))}
              placeholder="Add a short caption..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg
                         bg-white dark:bg-dark-surface text-gray-900 dark:text-gray-100
                         focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              rows={3}
              autoFocus
              maxLength={150}
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 text-right">
              {captionText.length}/150
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setCaptionModal(null);
                setCaptionText('');
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveCaption}>
              Save
            </Button>
          </div>
        </div>
      </Modal>

      {/* Duration Audio Record Modal */}
      <SimpleAudioRecordModal
        isOpen={isRecordingDurationAudio}
        onClose={() => setIsRecordingDurationAudio(false)}
        onSave={handleSaveDurationAudio}
        title="Record Audio for Section"
      />

      {/* Recording Audio Record Modal */}
      <SimpleAudioRecordModal
        isOpen={isRecordingAudio}
        onClose={() => setIsRecordingAudio(false)}
        onSave={handleSaveRecordingAudio}
        title="Record Audio"
      />
      </div>
    </div>
  );
}
