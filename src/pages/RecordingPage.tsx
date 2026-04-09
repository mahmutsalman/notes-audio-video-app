import { useState, useEffect, useRef } from 'react';
import { useIsActiveTab, useTabInstance } from '../context/TabsContext';
import { useStudyTracker } from '../context/StudyTrackerContext';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTabTitle } from '../hooks/useTabTitle';
import { useRecording, useRecordings } from '../hooks/useRecordings';
import { useTopic } from '../hooks/useTopics';
import { useDurations } from '../hooks/useDurations';
import { useAudios } from '../hooks/useAudios';
import { useCodeSnippets } from '../hooks/useCodeSnippets';
import AudioPlayer, { AudioPlayerHandle } from '../components/audio/AudioPlayer';
import SimpleAudioRecordModal from '../components/audio/SimpleAudioRecordModal';
import ThemedAudioPlayer from '../components/audio/ThemedAudioPlayer';
import { useAudioRecording, AUDIO_SAVED_EVENT } from '../context/AudioRecordingContext';
import { useImageAudioPlayer } from '../context/ImageAudioPlayerContext';
import { useDurationAudioPlayer } from '../context/DurationAudioPlayerContext';
import { SYNC_COMPLETED_EVENT } from '../utils/events';
import DurationList from '../components/recordings/DurationList';
import DurationNotesSidebar from '../components/recordings/DurationNotesSidebar';
import MarkList from '../components/recordings/MarkList';
import { isBookNote, isReaderNote, isMarkBasedNote, createMarkTimes, getNextMarkIndex } from '../utils/marks';
import PdfViewer, { PdfViewerHandle } from '../components/pdf/PdfViewer';
import BookReaderView, { BookReaderViewHandle } from '../components/reader/BookReaderView';
import { emitRecordingUpdated } from '../utils/events';
import Modal from '../components/common/Modal';
import Button from '../components/common/Button';
import NotesEditor from '../components/common/NotesEditor';
import CodeSnippetCard from '../components/code/CodeSnippetCard';
import CodeSnippetModal from '../components/code/CodeSnippetModal';
import ImageLightbox from '../components/common/ImageLightbox';
import SortableImageGrid from '../components/common/SortableImageGrid';
import ScreenRecordingModal from '../components/screen/ScreenRecordingModal';
import { formatDuration, formatDate, formatRelativeTime, formatFileSize } from '../utils/formatters';
import { DURATION_COLORS } from '../utils/durationColors';
import { getNextGroupColorWithNull, DURATION_GROUP_COLORS } from '../utils/durationGroupColors';
import { IMAGE_COLOR_KEYS, IMAGE_COLORS } from '../utils/imageColors';
import type { Duration, DurationColor, DurationGroupColor, Image, Video, DurationImage, DurationVideo, DurationAudio, DurationImageAudio, ImageAudio, AnyImageAudio, Audio, CodeSnippet, DurationCodeSnippet, CaptureArea, AudioMarker, AudioMarkerType, SearchNavState } from '../types';
import SearchNavBanner from '../components/search/SearchNavBanner';
import { TagModal } from '../components/common/TagModal';
import type { MediaTagType } from '../types';
import RecordingCanvas from '../components/canvas/RecordingCanvas';
import DurationCanvas from '../components/canvas/DurationCanvas';
import { PlannerSection } from '../components/plans/PlannerSection';
import { useRecordingPlans, useDurationPlans } from '../hooks/usePlans';

export default function RecordingPage() {
  const { recordingId } = useParams<{ recordingId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const searchNav = (location.state as { searchNav?: SearchNavState } | null)?.searchNav ?? null;
  const id = recordingId ? parseInt(recordingId, 10) : null;

  const isActiveTab = useIsActiveTab();
  const { recording, loading, refetch, setRecording } = useRecording(id);
  const { topic } = useTopic(recording?.topic_id ?? null);
  useTabTitle(recording?.name ?? 'Recording');
  const { recordings: topicRecordings } = useRecordings(recording?.topic_id ?? null);
  const {
    durations,
    createDuration,
    deleteDuration,
    updateDuration,
    reorderDurations,
    durationImagesCache,
    getDurationImages,
    addDurationImageFromClipboard,
    replaceDurationImageFromClipboard,
    addDurationImageFromScreenshot,
    reorderDurationImages,
    deleteDurationImage,
    updateDurationImageCaption,
    durationVideosCache,
    getDurationVideos,
    addDurationVideoFromClipboard,
    deleteDurationVideo,
    updateDurationVideoCaption,
    durationAudiosCache,
    getDurationAudios,
    addDurationAudioFromBuffer,
    deleteDurationAudio,
    updateDurationAudioCaption,
    durationImageAudiosCache,
    getDurationImageAudios,
    refreshDurationImageAudios,
    deleteDurationImageAudio,
    updateDurationImageAudioCaption,
    getDurationCodeSnippets,
    addDurationCodeSnippet,
    updateDurationCodeSnippet,
    deleteDurationCodeSnippet,
  } = useDurations(id);

  const {
    audios: recordingAudios,
    addAudioFromBuffer,
    deleteAudio: deleteRecordingAudio,
    updateCaption: updateAudioCaption,
  } = useAudios(id);

  const {
    codeSnippets,
    addCodeSnippet,
    updateCodeSnippet,
    deleteCodeSnippet,
  } = useCodeSnippets(id);

  const recordingPlans = useRecordingPlans(id);

  // Calculate adjacent recording IDs for navigation
  const currentIndex = topicRecordings.findIndex(r => r.id === id);
  const prevRecordingId = currentIndex > 0 ? topicRecordings[currentIndex - 1].id : null;
  const nextRecordingId = currentIndex >= 0 && currentIndex < topicRecordings.length - 1
    ? topicRecordings[currentIndex + 1].id
    : null;

  const [canvasMode, setCanvasMode] = useState(false);
  const [planMode, setPlanMode] = useState(false);
  const [durationCanvasMode, setDurationCanvasMode] = useState(false);
  const [durationPlanMode, setDurationPlanMode] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingMainNotes, setIsEditingMainNotes] = useState(false);
  const [mainNotes, setMainNotes] = useState('');
  const [isSavingMainNotes, setIsSavingMainNotes] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [recordingImageAudiosCache, setRecordingImageAudiosCache] = useState<Record<number, ImageAudio[]>>({});
  const [durationImageTagsCache, setDurationImageTagsCache] = useState<Record<number, string[]>>({});
  const [recordingImageColorsCache, setRecordingImageColorsCache] = useState<Record<number, string[]>>({});
  const [durationImageColorsCache, setDurationImageColorsCache] = useState<Record<number, string[]>>({});
  const [recordingImageChildCountMap, setRecordingImageChildCountMap] = useState<Record<number, number>>({});
  const [durationImageChildCountMap, setDurationImageChildCountMap] = useState<Record<number, number>>({});
  const [recordingAudioColorsCache, setRecordingAudioColorsCache] = useState<Record<number, string[]>>({});
  const [durationAudioColorsCache, setDurationAudioColorsCache] = useState<Record<number, string[]>>({});
  const [recordingImageAudioColorsCache, setRecordingImageAudioColorsCache] = useState<Record<number, string[]>>({});
  const [durationImageAudioColorsCache, setDurationImageAudioColorsCache] = useState<Record<number, string[]>>({});
  const [recordingAudioTagCountMap, setRecordingAudioTagCountMap] = useState<Record<number, number>>({});
  const [durationAudioTagCountMap, setDurationAudioTagCountMap] = useState<Record<number, number>>({});
  const [videoColorsCache, setVideoColorsCache] = useState<Record<number, string[]>>({});
  const [durationVideoColorsCache, setDurationVideoColorsCache] = useState<Record<number, string[]>>({});
  const [videoTagCountMap, setVideoTagCountMap] = useState<Record<number, number>>({});
  const [durationVideoTagCountMap, setDurationVideoTagCountMap] = useState<Record<number, number>>({});
  const [recordingImageAudioTagCountMap, setRecordingImageAudioTagCountMap] = useState<Record<number, number>>({});
  const [durationImageAudioTagCountMap, setDurationImageAudioTagCountMap] = useState<Record<number, number>>({});
  const [contextMenuShowColors, setContextMenuShowColors] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [convertingVideoIds, setConvertingVideoIds] = useState<Set<number>>(new Set());
  const [fileSizes, setFileSizes] = useState<Record<string, number>>({});
  const [isContentPressed, setIsContentPressed] = useState(false);
  const [activeDurationId, setActiveDurationId] = useState<number | null>(null);
  const durationPlans = useDurationPlans(activeDurationId);
  const [selectedDurationImageIndex, setSelectedDurationImageIndex] = useState<number | null>(null);
  const [mediaLoaded, setMediaLoaded] = useState(false);
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
  const audioRecording = useAudioRecording();
  const imageAudioPlayer = useImageAudioPlayer();
  const durationAudioPlayer = useDurationAudioPlayer();
  const [durationAudioMarkersCache, setDurationAudioMarkersCache] = useState<Record<number, AudioMarker[]>>({});
  // Local state to track media color changes for rendering (priority colors - left/right bars)
  const [mediaColorOverrides] = useState<Record<string, DurationColor>>({});
  // Local state to track media group color changes for instant visual feedback (group colors - top bar)
  const [mediaGroupColorOverrides, setMediaGroupColorOverrides] = useState<Record<string, DurationGroupColor>>({});
  const [durationAudioToDelete, setDurationAudioToDelete] = useState<{
    audioId: number;
    durationId: number;
  } | null>(null);
  const [recordingAudioToDelete, setRecordingAudioToDelete] = useState<number | null>(null);
  const [showCodeSnippetModal, setShowCodeSnippetModal] = useState(false);
  const [editingCodeSnippet, setEditingCodeSnippet] = useState<CodeSnippet | null>(null);
  const [codeSnippetToDelete, setCodeSnippetToDelete] = useState<number | null>(null);
  const [showDurationCodeSnippetModal, setShowDurationCodeSnippetModal] = useState(false);
  const [editingDurationCodeSnippet, setEditingDurationCodeSnippet] = useState<{snippet: DurationCodeSnippet | null, durationId: number} | null>(null);
  const [durationCodeSnippetToDelete, setDurationCodeSnippetToDelete] = useState<{snippetId: number, durationId: number} | null>(null);
  const [activeDurationCodeSnippets, setActiveDurationCodeSnippets] = useState<DurationCodeSnippet[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    type: 'image' | 'video' | 'durationImage' | 'durationVideo' | 'durationAudio' | 'audio';
    item: Image | Video | DurationImage | DurationVideo | DurationAudio | Audio;
    x: number;
    y: number;
  } | null>(null);
  const [tagModal, setTagModal] = useState<{ mediaType: MediaTagType; mediaId: number; title: string } | null>(null);
  const [captionModal, setCaptionModal] = useState<{
    type: 'image' | 'video' | 'durationImage' | 'durationVideo' | 'durationAudio' | 'audio';
    id: number;
    currentCaption: string;
  } | null>(null);
  const [captionText, setCaptionText] = useState('');
  const [isScreenRecording, setIsScreenRecording] = useState(false);
  const isScreenRecordingRef = useRef(isScreenRecording);
  const [autoTriggerRegionSelection, setAutoTriggerRegionSelection] = useState(false);
  const [pendingRegion, setPendingRegion] = useState<CaptureArea | null>(null);
  const [isAddingMark, setIsAddingMark] = useState(false);

  // Search nav activation refs
  const pendingDurationActivationRef = useRef<number | null>(null);
  const pendingScrollTargetRef = useRef<string | null>(null);
  const searchNavFiredRef = useRef(false);

  // Keep ref in sync with state
  useEffect(() => {
    isScreenRecordingRef.current = isScreenRecording;
  }, [isScreenRecording]);
  const audioPlayerRef = useRef<AudioPlayerHandle>(null);
  const videoPlayerRef = useRef<HTMLVideoElement>(null);
  const pdfViewerRef = useRef<PdfViewerHandle>(null);
  const bookReaderRef = useRef<BookReaderViewHandle>(null);
  const videoLoopListenerRef = useRef<(() => void) | null>(null);

  // ── Study Tracker integration ─────────────────────────────────────────────
  const { tabId } = useTabInstance();
  const { reportTabContext, consumeNextSource } = useStudyTracker();

  function extractFirstLine(html: string | null): string | null {
    if (!html) return null;
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const text = tmp.textContent ?? '';
    const first = text.split('\n').find(l => l.trim()) ?? '';
    return first.trim().slice(0, 100) || null;
  }

  // Derive the active mark's note so the effect below only re-runs when it actually changes
  const activeDurationNote = activeDurationId !== null
    ? (durations.find(d => d.id === activeDurationId)?.note ?? null)
    : null;

  // Report context whenever recording, topic, or active mark changes
  useEffect(() => {
    if (!recording || !topic) {
      reportTabContext(tabId, null);
      return;
    }
    reportTabContext(tabId, {
      topicId: topic.id,
      topicName: topic.name,
      recordingId: recording.id,
      recordingName: recording.name,
      durationId: activeDurationId,
      durationCaption: extractFirstLine(activeDurationNote),
      source: consumeNextSource(),
    });
  }, [recording?.id, topic?.id, activeDurationId, activeDurationNote]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear context on unmount
  useEffect(() => {
    return () => { reportTabContext(tabId, null); };
  }, [tabId]); // eslint-disable-line react-hooks/exhaustive-deps
  // ─────────────────────────────────────────────────────────────────────────

  // Helper to preserve scroll position across refetch
  const preserveScrollPosition = async (operation: () => Promise<void>) => {
    const scrollY = window.scrollY;
    await operation();
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollY);
    });
  };

  // Reset duration canvas/plan mode when active duration changes
  useEffect(() => {
    setDurationCanvasMode(false);
    setDurationPlanMode(false);
  }, [activeDurationId]);

  // Reset loop state and media loaded state when changing recordings
  useEffect(() => {
    setActiveDurationId(null);
    setMediaLoaded(false);
    setIsSeekingDuration(false);

    // Reset search nav activation state
    searchNavFiredRef.current = false;
    pendingDurationActivationRef.current = null;
    pendingScrollTargetRef.current = null;

    // Clean up video loop listener when changing recordings
    if (videoPlayerRef.current && videoLoopListenerRef.current) {
      videoPlayerRef.current.removeEventListener('timeupdate', videoLoopListenerRef.current);
      videoLoopListenerRef.current = null;
    }
  }, [id]);

  // Set up pending activation targets when search nav state arrives
  useEffect(() => {
    if (!searchNav) return;
    const result = searchNav.results[searchNav.currentIndex];
    if (!result) return;

    searchNavFiredRef.current = false;
    const { content_type, source_id, duration_id } = result;

    if (content_type === 'duration') {
      pendingDurationActivationRef.current = source_id;
      pendingScrollTargetRef.current = null;
    } else if (
      duration_id !== null &&
      ['duration_image', 'duration_video', 'duration_audio', 'duration_code_snippet', 'duration_image_audio'].includes(content_type)
    ) {
      pendingDurationActivationRef.current = duration_id;
      pendingScrollTargetRef.current = null;
    } else if (content_type === 'audio') {
      pendingDurationActivationRef.current = null;
      pendingScrollTargetRef.current = `rec-audio-${source_id}`;
    } else if (content_type === 'code_snippet') {
      pendingDurationActivationRef.current = null;
      pendingScrollTargetRef.current = `rec-code-${source_id}`;
    } else if (content_type === 'image') {
      pendingDurationActivationRef.current = null;
      pendingScrollTargetRef.current = `img-cell-${source_id}`;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchNav]);

  // Fire pending search nav activation when conditions are ready
  useEffect(() => {
    if (searchNavFiredRef.current) return;

    const targetDurationId = pendingDurationActivationRef.current;
    const scrollTarget = pendingScrollTargetRef.current;

    if (targetDurationId !== null) {
      if (durations.length === 0) return;
      const targetDuration = durations.find(d => d.id === targetDurationId);
      if (!targetDuration) return;

      const hasMedia = !!(recording?.audio_path || recording?.video_path);
      if (hasMedia && !mediaLoaded) return;

      searchNavFiredRef.current = true;
      handleDurationClick(targetDuration);
      setTimeout(() => {
        document.getElementById(`duration-mark-${targetDurationId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 150);
    } else if (scrollTarget !== null) {
      if (!recording) return;
      searchNavFiredRef.current = true;
      setTimeout(() => {
        document.getElementById(scrollTarget)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durations, mediaLoaded, recording]);

  // Cleanup video loop listener on unmount
  useEffect(() => {
    return () => {
      // Cleanup video loop listener on unmount
      if (videoPlayerRef.current && videoLoopListenerRef.current) {
        videoPlayerRef.current.removeEventListener('timeupdate', videoLoopListenerRef.current);
      }
    };
  }, []);

  // Preload screen sources for instant Cmd+D recording
  // This eliminates the 200-500ms initialization delay when using Cmd+D
  useEffect(() => {
    // Start loading sources in background when page mounts
    // This makes Cmd+D recording instant by pre-warming Electron's cache
    window.electronAPI.screenRecording.getSources()
      .then(() => {
        console.log('[RecordingPage] Screen sources preloaded and cached');
      })
      .catch(err => {
        console.warn('[RecordingPage] Failed to preload screen sources:', err);
        // Non-critical - sources will load when modal opens if needed
      });
  }, []); // Empty deps - only run once on mount

  // Global listener for region selection (always active, handles Cmd+D path)
  // This ensures recording works even when modal isn't open
  // CRITICAL: Empty dependency array prevents race condition where listener cleanup
  // runs while still processing event (when isScreenRecording changes)
  useEffect(() => {
    console.log('[RecordingPage] Setting up global region:selected listener');
    const cleanup = window.electronAPI.region.onRegionSelected((region) => {
      console.log('[RecordingPage] Global region:selected event received');
      console.log('[RecordingPage] region:', region);

      if (region && id) {
        console.log('[RecordingPage] Storing region from Cmd+D');
        // Always store region data - auto-start logic in modal handles duplicates
        setPendingRegion(region);

        // Only open modal if not already open (use ref to avoid stale closure)
        if (!isScreenRecordingRef.current) {
          console.log('[RecordingPage] Opening modal');
          setIsScreenRecording(true);
        } else {
          console.log('[RecordingPage] Modal already open, skipping');
        }
      }
    });

    return () => {
      console.log('[RecordingPage] Cleaning up region:selected listener');
      cleanup();
    };
  }, []); // Empty deps - listener active for component lifetime, no race condition

  // Load duration code snippets when active duration changes
  useEffect(() => {
    if (activeDurationId !== null) {
      getDurationCodeSnippets(activeDurationId).then(snippets => {
        setActiveDurationCodeSnippets(snippets);
      });
    } else {
      setActiveDurationCodeSnippets([]);
    }
  }, [activeDurationId, getDurationCodeSnippets]);

  // Fetch duration media when active duration changes (for written notes)
  // This ensures images/videos/audios are loaded from DB after navigation clears cache
  useEffect(() => {
    if (!activeDurationId || !recording || !isMarkBasedNote(recording)) return;

    // Fetch all media types for the active duration
    Promise.all([
      getDurationImages(activeDurationId),
      getDurationVideos(activeDurationId),
      getDurationAudios(activeDurationId),
    ]).then(([images, videos, audios]) => {
      console.log(`[RecordingPage] Written note duration ${activeDurationId} media loaded - Images: ${images.length}, Videos: ${videos.length}, Audios: ${audios.length}`);
    });
  }, [activeDurationId, recording, getDurationImages, getDurationVideos, getDurationAudios]);

  // Load image audios whenever the active duration's images change
  useEffect(() => {
    const images = activeDurationId ? durationImagesCache[activeDurationId] ?? [] : [];
    if (images.length === 0) return;
    for (const img of images) {
      getDurationImageAudios(img.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDurationId, durationImagesCache]);

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
      emitRecordingUpdated(id);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditMainNotes = () => {
    setMainNotes(recording?.main_notes_content ?? '');
    setIsEditingMainNotes(true);
  };

  const handleSaveMainNotes = async () => {
    if (!id) return;
    setIsSavingMainNotes(true);
    try {
      await window.electronAPI.recordings.update(id, { main_notes_content: mainNotes || null });
      await preserveScrollPosition(refetch);
      emitRecordingUpdated(id);
      setIsEditingMainNotes(false);
    } finally {
      setIsSavingMainNotes(false);
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

  // Handler for adding marks to written notes
  const handleAddMark = async () => {
    if (!id || isAddingMark) return;
    setIsAddingMark(true);
    try {
      const nextIndex = getNextMarkIndex(durations);
      const { start_time, end_time } = createMarkTimes(nextIndex);
      const pageNumber = isBookNote(recording) && pdfViewerRef.current
        ? pdfViewerRef.current.currentPage
        : isReaderNote(recording) && bookReaderRef.current
        ? bookReaderRef.current.currentOriginalPage
        : undefined;
      const newDuration = await createDuration({
        recording_id: id,
        start_time,
        end_time,
        note: null,
        page_number: pageNumber ?? null,
      });
      // Select the newly created mark
      setActiveDurationId(newDuration.id);
    } catch (error) {
      console.error('Failed to add mark:', error);
    } finally {
      setIsAddingMark(false);
    }
  };

  const handleAddImages = async () => {
    if (!id) return;
    try {
      const result = await window.electronAPI.clipboard.readImage();

      if (result.success && result.buffer) {
        const newImage = await window.electronAPI.media.addImageFromClipboard(id, result.buffer, result.extension || 'png');
        setRecording(prev => prev ? { ...prev, images: [...(prev.images || []), newImage] } : prev);
      } else {
        alert('No image found in clipboard. Copy an image first, then click Paste.');
      }
    } catch (error) {
      console.error('Failed to read clipboard:', error);
      alert('Could not read clipboard. Make sure you have copied an image.');
    }
  };

  const handleReplaceImageWithClipboard = async () => {
    if (selectedImageIndex === null || !id) return;
    const image = images[selectedImageIndex];
    if (!image?.id) return;
    try {
      const result = await window.electronAPI.clipboard.readImage();
      if (!result.success || !result.buffer) {
        alert('No image found in clipboard. Copy an image first.');
        return;
      }
      const updated = await window.electronAPI.media.replaceImageFromClipboard(
        image.id, Number(id), result.buffer, result.extension || 'png'
      );
      setRecording(prev => prev ? {
        ...prev,
        images: (prev.images || []).map(img => img.id === updated.id ? updated : img),
      } : prev);
    } catch (error) {
      console.error('Failed to replace image:', error);
      alert('Could not replace image from clipboard.');
    }
  };

  const handleReorderImages = async (orderedIds: number[]) => {
    if (!id) return;

    // Optimistic update — reorder locally for instant feedback
    setRecording(prev => {
      if (!prev?.images) return prev;
      const imageMap = new Map(prev.images.map(img => [img.id, img]));
      const reordered = orderedIds
        .map(imgId => imageMap.get(imgId))
        .filter((img): img is Image => img !== undefined);
      return { ...prev, images: reordered };
    });

    // Persist to database
    const persisted = await window.electronAPI.media.reorderImages(id, orderedIds);
    setRecording(prev => prev ? { ...prev, images: persisted } : prev);
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

  const handleConvertMkvToMp4 = async (videoId: number, videoType: 'video' | 'durationVideo', filePath: string, crf?: number) => {
    setConvertingVideoIds(prev => new Set(prev).add(videoId));
    try {
      const result = await window.electronAPI.video.remuxToMp4(videoId, videoType, filePath, crf);
      if (result.success) {
        await refetch();
      } else {
        console.error('[RecordingPage] MKV convert failed:', result.error);
        alert(`Convert failed: ${result.error}`);
      }
    } finally {
      setConvertingVideoIds(prev => { const s = new Set(prev); s.delete(videoId); return s; });
    }
  };

  const confirmDeleteVideo = async () => {
    if (!videoToDelete) return;
    await window.electronAPI.media.deleteVideo(videoToDelete);
    await preserveScrollPosition(refetch);
    setVideoToDelete(null);
  };

  // Handle duration click for loop playback
  const handleDurationClick = async (duration: Duration) => {
    const isVideoRecording = !!recording?.video_path;
    const isAudioRecording = !!recording?.audio_path;

    // Check media player availability
    if (isAudioRecording && !audioPlayerRef.current?.isLoaded) {
      console.log('[RecordingPage] Audio not loaded yet, ignoring duration click');
      return;
    }

    if (isVideoRecording && !videoPlayerRef.current) {
      console.log('[RecordingPage] Video player not available, ignoring duration click');
      return;
    }

    // Block rapid clicks - wait for playback to start before allowing another click
    if (isSeekingDuration) {
      console.log('[RecordingPage] Already seeking to a duration, ignoring click');
      return;
    }

    if (activeDurationId === duration.id) {
      // Already looping this one - deactivate
      console.log('[RecordingPage] Deactivating current duration');
      setActiveDurationId(null);
      setIsSeekingDuration(false);

      if (isAudioRecording && audioPlayerRef.current) {
        audioPlayerRef.current.clearLoopRegion();
      }

      if (isVideoRecording && videoPlayerRef.current && videoLoopListenerRef.current) {
        videoPlayerRef.current.removeEventListener('timeupdate', videoLoopListenerRef.current);
        videoLoopListenerRef.current = null;
      }
    } else {
      // Activate new duration
      console.log('[RecordingPage] Activating duration:', duration);
      setActiveDurationId(duration.id);
      setIsSeekingDuration(true);

      // Handle audio recording
      if (isAudioRecording && audioPlayerRef.current) {
        audioPlayerRef.current.setLoopRegion(duration.start_time, duration.end_time);
        console.log(`[RecordingPage] Activated duration ${duration.id}, fetching media...`);
      }

      // Handle video recording
      if (isVideoRecording && videoPlayerRef.current) {
        console.log('[RecordingPage] Seeking video to:', duration.start_time);

        // Clean up previous loop listener if exists
        if (videoLoopListenerRef.current) {
          videoPlayerRef.current.removeEventListener('timeupdate', videoLoopListenerRef.current);
        }

        // Seek to start time
        videoPlayerRef.current.currentTime = duration.start_time;

        // Set up looping between start and end
        const loopHandler = () => {
          if (videoPlayerRef.current) {
            if (videoPlayerRef.current.currentTime >= duration.end_time) {
              console.log('[RecordingPage] Video loop boundary reached at', videoPlayerRef.current.currentTime,
                          'seeking back to', duration.start_time);
              videoPlayerRef.current.currentTime = duration.start_time;
            }
          }
        };

        videoLoopListenerRef.current = loopHandler;
        videoPlayerRef.current.addEventListener('timeupdate', loopHandler);

        await videoPlayerRef.current.play();
      }

      // Fetch images, videos, and audios for this duration if not cached
      const [images, videos, audios] = await Promise.all([
        getDurationImages(duration.id),
        getDurationVideos(duration.id),
        getDurationAudios(duration.id),
      ]);
      console.log(`[RecordingPage] Duration ${duration.id} media fetched - Images: ${images.length}, Videos: ${videos.length}, Audios: ${audios.length}`);

      setIsSeekingDuration(false);
    }
  };

  // Sidebar state and handlers
  const durationsWithNotes = durations.filter(d => d.note && d.note.trim() !== '');
  const hasSidebar = durationsWithNotes.length > 0;

  const handleSidebarDurationClick = (durationId: number) => {
    const duration = durations.find(d => d.id === durationId);
    if (duration) {
      handleDurationClick(duration);
      if (isBookNote(recording) && duration.page_number && pdfViewerRef.current) {
        pdfViewerRef.current.goToPage(duration.page_number);
      } else if (isReaderNote(recording) && duration.page_number && bookReaderRef.current) {
        bookReaderRef.current.goToOriginalPage(duration.page_number);
      }
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

  // Handle PDF screenshot capture
  const handlePdfScreenshot = async (data: { imageData: ArrayBuffer; pageNumber: number; rect: { x: number; y: number; w: number; h: number } }) => {
    if (!recording) return;
    let targetId = activeDurationId;
    if (!targetId && durations.length > 0) {
      targetId = durations[0].id;
      setActiveDurationId(targetId);
    }
    if (!targetId) {
      // Create a new mark with current page
      const nextIndex = getNextMarkIndex(durations);
      const { start_time, end_time } = createMarkTimes(nextIndex);
      const newDuration = await createDuration({
        recording_id: recording.id,
        start_time,
        end_time,
        note: null,
        page_number: data.pageNumber,
      });
      targetId = newDuration.id;
      setActiveDurationId(targetId);
    }
    await addDurationImageFromScreenshot(targetId, data.imageData, data.pageNumber, data.rect);
  };

  // Handle reordering duration images
  const handleReorderDurationImages = async (orderedIds: number[]) => {
    if (!activeDurationId) return;
    await reorderDurationImages(activeDurationId, orderedIds);
  };

  const handleReplaceDurationImageWithClipboard = async () => {
    if (selectedDurationImageIndex === null || activeDurationId === null) return;
    const image = activeDurationImages[selectedDurationImageIndex];
    if (!image?.id) return;
    const updated = await replaceDurationImageFromClipboard(image.id, activeDurationId);
    if (!updated) {
      alert('No image found in clipboard. Copy an image first.');
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

  // Listen for audio saved events from the global recording context
  useEffect(() => {
    const handler = (e: Event) => {
      const { target: savedTarget } = (e as CustomEvent).detail;
      if (!savedTarget || !id) return;
      if (savedTarget.type === 'duration') {
        getDurationAudios(savedTarget.durationId, true);
      } else if (savedTarget.type === 'duration_image') {
        refreshDurationImageAudios(savedTarget.durationImageId);
      } else if (savedTarget.type === 'recording' && savedTarget.recordingId === id) {
        refetchRecordingAudios();
      }
    };
    window.addEventListener(AUDIO_SAVED_EVENT, handler);
    return () => window.removeEventListener(AUDIO_SAVED_EVENT, handler);
  }, [id, getDurationAudios, refreshDurationImageAudios, refetchRecordingAudios]);

  // After cloud sync, force-refresh media for the active mark so new content appears in place
  useEffect(() => {
    const handleSyncCompleted = () => {
      if (!activeDurationId) return;
      getDurationImages(activeDurationId, true).then(images => {
        // Force-refresh image audios so new uploads from mobile appear
        for (const img of images) {
          refreshDurationImageAudios(img.id);
        }
      });
      getDurationVideos(activeDurationId, true);
      getDurationAudios(activeDurationId, true).then(audios => {
        // Explicitly refresh markers for all audios after sync
        Promise.all(
          audios.map(audio =>
            window.electronAPI.audioMarkers.getByAudio(audio.id, 'duration').then(markers => ({ id: audio.id, markers }))
          )
        ).then(results => {
          setDurationAudioMarkersCache(prev => {
            const next = { ...prev };
            for (const { id: audioId, markers } of results) {
              next[audioId] = markers;
            }
            return next;
          });
        });
      });
      getDurationVideos(activeDurationId, true);
      getDurationAudios(activeDurationId, true);
      getDurationCodeSnippets(activeDurationId).then(snippets => {
        setActiveDurationCodeSnippets(snippets);
      });
    };
    window.addEventListener(SYNC_COMPLETED_EVENT, handleSyncCompleted);
    return () => window.removeEventListener(SYNC_COMPLETED_EVENT, handleSyncCompleted);
  }, [activeDurationId, getDurationImages, getDurationVideos, getDurationAudios, getDurationCodeSnippets, refreshDurationImageAudios]);

  // Load markers for duration audios whenever the active duration's audios change
  useEffect(() => {
    const audios = activeDurationId ? durationAudiosCache[activeDurationId] ?? [] : [];
    if (audios.length === 0) return;
    Promise.all(
      audios.map(audio =>
        window.electronAPI.audioMarkers.getByAudio(audio.id, 'duration').then(markers => ({ id: audio.id, markers }))
      )
    ).then(results => {
      setDurationAudioMarkersCache(prev => {
        const next = { ...prev };
        for (const { id: audioId, markers } of results) {
          next[audioId] = markers;
        }
        return next;
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDurationId, durationAudiosCache]);

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

  // Handle saving screen recording
  // TODO: Remove this - screen recordings are now standalone items created from TopicDetailPage
  const handleSaveScreenRecording = async (
    _videoBlob: Blob | null,
    _marks: any[],
    _durationMs?: number,
    _filePath?: string,
    _audioBlob?: Blob | null,
    _audioConfig?: { bitrate: '32k' | '64k' | '128k'; channels: 1 | 2 },
    _audioOffsetMs?: number
  ) => {
    if (!id) return;

    try {
      // OLD APPROACH - TO BE REMOVED
      // Screen recordings are now standalone items, not attachments
      console.warn('Screen recording functionality moved to standalone recordings');

      // Temporarily disabled - will be removed in Phase 2
      /*
      // Save the video file
      const arrayBuffer = await videoBlob.arrayBuffer();
      const settings = await window.electronAPI.settings.getAll();

      await window.electronAPI.screenRecording.save(
        id,
        arrayBuffer,
        settings['screen_recording_resolution'] || '1080p',
        parseInt(settings['screen_recording_fps'] || '30')
      );

      // Save duration marks
      for (const mark of marks) {
        await window.electronAPI.durations.create({
          recording_id: id,
          start_time: mark.start,
          end_time: mark.end,
          note: mark.note ?? null,
        });
      }

      await preserveScrollPosition(refetch);
      setIsScreenRecording(false);
      */
    } catch (error) {
      console.error('Failed to save screen recording:', error);
      alert('Failed to save screen recording. Please try again.');
    }
  };

  // ============ Code Snippet Handlers ============
  // Recording-level code snippet handlers
  const handleAddCodeSnippet = () => {
    setEditingCodeSnippet(null);
    setShowCodeSnippetModal(true);
  };

  const handleEditCodeSnippet = (snippet: CodeSnippet) => {
    setEditingCodeSnippet(snippet);
    setShowCodeSnippetModal(true);
  };

  const handleSaveCodeSnippet = async (data: { title: string | null; language: string; code: string; caption: string | null }) => {
    if (editingCodeSnippet) {
      await updateCodeSnippet(editingCodeSnippet.id, data);
    } else {
      await addCodeSnippet(data);
    }
    setShowCodeSnippetModal(false);
    setEditingCodeSnippet(null);
  };

  const handleDeleteCodeSnippet = (snippetId: number) => {
    setCodeSnippetToDelete(snippetId);
  };

  const confirmDeleteCodeSnippet = async () => {
    if (!codeSnippetToDelete) return;
    await deleteCodeSnippet(codeSnippetToDelete);
    setCodeSnippetToDelete(null);
  };

  // Duration-level code snippet handlers
  const handleAddDurationCodeSnippet = (durationId: number) => {
    setEditingDurationCodeSnippet({ snippet: null, durationId });
    setShowDurationCodeSnippetModal(true);
  };

  const handleEditDurationCodeSnippet = (snippet: DurationCodeSnippet, durationId: number) => {
    setEditingDurationCodeSnippet({ snippet, durationId });
    setShowDurationCodeSnippetModal(true);
  };

  const handleSaveDurationCodeSnippet = async (data: { title: string | null; language: string; code: string; caption: string | null }) => {
    if (!editingDurationCodeSnippet) return;

    if (editingDurationCodeSnippet.snippet) {
      const updatedSnippet = await updateDurationCodeSnippet(
        editingDurationCodeSnippet.snippet.id,
        editingDurationCodeSnippet.durationId,
        data
      );
      setActiveDurationCodeSnippets(prev => prev.map(s => s.id === updatedSnippet.id ? updatedSnippet : s));
    } else {
      const newSnippet = await addDurationCodeSnippet(editingDurationCodeSnippet.durationId, data);
      setActiveDurationCodeSnippets(prev => [...prev, newSnippet]);
    }

    setShowDurationCodeSnippetModal(false);
    setEditingDurationCodeSnippet(null);
  };

  const handleDeleteDurationCodeSnippet = (snippetId: number, durationId: number) => {
    setDurationCodeSnippetToDelete({ snippetId, durationId });
  };

  const confirmDeleteDurationCodeSnippet = async () => {
    if (!durationCodeSnippetToDelete) return;
    await deleteDurationCodeSnippet(durationCodeSnippetToDelete.snippetId, durationCodeSnippetToDelete.durationId);
    setActiveDurationCodeSnippets(prev => prev.filter(s => s.id !== durationCodeSnippetToDelete.snippetId));
    setDurationCodeSnippetToDelete(null);
  };

  // Handle context menu for images/videos/audios
  const handleContextMenu = (
    e: React.MouseEvent,
    type: 'image' | 'video' | 'durationImage' | 'durationVideo' | 'durationAudio' | 'audio',
    item: Image | Video | DurationImage | DurationVideo | DurationAudio | Audio
  ) => {
    // Check shift key from both React synthetic event and native event
    const isShiftPressed = e.shiftKey || e.nativeEvent.shiftKey;

    e.preventDefault();
    e.stopPropagation();

    // If shift key is pressed, cycle color instead of showing context menu
    if (isShiftPressed) {
      handleColorCycle(type, item);
      return;
    }

    setContextMenu({ type, item, x: e.clientX, y: e.clientY });
  };

  // Handle group color cycling for media (top bar) via Shift+Right-Click
  const handleColorCycle = async (
    type: 'image' | 'video' | 'durationImage' | 'durationVideo' | 'durationAudio' | 'audio',
    item: Image | Video | DurationImage | DurationVideo | DurationAudio | Audio
  ) => {
    // Get current group color from override state or original item
    const overrideKey = `${type}-${item.id}`;
    const currentGroupColor = overrideKey in mediaGroupColorOverrides
      ? mediaGroupColorOverrides[overrideKey]
      : ('group_color' in item ? item.group_color : null);
    const nextGroupColor = getNextGroupColorWithNull(currentGroupColor);

    try {
      // Update local state immediately for instant visual feedback (no scroll jump)
      setMediaGroupColorOverrides(prev => ({ ...prev, [overrideKey]: nextGroupColor }));

      // Update database in background based on type
      if (type === 'image') {
        await window.electronAPI.media.updateImageGroupColor(item.id, nextGroupColor);
      } else if (type === 'video') {
        await window.electronAPI.media.updateVideoGroupColor(item.id, nextGroupColor);
      } else if (type === 'durationImage' && activeDurationId) {
        await window.electronAPI.durationImages.updateGroupColor(item.id, nextGroupColor);
      } else if (type === 'durationVideo' && activeDurationId) {
        await window.electronAPI.durationVideos.updateGroupColor(item.id, nextGroupColor);
      } else if (type === 'durationAudio' && activeDurationId) {
        await window.electronAPI.durationAudios.updateGroupColor(item.id, nextGroupColor);
      } else if (type === 'audio') {
        await window.electronAPI.audios.updateGroupColor(item.id, nextGroupColor);
      }
    } catch (error) {
      console.error('Failed to update group color:', error);
      // Revert local state on error
      setMediaGroupColorOverrides(prev => {
        const updated = { ...prev };
        delete updated[overrideKey];
        return updated;
      });
    }
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
        const updated = await window.electronAPI.media.updateImageCaption(captionModal.id, trimmedCaption);
        setRecording(prev => prev ? { ...prev, images: (prev.images || []).map(img => img.id === captionModal.id ? updated : img) } : prev);
      } else if (captionModal.type === 'video') {
        const updated = await window.electronAPI.media.updateVideoCaption(captionModal.id, trimmedCaption);
        setRecording(prev => prev ? { ...prev, videos: (prev.videos || []).map(vid => vid.id === captionModal.id ? updated : vid) } : prev);
      } else if (captionModal.type === 'durationImage' && activeDurationId) {
        await updateDurationImageCaption(captionModal.id, activeDurationId, trimmedCaption);
      } else if (captionModal.type === 'durationVideo' && activeDurationId) {
        await updateDurationVideoCaption(captionModal.id, activeDurationId, trimmedCaption);
      } else if (captionModal.type === 'durationAudio' && activeDurationId) {
        await updateDurationAudioCaption(captionModal.id, activeDurationId, trimmedCaption);
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
    const handleClick = () => { setContextMenu(null); setContextMenuShowColors(false); };
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
      setRecording(prev => prev ? { ...prev, images: (prev.images || []).filter(img => img.id !== imageToDelete.imageId) } : prev);
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

  // Handle duration color change (right-click: side colors)
  const handleColorChange = async (durationId: number, color: DurationColor) => {
    await updateDuration(durationId, { color });
  };

  // Handle duration group color change (shift+right-click: top bar)
  const handleGroupColorChange = async (durationId: number, groupColor: DurationGroupColor) => {
    await updateDuration(durationId, { group_color: groupColor });
  };

  const images = recording?.images ?? [];

  const activeDurationImages = activeDurationId ? durationImagesCache[activeDurationId] ?? [] : [];

  // Derive OCR maps directly from image data (caption2 is non-null when OCR has been extracted)
  const recordingImageOcrMap: Record<number, boolean> = {};
  for (const img of images) recordingImageOcrMap[img.id] = !!img.caption2;
  const durationImageOcrMap: Record<number, boolean> = {};
  for (const img of activeDurationImages) durationImageOcrMap[img.id] = !!img.caption2;
  const activeDurationVideos = activeDurationId ? durationVideosCache[activeDurationId] ?? [] : [];
  const activeDurationAudios = activeDurationId ? durationAudiosCache[activeDurationId] ?? [] : [];

  // Build maps for duration image audio feature
  const imageAudiosMap: Record<number, DurationImageAudio[]> = {};
  const audioCountMap: Record<number, number> = {};
  const tagCountMap: Record<number, number> = {};
  const tagNamesMap: Record<number, string[]> = {};
  for (const img of activeDurationImages) {
    const audios = durationImageAudiosCache[img.id] ?? [];
    imageAudiosMap[img.id] = audios;
    audioCountMap[img.id] = audios.length;
    const tags = durationImageTagsCache[img.id] ?? [];
    tagCountMap[img.id] = tags.length;
    tagNamesMap[img.id] = tags;
  }

  // Fetch tags for active duration images so tag badges + overlays render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeDurationImages.length === 0) {
      setDurationImageTagsCache({});
      return;
    }
    Promise.all(
      activeDurationImages.map(img =>
        window.electronAPI.tags.getByMedia('duration_image', img.id)
          .then(tags => [img.id, tags.map((t: { name: string }) => t.name)] as const)
      )
    ).then(entries => setDurationImageTagsCache(Object.fromEntries(entries)));
  }, [activeDurationId, durationImagesCache]);

  // Fetch color labels for active duration images
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeDurationImages.length === 0) {
      setDurationImageColorsCache({});
      return;
    }
    window.electronAPI.mediaColors.getBatch('duration_image', activeDurationImages.map(i => i.id))
      .then(setDurationImageColorsCache);
  }, [activeDurationId, durationImagesCache]);

  // Pre-fetch audios for all recording-level images so badges render in the grid
  useEffect(() => {
    for (const img of images) {
      if (img.id !== undefined && recordingImageAudiosCache[img.id] === undefined) {
        loadRecordingImageAudios(img.id);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images]);

  // Fetch file sizes for all media (videos, images, audios — recording + duration level)
  useEffect(() => {
    const recVideos = recording?.videos ?? [];
    const paths = [
      ...recVideos.map((v: { file_path: string }) => v.file_path),
      ...images.map(i => i.file_path),
      ...recordingAudios.map(a => a.file_path),
      ...activeDurationVideos.map(v => v.file_path),
      ...activeDurationImages.map(i => i.file_path),
      ...activeDurationAudios.map(a => a.file_path),
    ].filter(Boolean);
    if (paths.length === 0) return;
    window.electronAPI.fs.getFileSizes(paths).then(setFileSizes);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording?.videos, images, recordingAudios, activeDurationVideos, activeDurationImages, activeDurationAudios]);

  // Fetch color labels for recording-level images
  useEffect(() => {
    if (images.length === 0) {
      setRecordingImageColorsCache({});
      return;
    }
    window.electronAPI.mediaColors.getBatch('image', images.map(i => i.id))
      .then(setRecordingImageColorsCache);
  }, [images]);

  // Fetch child image counts for recording-level images
  useEffect(() => {
    if (images.length === 0) { setRecordingImageChildCountMap({}); return; }
    Promise.all(
      images.map(img =>
        window.electronAPI.imageChildren.getByParent('image', img.id)
          .then((children: { id: number }[]) => [img.id, children.length] as const)
      )
    ).then(entries => setRecordingImageChildCountMap(Object.fromEntries(entries)));
  }, [images]);

  // Fetch child image counts for active duration images
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeDurationImages.length === 0) { setDurationImageChildCountMap({}); return; }
    Promise.all(
      activeDurationImages.map(img =>
        window.electronAPI.imageChildren.getByParent('duration_image', img.id)
          .then((children: { id: number }[]) => [img.id, children.length] as const)
      )
    ).then(entries => setDurationImageChildCountMap(Object.fromEntries(entries)));
  }, [activeDurationId, durationImagesCache]);

  // Fetch color labels for duration-level audios
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!activeDurationAudios.length) { setDurationAudioColorsCache({}); return; }
    window.electronAPI.mediaColors.getBatch('duration_audio', activeDurationAudios.map(a => a.id))
      .then(setDurationAudioColorsCache);
  }, [activeDurationId, durationAudiosCache]);

  // Fetch color labels for recording-level audios
  useEffect(() => {
    if (!recordingAudios.length) { setRecordingAudioColorsCache({}); return; }
    window.electronAPI.mediaColors.getBatch('audio', recordingAudios.map(a => a.id))
      .then(setRecordingAudioColorsCache);
  }, [recordingAudios]);

  // Fetch color labels for recording-level image audios
  useEffect(() => {
    const allAudioIds = Object.values(recordingImageAudiosCache).flat().map(a => a.id);
    if (allAudioIds.length === 0) { setRecordingImageAudioColorsCache({}); return; }
    window.electronAPI.mediaColors.getBatch('image_audio', allAudioIds)
      .then(setRecordingImageAudioColorsCache);
  }, [recordingImageAudiosCache]);

  // Fetch color labels for duration image audios
  useEffect(() => {
    const allAudioIds = activeDurationImages.flatMap(img => durationImageAudiosCache[img.id] ?? []).map(a => a.id);
    if (allAudioIds.length === 0) { setDurationImageAudioColorsCache({}); return; }
    window.electronAPI.mediaColors.getBatch('duration_image_audio', allAudioIds)
      .then(setDurationImageAudioColorsCache);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDurationId, durationImageAudiosCache]);

  // Fetch color labels for recording-level videos
  useEffect(() => {
    const recordingVideos = recording?.videos ?? [];
    if (!recordingVideos.length) { setVideoColorsCache({}); return; }
    window.electronAPI.mediaColors.getBatch('video', recordingVideos.map(v => v.id))
      .then(setVideoColorsCache);
  }, [recording?.videos]);

  // Fetch color labels for duration-level videos
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!activeDurationVideos.length) { setDurationVideoColorsCache({}); return; }
    window.electronAPI.mediaColors.getBatch('duration_video', activeDurationVideos.map(v => v.id))
      .then(setDurationVideoColorsCache);
  }, [activeDurationId, durationVideosCache]);

  // Fetch tag counts for recording-level videos
  useEffect(() => {
    const recordingVideos = recording?.videos ?? [];
    if (!recordingVideos.length) { setVideoTagCountMap({}); return; }
    Promise.all(
      recordingVideos.map(v =>
        window.electronAPI.tags.getByMedia('video', v.id)
          .then((tags: { name: string }[]) => [v.id, tags.length] as const)
      )
    ).then(entries => setVideoTagCountMap(Object.fromEntries(entries)));
  }, [recording?.videos]);

  // Fetch tag counts for duration-level videos
  useEffect(() => {
    if (!activeDurationVideos.length) { setDurationVideoTagCountMap({}); return; }
    Promise.all(
      activeDurationVideos.map(v =>
        window.electronAPI.tags.getByMedia('duration_video', v.id)
          .then((tags: { name: string }[]) => [v.id, tags.length] as const)
      )
    ).then(entries => setDurationVideoTagCountMap(Object.fromEntries(entries)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDurationId, activeDurationVideos.length]);

  // Fetch tag counts for recording-level audios
  useEffect(() => {
    if (!recordingAudios.length) { setRecordingAudioTagCountMap({}); return; }
    Promise.all(
      recordingAudios.map(a =>
        window.electronAPI.tags.getByMedia('audio', a.id)
          .then((tags: { name: string }[]) => [a.id, tags.length] as const)
      )
    ).then(entries => setRecordingAudioTagCountMap(Object.fromEntries(entries)));
  }, [recordingAudios]);

  // Fetch tag counts for duration-level audios
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!activeDurationAudios.length) { setDurationAudioTagCountMap({}); return; }
    Promise.all(
      activeDurationAudios.map(a =>
        window.electronAPI.tags.getByMedia('duration_audio', a.id)
          .then((tags: { name: string }[]) => [a.id, tags.length] as const)
      )
    ).then(entries => setDurationAudioTagCountMap(Object.fromEntries(entries)));
  }, [activeDurationId, durationAudiosCache]);

  // Fetch tag counts for recording-level image audios
  useEffect(() => {
    const allAudios = Object.values(recordingImageAudiosCache).flat();
    if (!allAudios.length) { setRecordingImageAudioTagCountMap({}); return; }
    Promise.all(
      allAudios.map(a =>
        window.electronAPI.tags.getByMedia('image_audio', a.id)
          .then((tags: { name: string }[]) => [a.id, tags.length] as const)
      )
    ).then(entries => setRecordingImageAudioTagCountMap(Object.fromEntries(entries)));
  }, [recordingImageAudiosCache]);

  // Fetch tag counts for duration image audios
  useEffect(() => {
    const allAudios = activeDurationImages.flatMap(img => durationImageAudiosCache[img.id] ?? []);
    if (!allAudios.length) { setDurationImageAudioTagCountMap({}); return; }
    Promise.all(
      allAudios.map(a =>
        window.electronAPI.tags.getByMedia('duration_image_audio', a.id)
          .then((tags: { name: string }[]) => [a.id, tags.length] as const)
      )
    ).then(entries => setDurationImageAudioTagCountMap(Object.fromEntries(entries)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDurationId, durationImageAudiosCache]);

  const handleRecordForImage = (imageId: number) => {
    if (!activeDurationId || !id) return;
    const img = activeDurationImages.find(i => i.id === imageId);
    audioRecording.startRecording({
      type: 'duration_image',
      durationImageId: imageId,
      durationId: activeDurationId,
      recordingId: id,
      label: img?.caption || `Image ${imageId}`,
    });
  };

  const handlePlayImageAudio = async (audio: DurationImageAudio, label: string) => {
    const markers = await window.electronAPI.audioMarkers.getByAudio(audio.id, 'duration_image');
    imageAudioPlayer.play(
      audio,
      label,
      markers,
      async (audioId, caption) => {
        if ('duration_image_id' in audio) {
          return updateDurationImageAudioCaption(audioId, audio.duration_image_id, caption);
        }
      },
      'duration_image_audio'
    );
  };

  const handleDeleteImageAudio = async (audioId: number, imageId: number) => {
    await deleteDurationImageAudio(audioId, imageId);
  };

  const handleUpdateImageAudioCaption = async (audioId: number, imageId: number, caption: string | null) => {
    const updated = await updateDurationImageAudioCaption(audioId, imageId, caption);
    imageAudioPlayer.syncCurrentAudio(updated);
  };

  // Recording-level image audio helpers
  const loadRecordingImageAudios = async (imageId: number) => {
    const audios = await window.electronAPI.imageAudios.getByImage(imageId);
    setRecordingImageAudiosCache(prev => ({ ...prev, [imageId]: audios }));
  };

  const recordingImageAudiosMap: Record<number, AnyImageAudio[]> = {};
  const recordingImageAudioCountMap: Record<number, number> = {};
  for (const img of images) {
    const audios = recordingImageAudiosCache[img.id] ?? [];
    recordingImageAudiosMap[img.id] = audios;
    recordingImageAudioCountMap[img.id] = audios.length;
  }

  const handleToggleRecordingImageColor = async (imageId: number, colorKey: string) => {
    const updated = await window.electronAPI.mediaColors.toggle('image', imageId, colorKey);
    setRecordingImageColorsCache(prev => ({ ...prev, [imageId]: updated }));
  };

  const handleToggleDurationImageColor = async (imageId: number, colorKey: string) => {
    const updated = await window.electronAPI.mediaColors.toggle('duration_image', imageId, colorKey);
    setDurationImageColorsCache(prev => ({ ...prev, [imageId]: updated }));
  };

  const handleToggleRecordingAudioColor = async (audioId: number, colorKey: string) => {
    const updated = await window.electronAPI.mediaColors.toggle('audio', audioId, colorKey);
    setRecordingAudioColorsCache(prev => ({ ...prev, [audioId]: updated }));
    setContextMenuShowColors(false);
  };

  const handleToggleDurationAudioColor = async (audioId: number, colorKey: string) => {
    const updated = await window.electronAPI.mediaColors.toggle('duration_audio', audioId, colorKey);
    setDurationAudioColorsCache(prev => ({ ...prev, [audioId]: updated }));
    setContextMenuShowColors(false);
  };

  const handleToggleVideoColor = async (videoId: number, colorKey: string) => {
    const updated = await window.electronAPI.mediaColors.toggle('video', videoId, colorKey);
    setVideoColorsCache(prev => ({ ...prev, [videoId]: updated }));
    setContextMenuShowColors(false);
  };

  const handleToggleDurationVideoColor = async (videoId: number, colorKey: string) => {
    const updated = await window.electronAPI.mediaColors.toggle('duration_video', videoId, colorKey);
    setDurationVideoColorsCache(prev => ({ ...prev, [videoId]: updated }));
    setContextMenuShowColors(false);
  };

  const handleToggleRecordingImageAudioColor = async (audioId: number, colorKey: string) => {
    const updated = await window.electronAPI.mediaColors.toggle('image_audio', audioId, colorKey);
    setRecordingImageAudioColorsCache(prev => ({ ...prev, [audioId]: updated }));
  };

  const handleToggleDurationImageAudioColor = async (audioId: number, colorKey: string) => {
    const updated = await window.electronAPI.mediaColors.toggle('duration_image_audio', audioId, colorKey);
    setDurationImageAudioColorsCache(prev => ({ ...prev, [audioId]: updated }));
  };

  const handleRecordForRecordingImage = (imageId: number) => {
    if (!id) return;
    const img = images.find(i => i.id === imageId);
    audioRecording.startRecording({
      type: 'recording_image',
      imageId,
      recordingId: id,
      label: img?.caption || `Image ${imageId}`,
    });
  };

  const handlePlayRecordingImageAudio = async (audio: AnyImageAudio, label: string) => {
    const markers = await window.electronAPI.audioMarkers.getByAudio(audio.id, 'recording_image');
    const imageAudio = audio as ImageAudio;
    imageAudioPlayer.play(
      audio,
      label,
      markers,
      async (audioId, caption) => {
        const updated = await window.electronAPI.imageAudios.updateCaption(audioId, caption);
        setRecordingImageAudiosCache(prev => ({
          ...prev,
          [imageAudio.image_id]: (prev[imageAudio.image_id] ?? []).map(a => a.id === audioId ? updated : a),
        }));
        return updated;
      },
      'image_audio'
    );
  };

  const handleDeleteRecordingImageAudio = async (audioId: number, imageId: number) => {
    const audio = (recordingImageAudiosCache[imageId] ?? []).find(a => a.id === audioId);
    if (audio) {
      await window.electronAPI.imageAudios.delete(audioId);
      setRecordingImageAudiosCache(prev => ({
        ...prev,
        [imageId]: (prev[imageId] ?? []).filter(a => a.id !== audioId),
      }));
    }
  };

  const handleUpdateRecordingImageAudioCaption = async (audioId: number, imageId: number, caption: string | null) => {
    const updated = await window.electronAPI.imageAudios.updateCaption(audioId, caption);
    setRecordingImageAudiosCache(prev => ({
      ...prev,
      [imageId]: (prev[imageId] ?? []).map(a => a.id === audioId ? updated : a),
    }));
    imageAudioPlayer.syncCurrentAudio(updated);
  };

  // Debug: Log cache updates
  useEffect(() => {
    if (activeDurationId !== null) {
      console.log(`[RecordingPage] Cache updated for duration ${activeDurationId}:`, {
        images: activeDurationImages.length,
        videos: activeDurationVideos.length,
        audios: activeDurationAudios.length,
        imagesCache: durationImagesCache[activeDurationId],
      });
    }
  }, [activeDurationId, activeDurationImages.length, activeDurationVideos.length, activeDurationAudios.length, durationImagesCache]);
  // ESC key handler for recording video lightbox
  useEffect(() => {
    if (!selectedVideo || !isActiveTab) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedVideo(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedVideo, isActiveTab]);

  // ESC key handler for duration video lightbox
  useEffect(() => {
    if (!selectedDurationVideoPath || !isActiveTab) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedDurationVideoPath(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDurationVideoPath, isActiveTab]);

  // Close all fixed-position overlays when this tab becomes inactive.
  // position:fixed elements leak through display:none in Electron's Chromium and block
  // all click events — same root cause as the FAB/sidebar fix (commit 99d8c63).
  useEffect(() => {
    if (isActiveTab) return;
    setSelectedImageIndex(null);
    setSelectedVideo(null);
    setSelectedDurationImageIndex(null);
    setSelectedDurationVideoPath(null);
    setContextMenu(null);
    setContextMenuShowColors(false);
    setTagModal(null);
    setCaptionModal(null);
    setCaptionText('');
    setShowCodeSnippetModal(false);
    setEditingCodeSnippet(null);
    setShowDurationCodeSnippetModal(false);
    setEditingDurationCodeSnippet(null);
    setShowDeleteConfirm(false);
    setCodeSnippetToDelete(null);
    setDurationCodeSnippetToDelete(null);
    setIsScreenRecording(false);
    setAutoTriggerRegionSelection(false);
    setPendingRegion(null);
    setImageToDelete(null);
    setVideoToDelete(null);
    setDurationToDelete(null);
    setDurationVideoToDelete(null);
    setDurationAudioToDelete(null);
    setRecordingAudioToDelete(null);
  }, [isActiveTab]);

  // Keyboard navigation for recording navigation (between recordings in same topic)
  // Only active tab should respond to keyboard navigation
  useEffect(() => {
    if (!isActiveTab) return;
    const handleRecordingNav = (e: KeyboardEvent) => {
      // Skip if image lightbox is open (image navigation takes priority)
      if (selectedImageIndex !== null) return;

      // Skip if duration image lightbox is open
      if (selectedDurationImageIndex !== null) return;

      // Skip if video lightbox is open
      if (selectedVideo !== null) return;

      // Skip if editing notes
      if (isEditing) return;

      // Skip if user is focused on any input field or contenteditable element
      const activeEl = document.activeElement;
      if (
        activeEl?.tagName === 'INPUT' ||
        activeEl?.tagName === 'TEXTAREA' ||
        activeEl?.getAttribute('contenteditable') === 'true' ||
        activeEl?.closest('[contenteditable="true"]')
      ) return;

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
  }, [isActiveTab, selectedImageIndex, selectedDurationImageIndex, selectedVideo, isEditing, prevRecordingId, nextRecordingId, navigate, activeDurationId]);

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
  const videoUrl = recording.video_path
    ? window.electronAPI.paths.getFileUrl(recording.video_path)
    : null;

  const getVideoMimeType = (filePath: string | null) => {
    const ext = filePath?.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'mov':
        return 'video/mp4';
      case 'mp4':
      case 'm4v':
        return 'video/mp4';
      case 'webm':
        return 'video/webm';
      default:
        return 'video/mp4';
    }
  };

  const videoMimeType = getVideoMimeType(recording.video_path);

  const isVideoRecording = !!recording.video_path;
  const isMarkBasedRecording = isMarkBasedNote(recording);

  return (
    <div
      className="min-h-screen cursor-pointer"
      onClick={handlePageClick}
      onMouseDown={(e) => e.button === 0 && setIsContentPressed(true)}
      onMouseUp={() => setIsContentPressed(false)}
      onMouseLeave={() => setIsContentPressed(false)}
    >
      {searchNav && <SearchNavBanner searchNav={searchNav} />}
      <div className="flex">
        <DurationNotesSidebar
          durations={durations}
          activeDurationId={activeDurationId}
          isWrittenNote={isMarkBasedRecording}
          onDurationSelect={handleSidebarDurationClick}
        />
        <div className={`flex-1 p-6 transition-all duration-300 ${hasSidebar ? 'lg:ml-80' : 'max-w-4xl mx-auto'}`}>
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setCanvasMode(prev => !prev); setPlanMode(false); }}
            title={canvasMode ? 'Back to recording' : 'Open canvas'}
            className={`p-2 rounded-lg transition-colors ${
              canvasMode
                ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" fill="none" stroke="currentColor" />
              <rect x="14" y="3" width="7" height="7" rx="1" fill="none" stroke="currentColor" />
              <rect x="3" y="14" width="7" height="7" rx="1" fill="none" stroke="currentColor" />
              <rect x="14" y="14" width="7" height="7" rx="1" fill="none" stroke="currentColor" />
            </svg>
          </button>
          <button
            onClick={() => { setPlanMode(prev => !prev); setCanvasMode(false); }}
            title={planMode ? 'Back to recording' : 'Open plans'}
            className={`p-2 rounded-lg transition-colors ${
              planMode
                ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setShowDeleteConfirm(true)}
          >
            Delete
          </Button>
        </div>
      </div>

      {/* Canvas view */}
      {canvasMode && id && (
        <div className="relative" style={{ height: 'calc(100vh - 130px)', marginLeft: '-1.5rem', marginRight: '-1.5rem' }}>
          <button
            onClick={() => setCanvasMode(false)}
            className="absolute top-3 left-3 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 shadow-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border border-gray-200 dark:border-gray-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Recording
          </button>
          <RecordingCanvas recordingId={id} />
        </div>
      )}

      {/* Plans view */}
      {planMode && id && (
        <div className="mt-4 p-4 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/50">
          <PlannerSection
            plans={recordingPlans.plans}
            loading={recordingPlans.loading}
            addPlan={recordingPlans.addPlan}
            updatePlan={recordingPlans.updatePlan}
            deletePlan={recordingPlans.deletePlan}
            toggleComplete={recordingPlans.toggleComplete}
          />
        </div>
      )}

      {!canvasMode && !planMode && (<>
      {/* Audio/Video player - hidden for written notes */}
      {!isMarkBasedRecording && (
        <div
          className={`mb-6 p-4 -mx-4 cursor-pointer rounded-xl
                      bg-gray-50 dark:bg-dark-surface
                      shadow-[0_4px_0_0_rgba(0,0,0,0.08)] dark:shadow-[0_4px_0_0_rgba(0,0,0,0.25)]
                      transition-all duration-75
                      ${isContentPressed ? 'translate-y-1 shadow-none' : ''}`}
        >
          <div className="flex items-center justify-between mb-2">
            <h2
              className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 select-none"
              onContextMenu={(e) => {
                e.preventDefault();
                setShowDebug(prev => !prev);
              }}
            >
              <span>{isVideoRecording ? '🎬' : '🎙️'}</span>
              {isVideoRecording ? 'Screen Recording' : 'Audio'}
              <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                ({formatDuration(isVideoRecording ? recording.video_duration : recording.audio_duration)})
              </span>
              {!isVideoRecording && recording.audio_size !== null && (
                <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                  • {formatFileSize(recording.audio_size)}
                </span>
              )}
              {isVideoRecording && recording.video_resolution && recording.video_fps && (
                <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                  • {recording.video_resolution} @ {recording.video_fps}fps
                </span>
              )}
              {isVideoRecording && recording.video_size !== null && (
                <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                  • {formatFileSize(recording.video_size)}
                </span>
              )}
            </h2>
            <div className="flex items-center gap-2">
              {/* Record Screen button removed - use Cmd+D shortcut or FAB on TopicDetailPage to create new screen recordings */}
            </div>
          </div>
          {isVideoRecording ? (
            videoUrl ? (
              <video
                ref={videoPlayerRef}
                controls
                className="w-full rounded-lg bg-black"
                onLoadedData={() => setMediaLoaded(true)}
              >
                <source src={videoUrl} type={videoMimeType} />
                Your browser does not support the video tag.
              </video>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">No video file available</p>
            )
          ) : (
            audioUrl ? (
              <AudioPlayer
                ref={audioPlayerRef}
                src={audioUrl}
                duration={recording.audio_duration ?? undefined}
                onLoad={() => setMediaLoaded(true)}
                onPlay={() => setIsSeekingDuration(false)}
                showDebug={showDebug}
              />
            ) : (
              <p className="text-gray-500 dark:text-gray-400">No audio file available</p>
            )
          )}
        </div>
      )}

      {/* PDF Viewer - shown for book notes */}
      {isBookNote(recording) && recording.pdf_path && (
        <div className="mb-6 -mx-4">
          <div className="flex items-center justify-between px-4 mb-2">
            <h2 className="text-lg font-semibold text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              PDF Viewer
            </h2>
          </div>
          <div style={{ height: '60vh' }} className="rounded-lg overflow-hidden border border-indigo-200 dark:border-indigo-800/50 mx-4">
            <PdfViewer
              ref={pdfViewerRef}
              filePath={recording.pdf_path}
              pageOffset={recording.page_offset ?? 0}
              onScreenshotCapture={handlePdfScreenshot}
              onCalibrateOffset={async (offset) => {
                try {
                  const updated = await window.electronAPI.recordings.update(recording.id, { page_offset: offset });
                  setRecording(updated);
                } catch (err) {
                  console.error('Failed to save page offset:', err);
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Book Reader View - shown for reader notes */}
      {isReaderNote(recording) && recording.book_data_path && (
        <div className="mb-6 -mx-4">
          <div className="flex items-center justify-between px-4 mb-2">
            <h2 className="text-lg font-semibold text-violet-700 dark:text-violet-300 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Reader
            </h2>
            {recording.total_words && (
              <span className="text-xs text-stone-400 dark:text-stone-500">
                {recording.total_words.toLocaleString()} words · {recording.total_pages} pages
              </span>
            )}
          </div>
          <div style={{ height: '70vh' }} className="rounded-lg overflow-hidden border border-violet-200 dark:border-violet-800/50 mx-4">
            <BookReaderView
              ref={bookReaderRef}
              bookDataPath={recording.book_data_path}
              pdfPath={recording.pdf_path ?? undefined}
              initialCharacterOffset={recording.character_offset ?? 0}
              onPositionChange={async (characterOffset, progress, _originalPage) => {
                try {
                  const updated = await window.electronAPI.recordings.update(recording.id, {
                    character_offset: characterOffset,
                    reading_progress: progress,
                  });
                  setRecording(updated);
                } catch (err) {
                  console.error('Failed to save reading progress:', err);
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Extraction pending - show re-extract option if PDF exists but no book data */}
      {isReaderNote(recording) && recording.pdf_path && !recording.book_data_path && (
        <div className="mb-6 p-4 -mx-4 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 mx-4">
          <p className="text-sm text-violet-700 dark:text-violet-300 mb-2">
            Text extraction is pending or was interrupted.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="text-sm text-violet-600 dark:text-violet-400 underline"
          >
            Reload to retry
          </button>
        </div>
      )}

      {/* Main Notes section - shown for mark-based notes (replaces audio/video player) */}
      {isMarkBasedRecording && (
        <div className="mb-6 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-2">
              <span>📝</span>
              Main Notes
            </h2>
            {!isEditingMainNotes && (
              <Button variant="ghost" size="sm" onClick={handleEditMainNotes}>
                Edit
              </Button>
            )}
          </div>
          {isEditingMainNotes ? (
            <div className="space-y-3">
              <NotesEditor
                value={mainNotes}
                onChange={setMainNotes}
                placeholder="Write your main notes here..."
              />
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setIsEditingMainNotes(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSaveMainNotes} disabled={isSavingMainNotes}>
                  {isSavingMainNotes ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-amber-700 dark:text-amber-300">
              {recording.main_notes_content ? (
                <div
                  className="notes-content"
                  dangerouslySetInnerHTML={{ __html: recording.main_notes_content }}
                />
              ) : (
                <p className="italic text-amber-500 dark:text-amber-400/70">
                  No main notes yet. Click Edit to add notes.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Duration markers / Marks */}
      {isMarkBasedRecording ? (
        <MarkList
          durations={durations}
          activeDurationId={activeDurationId}
          onMarkClick={(duration) => {
            setActiveDurationId(activeDurationId === duration.id ? null : duration.id);
            if (isBookNote(recording) && duration.page_number && pdfViewerRef.current) {
              pdfViewerRef.current.goToPage(duration.page_number);
            } else if (isReaderNote(recording) && duration.page_number && bookReaderRef.current) {
              bookReaderRef.current.goToOriginalPage(duration.page_number);
            }
          }}
          onDeleteMark={handleDeleteDuration}
          onAddMark={handleAddMark}
          onUpdateNote={handleUpdateNote}
          onColorChange={handleColorChange}
          onGroupColorChange={handleGroupColorChange}
          onReorder={reorderDurations}
          durationImagesCache={durationImagesCache}
          durationVideosCache={durationVideosCache}
          isAddingMark={isAddingMark}
          pageOffset={(isBookNote(recording) || isReaderNote(recording)) ? (recording.page_offset ?? 0) : undefined}
        />
      ) : (
        <DurationList
          durations={durations}
          activeDurationId={activeDurationId}
          onDurationClick={handleDurationClick}
          onDeleteDuration={handleDeleteDuration}
          onUpdateNote={handleUpdateNote}
          onColorChange={handleColorChange}
          onGroupColorChange={handleGroupColorChange}
          durationImagesCache={durationImagesCache}
          durationVideosCache={durationVideosCache}
          disabled={!mediaLoaded || isSeekingDuration}
        />
      )}

      {/* Duration canvas/plans toggle buttons */}
      {activeDurationId && (
        <div className="mb-2 flex justify-end gap-1">
          <button
            onClick={() => { setDurationCanvasMode(prev => !prev); setDurationPlanMode(false); }}
            title={durationCanvasMode ? 'Back to mark content' : 'Open mark canvas'}
            className={`p-1.5 rounded-lg transition-colors ${
              durationCanvasMode
                ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400'
                : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" fill="none" stroke="currentColor" />
              <rect x="14" y="3" width="7" height="7" rx="1" fill="none" stroke="currentColor" />
              <rect x="3" y="14" width="7" height="7" rx="1" fill="none" stroke="currentColor" />
              <rect x="14" y="14" width="7" height="7" rx="1" fill="none" stroke="currentColor" />
            </svg>
          </button>
          <button
            onClick={() => { setDurationPlanMode(prev => !prev); setDurationCanvasMode(false); }}
            title={durationPlanMode ? 'Back to mark content' : 'Open mark plans'}
            className={`p-1.5 rounded-lg transition-colors ${
              durationPlanMode
                ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400'
                : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </button>
        </div>
      )}

      {/* Duration plans view */}
      {durationPlanMode && activeDurationId && (
        <div className="mb-4 p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/50 rounded-lg">
          <PlannerSection
            plans={durationPlans.plans}
            loading={durationPlans.loading}
            addPlan={durationPlans.addPlan}
            updatePlan={durationPlans.updatePlan}
            deletePlan={durationPlans.deletePlan}
            toggleComplete={durationPlans.toggleComplete}
          />
        </div>
      )}

      {/* Duration canvas view */}
      {durationCanvasMode && activeDurationId && (
        <div className="relative mb-4" style={{ height: 'calc(100vh - 200px)' }}>
          <button
            onClick={() => setDurationCanvasMode(false)}
            className="absolute top-3 left-3 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 shadow-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border border-gray-200 dark:border-gray-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Mark
          </button>
          <DurationCanvas
            key={activeDurationId}
            durationId={activeDurationId}
            onImageAttached={() => getDurationImages(activeDurationId!, true)}
          />
        </div>
      )}

      {/* Duration Images - shown when a duration is active and has images */}
      {!durationCanvasMode && !durationPlanMode && activeDurationId && activeDurationImages.length > 0 && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-blue-700 dark:text-blue-300">
              Images ({activeDurationImages.length})
              {activeDurationImages.length > 0 && (() => {
                const total = activeDurationImages.reduce((s, i) => s + (fileSizes[i.file_path] ?? 0), 0);
                return total > 0 ? <span className="ml-1.5 text-[10px] font-normal text-blue-400 dark:text-blue-500">· {formatFileSize(total)}</span> : null;
              })()}
            </h3>
            <button
              onClick={handleAddDurationImage}
              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
            >
              📋 Paste
            </button>
          </div>
          <SortableImageGrid
            images={activeDurationImages}
            gridClassName="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2"
            colorOverrides={mediaColorOverrides}
            groupColorOverrides={mediaGroupColorOverrides}
            colorKeyPrefix="durationImage"
            captionColorClass="text-blue-600 dark:text-blue-400"
            highlightedId={
              searchNav?.results[searchNav.currentIndex]?.content_type === 'duration_image'
                ? searchNav.results[searchNav.currentIndex].source_id
                : undefined
            }
            onImageClick={(index) => {
              const img = activeDurationImages[index];
              if (isBookNote(recording) && img?.page_number && pdfViewerRef.current) {
                pdfViewerRef.current.goToPage(img.page_number);
              } else {
                setSelectedDurationImageIndex(index);
              }
            }}
            onContextMenu={(e, img) => handleContextMenu(e, 'durationImage', img as DurationImage)}
            onDelete={handleDeleteDurationImage}
            onReorder={handleReorderDurationImages}
            audioCountMap={audioCountMap}
            tagCountMap={tagCountMap}
            tagNamesMap={tagNamesMap}
            childCountMap={durationImageChildCountMap}
            ocrMap={durationImageOcrMap}
            imageColorsMap={durationImageColorsCache}
            pastePlaceholder={
              <div className="flex flex-col items-center">
                <div className="relative w-full max-w-[160px]">
                  <div
                    className="aspect-square rounded-lg border-2 border-dashed border-blue-300 dark:border-blue-600
                               bg-blue-50/50 dark:bg-blue-900/10 cursor-pointer hover:border-blue-400 dark:hover:border-blue-500
                               hover:bg-blue-100/50 dark:hover:bg-blue-900/20 transition-colors
                               flex items-center justify-center"
                    onClick={handleAddDurationImage}
                  >
                    <svg className="w-8 h-8 text-blue-300 dark:text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                </div>
              </div>
            }
          />
        </div>
      )}

      {/* Add Image prompt when duration is active but has no images */}
      {!durationCanvasMode && !durationPlanMode && activeDurationId && activeDurationImages.length === 0 && (
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
      {!durationCanvasMode && !durationPlanMode && activeDurationId && activeDurationVideos.length > 0 && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-blue-700 dark:text-blue-300">
              Videos ({activeDurationVideos.length})
              {activeDurationVideos.length > 0 && (() => {
                const total = activeDurationVideos.reduce((s, v) => s + (fileSizes[v.file_path] ?? 0), 0);
                return total > 0 ? <span className="ml-1.5 text-[10px] font-normal text-blue-400 dark:text-blue-500">· {formatFileSize(total)}</span> : null;
              })()}
            </h3>
            <button
              onClick={handleAddDurationVideo}
              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
            >
              📋 Paste
            </button>
          </div>
          <div className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
            {activeDurationVideos.map((video, index) => {
              const effectiveColor = mediaColorOverrides[`durationVideo-${video.id}`] ?? video.color;
              const colorConfig = effectiveColor ? DURATION_COLORS[effectiveColor] : null;
              const durationVideoKey = `durationVideo-${video.id}`;
              const effectiveGroupColor = durationVideoKey in mediaGroupColorOverrides ? mediaGroupColorOverrides[durationVideoKey] : video.group_color;
              const groupColorConfig = effectiveGroupColor ? DURATION_GROUP_COLORS[effectiveGroupColor] : null;
              return (
              <div key={video.id} className="group">
                <div className="relative">
                  {/* Top group color indicator */}
                  {groupColorConfig && (
                    <div
                      className="absolute top-0 left-0 right-0 h-1 rounded-t-lg z-10"
                      style={{ backgroundColor: groupColorConfig.color }}
                    />
                  )}
                  {/* Number badge */}
                  <div className="absolute top-1 left-1 w-5 h-5 bg-black/70 text-white
                                  rounded-full flex items-center justify-center text-xs font-bold z-10">
                    {index + 1}
                  </div>
                  {/* Left color indicator */}
                  {colorConfig && (
                    <div
                      className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg z-10"
                      style={{ backgroundColor: colorConfig.borderColor }}
                    />
                  )}
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
                  {/* Right color indicator */}
                  {colorConfig && (
                    <div
                      className="absolute right-0 top-0 bottom-0 w-1 rounded-r-lg z-10"
                      style={{ backgroundColor: colorConfig.borderColor }}
                    />
                  )}
                  <button
                    onClick={() => handleDeleteDurationVideo(video.id)}
                    className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full
                               opacity-0 group-hover:opacity-100 transition-opacity
                               flex items-center justify-center text-sm z-20"
                  >
                    ×
                  </button>
                  {/* MKV → MP4 convert buttons (CRF options) */}
                  {video.file_path?.toLowerCase().endsWith('.mkv') && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-black/40 rounded-lg">
                      {convertingVideoIds.has(video.id) ? (
                        <span className="text-[10px] text-white font-medium">converting…</span>
                      ) : (
                        <>
                          <div className="flex gap-1">
                            {([40, 35, 32] as const).map(crf => (
                              <button
                                key={crf}
                                onClick={() => handleConvertMkvToMp4(video.id, 'durationVideo', video.file_path, crf)}
                                title={`CRF ${crf}${crf === 40 ? ' (smallest)' : ''}`}
                                className={`w-8 py-0.5 text-[10px] font-medium text-white rounded
                                  ${crf === 35 ? 'bg-blue-600' : 'bg-blue-500/80'}`}
                              >
                                {crf}
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-1">
                            {([28, 23] as const).map(crf => (
                              <button
                                key={crf}
                                onClick={() => handleConvertMkvToMp4(video.id, 'durationVideo', video.file_path, crf)}
                                title={`CRF ${crf}${crf === 23 ? ' (best quality)' : ''}`}
                                className="w-8 py-0.5 text-[10px] font-medium text-white rounded bg-blue-500/80"
                              >
                                {crf}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {/* Bottom color bar */}
                  {(durationVideoColorsCache[video.id] ?? []).length > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 flex h-[3px] pointer-events-none">
                      {(durationVideoColorsCache[video.id] ?? []).slice(0, 5).map(key => (
                        <div key={key} className="flex-1 h-full"
                          style={{ backgroundColor: IMAGE_COLORS[key as keyof typeof IMAGE_COLORS]?.hex ?? '#888' }} />
                      ))}
                    </div>
                  )}
                  {/* Tag count badge */}
                  {(durationVideoTagCountMap[video.id] ?? 0) > 0 && (
                    <span className="absolute top-1 right-6 text-[9px] bg-orange-500 text-white rounded-full px-1 py-0.5 leading-none pointer-events-none z-20">
                      🏷️{durationVideoTagCountMap[video.id]}
                    </span>
                  )}
                  {/* File size badge */}
                  {(fileSizes[video.file_path] ?? 0) > 0 && (
                    <span className="absolute bottom-1 right-1 text-[9px] bg-black/60 text-white rounded px-1 py-0.5 leading-none pointer-events-none z-20">
                      {formatFileSize(fileSizes[video.file_path])}
                    </span>
                  )}
                </div>
                {/* Caption */}
                {video.caption && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 line-clamp-2 italic font-light leading-tight">
                    {video.caption}
                  </p>
                )}
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Video prompt when duration is active but has no videos */}
      {!durationCanvasMode && !durationPlanMode && activeDurationId && activeDurationVideos.length === 0 && (
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
      {!durationCanvasMode && !durationPlanMode && activeDurationId && activeDurationAudios.length > 0 && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-blue-700 dark:text-blue-300">
              Audio Recordings ({activeDurationAudios.length})
              {activeDurationAudios.length > 0 && (() => {
                const total = activeDurationAudios.reduce((s, a) => s + (fileSizes[a.file_path] ?? 0), 0);
                return total > 0 ? <span className="ml-1.5 text-[10px] font-normal text-blue-400 dark:text-blue-500">· {formatFileSize(total)}</span> : null;
              })()}
            </h3>
            <button
              onClick={() => setIsRecordingDurationAudio(true)}
              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
            >
              🎙️ Record
            </button>
          </div>
          <div className="space-y-2">
            {activeDurationAudios.map((audio, index) => {
              const durationAudioKey = `durationAudio-${audio.id}`;
              const effectiveGroupColor = durationAudioKey in mediaGroupColorOverrides ? mediaGroupColorOverrides[durationAudioKey] : audio.group_color;
              const groupColorConfig = effectiveGroupColor ? DURATION_GROUP_COLORS[effectiveGroupColor] : null;
              const audioMarkers = durationAudioMarkersCache[audio.id] ?? [];
              const markerCounts: Record<AudioMarkerType, number> = {
                important: audioMarkers.filter(m => m.marker_type === 'important').length,
                question: audioMarkers.filter(m => m.marker_type === 'question').length,
                similar_question: audioMarkers.filter(m => m.marker_type === 'similar_question').length,
              };
              const dur = activeDurationId ? durations.find(d => d.id === activeDurationId) : null;
              const markLabel = audio.caption || (dur?.note
                ? dur.note.replace(/<[^>]+>/g, '').slice(0, 40)
                : `Section ${formatDuration(dur?.start_time ?? 0)} #${index + 1}`);
              return (
              <div
                key={audio.id}
                id={`dur-audio-${audio.id}`}
                className="group relative"
                onContextMenu={(e) => handleContextMenu(e, 'durationAudio', audio)}
              >
                {/* Top group color indicator */}
                {groupColorConfig && (
                  <div
                    className="absolute top-0 left-0 right-0 h-1 rounded-t-lg z-10"
                    style={{ backgroundColor: groupColorConfig.color }}
                  />
                )}
                <div className={`relative flex items-center gap-2 py-1 px-2 rounded-lg bg-blue-900/20 border border-blue-800/30 overflow-hidden ${groupColorConfig ? 'mt-1' : ''}`}>
                  <span className="w-4 h-4 bg-blue-500/30 border border-blue-400/50 text-blue-300 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                    {index + 1}
                  </span>
                  {/* Play button */}
                  <button
                    onClick={async () => {
                      const freshMarkers = await window.electronAPI.audioMarkers.getByAudio(audio.id, 'duration');
                      durationAudioPlayer.play(audio, markLabel, freshMarkers, async (audioId, caption) => {
                        return updateDurationAudioCaption(audioId, activeDurationId!, caption);
                      });
                    }}
                    className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow"
                    title="Play in bottom bar"
                  >
                    <svg className="w-3 h-3 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </button>
                  {/* Label / caption */}
                  <span className="flex-1 text-xs text-blue-300 truncate min-w-0">
                    {audio.caption || markLabel}
                  </span>
                  {/* Marker badge chips */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {markerCounts.important > 0 && (
                      <span className="text-xs px-1 py-0.5 rounded bg-red-900/50 text-red-300 border border-red-800/40">❗{markerCounts.important}</span>
                    )}
                    {markerCounts.question > 0 && (
                      <span className="text-xs px-1 py-0.5 rounded bg-blue-900/50 text-blue-300 border border-blue-800/40">❓{markerCounts.question}</span>
                    )}
                    {markerCounts.similar_question > 0 && (
                      <span className="text-xs px-1 py-0.5 rounded bg-purple-900/50 text-purple-300 border border-purple-800/40">↔{markerCounts.similar_question}</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteDurationAudio(audio.id)}
                    className="w-6 h-6 bg-red-500 text-white rounded-full
                               opacity-0 group-hover:opacity-100 transition-opacity
                               flex items-center justify-center text-sm flex-shrink-0"
                  >
                    ×
                  </button>
                  {/* Bottom color bar */}
                  {(durationAudioColorsCache[audio.id] ?? []).length > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 flex h-[3px] pointer-events-none">
                      {(durationAudioColorsCache[audio.id] ?? []).slice(0, 5).map(key => (
                        <div key={key} className="flex-1 h-full"
                          style={{ backgroundColor: IMAGE_COLORS[key as keyof typeof IMAGE_COLORS]?.hex ?? '#888' }} />
                      ))}
                    </div>
                  )}
                  {/* Tag count badge */}
                  {(durationAudioTagCountMap[audio.id] ?? 0) > 0 && (
                    <span className="absolute top-1 right-7 text-[9px] bg-orange-500 text-white rounded-full px-1.5 py-0.5 leading-none pointer-events-none">
                      🏷️{durationAudioTagCountMap[audio.id]}
                    </span>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Audio prompt when duration is active but has no audios */}
      {!durationCanvasMode && !durationPlanMode && activeDurationId && activeDurationAudios.length === 0 && (
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

      {/* Duration Code Snippets - shown when a duration is active */}
      {!durationCanvasMode && !durationPlanMode && activeDurationId && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-blue-700 dark:text-blue-300">
              Code Snippets ({activeDurationCodeSnippets.length})
            </h3>
            <button
              onClick={() => handleAddDurationCodeSnippet(activeDurationId)}
              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
            >
              + Add
            </button>
          </div>
          {activeDurationCodeSnippets.length > 0 ? (
            <div className="space-y-2">
              {activeDurationCodeSnippets.map((snippet) => (
                <CodeSnippetCard
                  key={snippet.id}
                  snippet={snippet}
                  onEdit={() => handleEditDurationCodeSnippet(snippet, activeDurationId)}
                  onDelete={() => handleDeleteDurationCodeSnippet(snippet.id, activeDurationId)}
                />
              ))}
            </div>
          ) : (
            <p className="text-blue-400 dark:text-blue-500 italic text-sm">No code snippets for this section</p>
          )}
        </div>
      )}

      {/* Notes */}
      <div className="mb-6 p-4 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-purple-700 dark:text-purple-300 flex items-center gap-2">
            <span>🗒️</span>
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
          <div className="text-sm text-purple-700 dark:text-purple-300">
            {recording.notes_content ? (
              <div
                className="notes-content"
                dangerouslySetInnerHTML={{ __html: recording.notes_content }}
              />
            ) : (
              <p className="italic text-purple-400 dark:text-purple-400/70">
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
            {images.length > 0 && (() => {
              const total = images.reduce((s, i) => s + (fileSizes[i.file_path] ?? 0), 0);
              return total > 0 ? <span className="ml-1.5 text-[10px] font-normal text-violet-400 dark:text-violet-500">· {formatFileSize(total)}</span> : null;
            })()}
          </h2>
          <button
            onClick={handleAddImages}
            className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300"
          >
            📋 Paste
          </button>
        </div>
        {images.length > 0 ? (
          <SortableImageGrid
            images={images}
            gridClassName="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3"
            showNumberBadge
            colorOverrides={mediaColorOverrides}
            groupColorOverrides={mediaGroupColorOverrides}
            colorKeyPrefix="image"
            captionColorClass="text-violet-600 dark:text-violet-400"
            highlightedId={
              searchNav?.results[searchNav.currentIndex]?.content_type === 'image'
                ? searchNav.results[searchNav.currentIndex].source_id
                : undefined
            }
            onImageClick={(index) => setSelectedImageIndex(index)}
            onContextMenu={(e, img) => handleContextMenu(e, 'image', img as Image)}
            onDelete={handleDeleteImage}
            onReorder={handleReorderImages}
            audioCountMap={recordingImageAudioCountMap}
            childCountMap={recordingImageChildCountMap}
            ocrMap={recordingImageOcrMap}
            imageColorsMap={recordingImageColorsCache}
            pastePlaceholder={
              <div className="flex flex-col items-center">
                <div className="relative w-full max-w-[160px]">
                  <div
                    className="aspect-square rounded-lg border-2 border-dashed border-violet-300 dark:border-violet-600
                               bg-violet-50/50 dark:bg-violet-900/10 cursor-pointer hover:border-violet-400 dark:hover:border-violet-500
                               hover:bg-violet-100/50 dark:hover:bg-violet-900/20 transition-colors
                               flex items-center justify-center"
                    onClick={handleAddImages}
                  >
                    <svg className="w-8 h-8 text-violet-300 dark:text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                </div>
              </div>
            }
          />
        ) : (
          <p className="text-violet-400 dark:text-violet-500 italic text-sm">No images attached</p>
        )}
      </div>

      {/* Videos */}
      <div className="mb-6 p-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800/50 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-violet-700 dark:text-violet-300">
            Videos ({videos.length})
            {videos.length > 0 && (() => {
              const total = videos.reduce((s, v) => s + (fileSizes[v.file_path] ?? 0), 0);
              return total > 0 ? <span className="ml-1.5 text-[10px] font-normal text-violet-400 dark:text-violet-500">· {formatFileSize(total)}</span> : null;
            })()}
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
            {videos.map((video, index) => {
              const effectiveColor = mediaColorOverrides[`video-${video.id}`] ?? video.color;
              const colorConfig = effectiveColor ? DURATION_COLORS[effectiveColor] : null;
              const videoKey = `video-${video.id}`;
              const effectiveGroupColor = videoKey in mediaGroupColorOverrides ? mediaGroupColorOverrides[videoKey] : video.group_color;
              const groupColorConfig = effectiveGroupColor ? DURATION_GROUP_COLORS[effectiveGroupColor] : null;
              return (
              <div key={video.id} className="group">
                <div
                  className="relative"
                  onContextMenu={(e) => handleContextMenu(e, 'video', video)}
                >
                  {/* Top group color indicator */}
                  {groupColorConfig && (
                    <div
                      className="absolute top-0 left-0 right-0 h-1 rounded-t-lg z-10"
                      style={{ backgroundColor: groupColorConfig.color }}
                    />
                  )}
                  {/* Number badge */}
                  <div className="absolute top-1 left-1 w-6 h-6 bg-black/70 text-white
                                  rounded-full flex items-center justify-center text-xs font-bold z-10">
                    {index + 1}
                  </div>
                  {/* Left color indicator */}
                  {colorConfig && (
                    <div
                      className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg z-10"
                      style={{ backgroundColor: colorConfig.borderColor }}
                    />
                  )}
                  <div
                    className="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-dark-border cursor-pointer"
                    onClick={() => setSelectedVideo(video.file_path)}
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
                  {/* Right color indicator */}
                  {colorConfig && (
                    <div
                      className="absolute right-0 top-0 bottom-0 w-1 rounded-r-lg z-10"
                      style={{ backgroundColor: colorConfig.borderColor }}
                    />
                  )}
                  <button
                    onClick={() => handleDeleteVideo(video.id)}
                    className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full
                               opacity-0 group-hover:opacity-100 transition-opacity
                               flex items-center justify-center text-sm z-20"
                  >
                    ×
                  </button>
                  {/* MKV → MP4 convert buttons (CRF options) */}
                  {video.file_path?.toLowerCase().endsWith('.mkv') && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-black/40 rounded-lg">
                      {convertingVideoIds.has(video.id) ? (
                        <span className="text-[10px] text-white font-medium">converting…</span>
                      ) : (
                        <>
                          <div className="flex gap-1">
                            {([40, 35, 32] as const).map(crf => (
                              <button
                                key={crf}
                                onClick={() => handleConvertMkvToMp4(video.id, 'video', video.file_path, crf)}
                                title={`CRF ${crf}${crf === 40 ? ' (smallest)' : ''}`}
                                className={`w-8 py-0.5 text-[10px] font-medium text-white rounded
                                  ${crf === 35 ? 'bg-blue-600' : 'bg-blue-500/80'}`}
                              >
                                {crf}
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-1">
                            {([28, 23] as const).map(crf => (
                              <button
                                key={crf}
                                onClick={() => handleConvertMkvToMp4(video.id, 'video', video.file_path, crf)}
                                title={`CRF ${crf}${crf === 23 ? ' (best quality)' : ''}`}
                                className="w-8 py-0.5 text-[10px] font-medium text-white rounded bg-blue-500/80"
                              >
                                {crf}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {/* Bottom color bar */}
                  {(videoColorsCache[video.id] ?? []).length > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 flex h-[3px] pointer-events-none">
                      {(videoColorsCache[video.id] ?? []).slice(0, 5).map(key => (
                        <div key={key} className="flex-1 h-full"
                          style={{ backgroundColor: IMAGE_COLORS[key as keyof typeof IMAGE_COLORS]?.hex ?? '#888' }} />
                      ))}
                    </div>
                  )}
                  {/* Tag count badge */}
                  {(videoTagCountMap[video.id] ?? 0) > 0 && (
                    <span className="absolute top-1 right-7 text-[9px] bg-orange-500 text-white rounded-full px-1.5 py-0.5 leading-none pointer-events-none z-20">
                      🏷️{videoTagCountMap[video.id]}
                    </span>
                  )}
                  {/* File size badge */}
                  {(fileSizes[video.file_path] ?? 0) > 0 && (
                    <span className="absolute bottom-1 right-1 text-[9px] bg-black/60 text-white rounded px-1 py-0.5 leading-none pointer-events-none z-20">
                      {formatFileSize(fileSizes[video.file_path])}
                    </span>
                  )}
                </div>
                {/* Caption */}
                {video.caption && (
                  <p className="text-xs text-violet-600 dark:text-violet-400 mt-1 line-clamp-2 italic font-light leading-tight">
                    {video.caption}
                  </p>
                )}
              </div>
              );
            })}
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
            {recordingAudios.length > 0 && (() => {
              const total = recordingAudios.reduce((s, a) => s + (fileSizes[a.file_path] ?? 0), 0);
              return total > 0 ? <span className="ml-1.5 text-[10px] font-normal text-violet-400 dark:text-violet-500">· {formatFileSize(total)}</span> : null;
            })()}
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
            {recordingAudios.map((audio, index) => {
              const audioKey = `audio-${audio.id}`;
              const effectiveGroupColor = audioKey in mediaGroupColorOverrides ? mediaGroupColorOverrides[audioKey] : audio.group_color;
              const groupColorConfig = effectiveGroupColor ? DURATION_GROUP_COLORS[effectiveGroupColor] : null;
              return (
              <div
                key={audio.id}
                id={`rec-audio-${audio.id}`}
                className="group relative"
                onContextMenu={(e) => handleContextMenu(e, 'audio', audio)}
              >
                {/* Top group color indicator */}
                {groupColorConfig && (
                  <div
                    className="absolute top-0 left-0 right-0 h-1 rounded-t-lg z-10"
                    style={{ backgroundColor: groupColorConfig.color }}
                  />
                )}
                <div className={`relative flex items-center gap-2 py-1 px-2 rounded-lg bg-violet-900/20 border border-violet-800/30 overflow-hidden ${groupColorConfig ? 'mt-1' : ''}`}>
                  <span className="w-4 h-4 bg-violet-500/30 border border-violet-400/50 text-violet-300 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0">
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
                  {/* Bottom color bar */}
                  {(recordingAudioColorsCache[audio.id] ?? []).length > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 flex h-[3px] pointer-events-none">
                      {(recordingAudioColorsCache[audio.id] ?? []).slice(0, 5).map(key => (
                        <div key={key} className="flex-1 h-full"
                          style={{ backgroundColor: IMAGE_COLORS[key as keyof typeof IMAGE_COLORS]?.hex ?? '#888' }} />
                      ))}
                    </div>
                  )}
                  {/* Tag count badge */}
                  {(recordingAudioTagCountMap[audio.id] ?? 0) > 0 && (
                    <span className="absolute top-1 right-7 text-[9px] bg-orange-500 text-white rounded-full px-1.5 py-0.5 leading-none pointer-events-none">
                      🏷️{recordingAudioTagCountMap[audio.id]}
                    </span>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        ) : (
          <p className="text-violet-400 dark:text-violet-500 italic text-sm">No audio recordings attached</p>
        )}
      </div>

      {/* Code Snippets */}
      <div className="mb-6 p-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800/50 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-violet-700 dark:text-violet-300">
            Code Snippets ({codeSnippets.length})
          </h2>
          <button
            onClick={handleAddCodeSnippet}
            className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300"
          >
            + Add
          </button>
        </div>
        {codeSnippets.length > 0 ? (
          <div className="space-y-2">
            {codeSnippets.map((snippet) => (
              <div key={snippet.id} id={`rec-code-${snippet.id}`}>
                <CodeSnippetCard
                  snippet={snippet}
                  onEdit={() => handleEditCodeSnippet(snippet)}
                  onDelete={() => handleDeleteCodeSnippet(snippet.id)}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-violet-400 dark:text-violet-500 italic text-sm">No code snippets for this section</p>
        )}
      </div>

      {/* Plans */}
      <div className="mb-6 p-4 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/50">
        <h2 className="text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-3">Plans</h2>
        <PlannerSection
          plans={recordingPlans.plans}
          loading={recordingPlans.loading}
          addPlan={recordingPlans.addPlan}
          updatePlan={recordingPlans.updatePlan}
          deletePlan={recordingPlans.deletePlan}
          toggleComplete={recordingPlans.toggleComplete}
        />
      </div>

      {/* Image lightbox */}
      {selectedImageIndex !== null && images[selectedImageIndex] && (
        <ImageLightbox
          images={images}
          selectedIndex={selectedImageIndex}
          onClose={() => setSelectedImageIndex(null)}
          onNavigate={(index) => setSelectedImageIndex(index)}
          onReplaceWithClipboard={handleReplaceImageWithClipboard}
          onEditCaption={() => {
            const img = images[selectedImageIndex!];
            if (img?.id) openCaptionModal('image', img.id, img.caption);
          }}
          onExtractOcr={selectedImageIndex !== null && images[selectedImageIndex]?.id ? async () => {
            const img = images[selectedImageIndex!];
            await window.electronAPI.ocr.extractCaption2('image', img.id!, img.file_path);
          } : undefined}
          mediaType="image"
          imageType="image"
          imageColors={selectedImageIndex !== null && images[selectedImageIndex]?.id ? recordingImageColorsCache[images[selectedImageIndex].id!] ?? [] : []}
          onToggleColor={selectedImageIndex !== null && images[selectedImageIndex]?.id ? (key) => handleToggleRecordingImageColor(images[selectedImageIndex!].id!, key) : undefined}
          audioColorsMap={recordingImageAudioColorsCache}
          onToggleAudioColor={handleToggleRecordingImageAudioColor}
          audioTagCountMap={recordingImageAudioTagCountMap}
          onAudioTagsChanged={(audioId) => {
            window.electronAPI.tags.getByMedia('image_audio', audioId)
              .then((tags: { name: string }[]) =>
                setRecordingImageAudioTagCountMap(prev => ({ ...prev, [audioId]: tags.length }))
              );
          }}
        />
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

          {/* Caption */}
          {(() => {
            const video = videos.find(v => v.file_path === selectedVideo);
            return video?.caption ? (
              <p className="absolute bottom-16 left-0 right-0 text-sm text-white/90 dark:text-white/80 text-center italic font-light max-w-2xl mx-auto px-4">
                {video.caption}
              </p>
            ) : null;
          })()}
        </div>
      )}

      {/* Duration Image lightbox */}
      {selectedDurationImageIndex !== null && activeDurationImages[selectedDurationImageIndex] && (
        <ImageLightbox
          images={activeDurationImages}
          selectedIndex={selectedDurationImageIndex}
          onClose={() => setSelectedDurationImageIndex(null)}
          onNavigate={(index) => setSelectedDurationImageIndex(index)}
          imageAudiosMap={imageAudiosMap}
          onRecordForImage={handleRecordForImage}
          onDeleteImageAudio={handleDeleteImageAudio}
          onPlayImageAudio={handlePlayImageAudio}
          onUpdateImageAudioCaption={handleUpdateImageAudioCaption}
          onReplaceWithClipboard={handleReplaceDurationImageWithClipboard}
          onEditCaption={() => {
            const img = activeDurationImages[selectedDurationImageIndex!];
            if (img?.id) openCaptionModal('durationImage', img.id, img.caption);
          }}
          onExtractOcr={selectedDurationImageIndex !== null && activeDurationImages[selectedDurationImageIndex]?.id ? async () => {
            const img = activeDurationImages[selectedDurationImageIndex!];
            await window.electronAPI.ocr.extractCaption2('duration_image', img.id!, img.file_path);
          } : undefined}
          mediaType="duration_image"
          onTagsChanged={(imageId, tagNames) => {
            setDurationImageTagsCache(prev => ({ ...prev, [imageId]: tagNames }));
          }}
          audioColorsMap={durationImageAudioColorsCache}
          onToggleAudioColor={handleToggleDurationImageAudioColor}
          audioTagCountMap={durationImageAudioTagCountMap}
          onAudioTagsChanged={(audioId) => {
            window.electronAPI.tags.getByMedia('duration_image_audio', audioId)
              .then((tags: { name: string }[]) =>
                setDurationImageAudioTagCountMap(prev => ({ ...prev, [audioId]: tags.length }))
              );
          }}
        />
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

          {/* Caption */}
          {(() => {
            const video = activeDurationVideos.find(v => v.file_path === selectedDurationVideoPath);
            return video?.caption ? (
              <p className="absolute bottom-16 left-0 right-0 text-sm text-white/90 dark:text-white/80 text-center italic font-light max-w-2xl mx-auto px-4">
                {video.caption}
              </p>
            ) : null;
          })()}
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
          {(contextMenu.type === 'audio' || contextMenu.type === 'durationAudio' ||
            contextMenu.type === 'video' || contextMenu.type === 'durationVideo') && (
            contextMenuShowColors ? (
              <div className="px-2 py-2">
                <div className="grid grid-cols-5 gap-1">
                  {IMAGE_COLOR_KEYS.map(key => {
                    const itemColors =
                      contextMenu.type === 'audio' ? (recordingAudioColorsCache[contextMenu.item.id] ?? []) :
                      contextMenu.type === 'durationAudio' ? (durationAudioColorsCache[contextMenu.item.id] ?? []) :
                      contextMenu.type === 'video' ? (videoColorsCache[contextMenu.item.id] ?? []) :
                      (durationVideoColorsCache[contextMenu.item.id] ?? []);
                    const active = itemColors.includes(key);
                    return (
                      <button
                        key={key}
                        title={IMAGE_COLORS[key].label}
                        onClick={() =>
                          contextMenu.type === 'audio' ? handleToggleRecordingAudioColor(contextMenu.item.id, key) :
                          contextMenu.type === 'durationAudio' ? handleToggleDurationAudioColor(contextMenu.item.id, key) :
                          contextMenu.type === 'video' ? handleToggleVideoColor(contextMenu.item.id, key) :
                          handleToggleDurationVideoColor(contextMenu.item.id, key)
                        }
                        className="w-6 h-6 rounded-full flex items-center justify-center relative border-2 transition-transform hover:scale-110"
                        style={{
                          backgroundColor: IMAGE_COLORS[key].hex,
                          borderColor: active ? 'white' : 'transparent',
                        }}
                      >
                        {active && <span className="text-white text-[10px] font-bold">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <button
                className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-hover flex items-center gap-2"
                onClick={(e) => { e.stopPropagation(); setContextMenuShowColors(true); }}
              >
                <span>🎨</span>
                Colors
              </button>
            )
          )}
          {(contextMenu.type === 'image' || contextMenu.type === 'durationImage' ||
            contextMenu.type === 'audio' || contextMenu.type === 'durationAudio' ||
            contextMenu.type === 'video' || contextMenu.type === 'durationVideo') && (
            <button
              className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-hover flex items-center gap-2"
              onClick={() => {
                const mediaType: MediaTagType =
                  contextMenu.type === 'image' ? 'image' :
                  contextMenu.type === 'durationImage' ? 'duration_image' :
                  contextMenu.type === 'audio' ? 'audio' :
                  contextMenu.type === 'durationAudio' ? 'duration_audio' :
                  contextMenu.type === 'video' ? 'video' : 'duration_video';
                setTagModal({ mediaType, mediaId: contextMenu.item.id, title: contextMenu.item.caption || 'Video' });
                setContextMenu(null);
              }}
            >
              <span>🏷️</span>
              Tags
            </button>
          )}
          {(contextMenu.type === 'image' || contextMenu.type === 'durationImage') && (
            <button
              className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-hover flex items-center gap-2"
              onClick={async () => {
                const imageType = contextMenu.type === 'image' ? 'image' : 'duration_image';
                setContextMenu(null);
                await window.electronAPI.ocr.extractCaption2(imageType, contextMenu.item.id, contextMenu.item.file_path);
              }}
            >
              <span>🔍</span>
              Extract OCR text
            </button>
          )}
          {(contextMenu.type === 'video' || contextMenu.type === 'durationVideo') &&
            contextMenu.item.file_path?.toLowerCase().endsWith('.mkv') && (
            <div className="px-3 py-1.5">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Convert MKV → MP4 (CRF)</p>
              <div className="flex gap-1">
                {([40, 35, 32, 28, 23] as const).map(crf => (
                  <button
                    key={crf}
                    className={`flex-1 py-1 text-xs font-medium text-white rounded
                      ${crf === 35 ? 'bg-blue-600' : 'bg-blue-500/80'} hover:brightness-110`}
                    onClick={() => {
                      const videoType = contextMenu.type === 'video' ? 'video' : 'durationVideo';
                      handleConvertMkvToMp4(contextMenu.item.id, videoType, contextMenu.item.file_path, crf);
                      setContextMenu(null);
                    }}
                  >
                    {crf}
                  </button>
                ))}
              </div>
            </div>
          )}
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

      {/* Tag Modal */}
      {tagModal && (
        <TagModal
          mediaType={tagModal.mediaType}
          mediaId={tagModal.mediaId}
          title={tagModal.title}
          onClose={() => {
            if (tagModal.mediaType === 'duration_image') {
              window.electronAPI.tags.getByMedia('duration_image', tagModal.mediaId)
                .then(tags => setDurationImageTagsCache(prev => ({
                  ...prev,
                  [tagModal.mediaId]: tags.map((t: { name: string }) => t.name),
                })));
            } else if (tagModal.mediaType === 'audio') {
              window.electronAPI.tags.getByMedia('audio', tagModal.mediaId)
                .then((tags: { name: string }[]) => setRecordingAudioTagCountMap(prev => ({
                  ...prev,
                  [tagModal.mediaId]: tags.length,
                })));
            } else if (tagModal.mediaType === 'duration_audio') {
              window.electronAPI.tags.getByMedia('duration_audio', tagModal.mediaId)
                .then((tags: { name: string }[]) => setDurationAudioTagCountMap(prev => ({
                  ...prev,
                  [tagModal.mediaId]: tags.length,
                })));
            } else if (tagModal.mediaType === 'video') {
              window.electronAPI.tags.getByMedia('video', tagModal.mediaId)
                .then((tags: { name: string }[]) => setVideoTagCountMap(prev => ({
                  ...prev,
                  [tagModal.mediaId]: tags.length,
                })));
            } else if (tagModal.mediaType === 'duration_video') {
              window.electronAPI.tags.getByMedia('duration_video', tagModal.mediaId)
                .then((tags: { name: string }[]) => setDurationVideoTagCountMap(prev => ({
                  ...prev,
                  [tagModal.mediaId]: tags.length,
                })));
            }
            setTagModal(null);
          }}
        />
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
              onChange={(e) => setCaptionText(e.target.value.slice(0, 500))}
              placeholder="Add a short caption..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg
                         bg-white dark:bg-dark-surface text-gray-900 dark:text-gray-100
                         focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              rows={4}
              autoFocus
              maxLength={500}
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 text-right">
              {captionText.length}/500
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

      {/* Code Snippet Modal */}
      {showCodeSnippetModal && (
        <CodeSnippetModal
          snippet={editingCodeSnippet}
          onSave={handleSaveCodeSnippet}
          onCancel={() => {
            setShowCodeSnippetModal(false);
            setEditingCodeSnippet(null);
          }}
        />
      )}

      {/* Duration Code Snippet Modal */}
      {showDurationCodeSnippetModal && editingDurationCodeSnippet && (
        <CodeSnippetModal
          snippet={editingDurationCodeSnippet.snippet}
          onSave={handleSaveDurationCodeSnippet}
          onCancel={() => {
            setShowDurationCodeSnippetModal(false);
            setEditingDurationCodeSnippet(null);
          }}
        />
      )}

      {/* Code Snippet Delete Confirmation */}
      <Modal
        isOpen={codeSnippetToDelete !== null}
        onClose={() => setCodeSnippetToDelete(null)}
        title="Delete Code Snippet"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-700 dark:text-gray-300">
            Are you sure you want to delete this code snippet? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCodeSnippetToDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDeleteCodeSnippet}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Duration Code Snippet Delete Confirmation */}
      <Modal
        isOpen={durationCodeSnippetToDelete !== null}
        onClose={() => setDurationCodeSnippetToDelete(null)}
        title="Delete Code Snippet"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-700 dark:text-gray-300">
            Are you sure you want to delete this code snippet? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDurationCodeSnippetToDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDeleteDurationCodeSnippet}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Screen Recording Modal */}
      {id && (
        <ScreenRecordingModal
          isOpen={isScreenRecording}
          onClose={() => {
            setIsScreenRecording(false);
            setAutoTriggerRegionSelection(false);
            setPendingRegion(null); // Clear pending region when modal closes
          }}
          recordingId={id}
          onSave={handleSaveScreenRecording}
          autoStartRegionSelection={autoTriggerRegionSelection}
          pendingRegion={pendingRegion}
        />
      )}
      </>)}

        </div>
      </div>
    </div>
  );
}
