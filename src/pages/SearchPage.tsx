import { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { useDurationAudioPlayer } from '../context/DurationAudioPlayerContext';
import { useRecordingAudioPlayer } from '../context/RecordingAudioPlayerContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useGlobalSearch } from '../hooks/useGlobalSearch';
import { useTabTitle } from '../hooks/useTabTitle';
import { TagBrowser } from '../components/tags/TagBrowser';
import { TagResultsView } from '../components/tags/TagResultsView';
import ImageLightbox from '../components/common/ImageLightbox';
import { TagModal } from '../components/common/TagModal';
import { useAudioRecording, AUDIO_SAVED_EVENT } from '../context/AudioRecordingContext';
import { useImageAudioPlayer } from '../context/ImageAudioPlayerContext';
import type {
  GlobalSearchResult,
  SearchNavState,
  DurationImage,
  DurationAudio,
  Audio,
  Duration,
  Recording,
  AnyImageAudio,
  MediaTagType,
} from '../types';

// ─── Local types ─────────────────────────────────────────────────────────────
type LightboxImage = { file_path: string; caption: string | null; id?: number };

// ─── Section config ───────────────────────────────────────────────────────────
const SECTION_ORDER: Array<{
  key: keyof ReturnType<typeof useGlobalSearch>['grouped'];
  label: string;
  icon: string;
}> = [
  { key: 'duration_image',       label: 'Mark-Level Images',    icon: '🖼️' },
  { key: 'image',                label: 'Recording-Level Images', icon: '🖼️' },
  { key: 'duration_audio',       label: 'Mark-Level Audios',    icon: '🔊' },
  { key: 'audio',                label: 'Recording-Level Audios', icon: '🔊' },
  { key: 'duration',             label: 'Mark Notes',           icon: '🔖' },
  { key: 'recording',            label: 'Recording Notes',      icon: '🎙️' },
  { key: 'topic',                label: 'Topics',               icon: '📁' },
  { key: 'duration_video',       label: 'Mark Videos',          icon: '🎬' },
  { key: 'video',                label: 'Recording Videos',     icon: '🎬' },
  { key: 'duration_code_snippet',label: 'Mark Code',            icon: '💻' },
  { key: 'code_snippet',         label: 'Recording Code',       icon: '💻' },
  { key: 'audio_marker',        label: 'Audio Markers',         icon: '📌' },
  { key: 'duration_image_audio', label: 'Image Audios (Mark)',  icon: '🔊' },
  { key: 'image_audio',          label: 'Image Audios',         icon: '🔊' },
  { key: 'quick_capture_image',  label: 'Capture Images',       icon: '📸' },
];

const MARKER_COLORS: Record<string, string> = {
  important: 'bg-rose-500 text-white',
  question: 'bg-amber-500 text-white',
  similar_question: 'bg-sky-500 text-white',
};

const MARKER_LABELS: Record<string, string> = {
  important: 'Important',
  question: 'Question',
  similar_question: 'Similar Q',
};

// ─── Preview helpers ──────────────────────────────────────────────────────────

type PreviewKind =
  | 'duration_image'
  | 'duration_audio'
  | 'audio'
  | 'duration_note'
  | 'recording_note';

type PreviewData =
  | { kind: 'duration_image'; images: DurationImage[] }
  | { kind: 'duration_audio'; audios: DurationAudio[] }
  | { kind: 'audio'; audios: Audio[] }
  | { kind: 'duration_note'; html: string }
  | { kind: 'recording_note'; html: string };

function getPreviewKind(result: GlobalSearchResult): PreviewKind | null {
  switch (result.content_type) {
    case 'duration_image':
      return result.duration_id !== null ? 'duration_image' : null;
    case 'duration_audio':
      return result.duration_id !== null ? 'duration_audio' : null;
    case 'audio':
      return result.recording_id !== null ? 'audio' : null;
    case 'duration':
      return result.duration_id !== null ? 'duration_note' : null;
    case 'recording':
      return result.recording_id !== null ? 'recording_note' : null;
    default:
      return null;
  }
}

async function fetchPreviewData(
  result: GlobalSearchResult,
  kind: PreviewKind,
): Promise<PreviewData> {
  switch (kind) {
    case 'duration_image': {
      const all = await window.electronAPI.durationImages.getByDuration(result.duration_id!);
      const images = all.filter(img => img.id === result.source_id);
      return { kind: 'duration_image', images };
    }
    case 'duration_audio': {
      const all = await window.electronAPI.durationAudios.getByDuration(result.duration_id!);
      const audios = all.filter(a => a.id === result.source_id);
      return { kind: 'duration_audio', audios };
    }
    case 'audio': {
      const all = await window.electronAPI.audios.getByRecording(result.recording_id!);
      const audios = all.filter(a => a.id === result.source_id);
      return { kind: 'audio', audios };
    }
    case 'duration_note': {
      const durations = await window.electronAPI.durations.getByRecording(result.recording_id!) as Duration[];
      const duration = durations.find(d => d.id === result.duration_id);
      return { kind: 'duration_note', html: duration?.note ?? '' };
    }
    case 'recording_note': {
      const recording = await window.electronAPI.recordings.getById(result.recording_id!) as Recording;
      return { kind: 'recording_note', html: recording.notes_content ?? '' };
    }
  }
}

function formatAudioDuration(seconds: number | null): string {
  if (seconds === null) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Expanded preview sub-component ──────────────────────────────────────────

interface ExpandedPreviewProps {
  data: PreviewData | null;
  loading: boolean;
  error: boolean;
  onOpenLightbox?: (images: LightboxImage[], index: number) => void;
}

function ExpandedPreview({ data, loading, error, onOpenLightbox }: ExpandedPreviewProps) {
  const [noteExpanded, setNoteExpanded] = useState(false);
  const noteRef = useRef<HTMLDivElement>(null);
  const [noteOverflows, setNoteOverflows] = useState(false);
  const durationAudioPlayer = useDurationAudioPlayer();
  const recordingAudioPlayer = useRecordingAudioPlayer();

  useEffect(() => {
    if (noteRef.current) {
      setNoteOverflows(noteRef.current.scrollHeight > noteRef.current.clientHeight + 4);
    }
  }, [data]);

  const panelBase =
    'border-t border-gray-100 dark:border-dark-border bg-gray-50 dark:bg-dark-surface px-3 py-3';

  if (loading) {
    return (
      <div className={`${panelBase} flex justify-center`}>
        <svg className="w-5 h-5 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (error || data === null) {
    return (
      <div className={panelBase}>
        <p className="text-xs text-gray-400 dark:text-gray-500">Failed to load preview</p>
      </div>
    );
  }

  if (data.kind === 'duration_image') {
    if (data.images.length === 0) {
      return (
        <div className={panelBase}>
          <p className="text-xs text-gray-400 dark:text-gray-500">No images</p>
        </div>
      );
    }
    const lbImages: LightboxImage[] = data.images.map(img => ({
      file_path: img.file_path,
      caption: img.caption,
      id: img.id,
    }));
    return (
      <div className={panelBase}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {data.images.map((img, idx) => {
            const thumbSrc = window.electronAPI.paths.getFileUrl(img.thumbnail_path ?? img.file_path);
            return (
              <div key={img.id} className="flex flex-col gap-1">
                <div
                  className="aspect-square rounded overflow-hidden cursor-pointer bg-gray-100 dark:bg-dark-hover"
                  onClick={() => onOpenLightbox?.(lbImages, idx)}
                >
                  <img
                    src={thumbSrc}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-150"
                    loading="lazy"
                  />
                </div>
                {img.caption && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{img.caption}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (data.kind === 'duration_audio') {
    const audios = data.audios;
    if (audios.length === 0) return <div className={panelBase}><p className="text-xs text-gray-400 dark:text-gray-500">No audio files</p></div>;
    return (
      <div className={`${panelBase} space-y-1`}>
        {audios.map((a, i) => (
          <button key={a.id} onClick={async () => { const markers = await window.electronAPI.audioMarkers.getByAudio(a.id, 'duration'); durationAudioPlayer.play(a, a.caption || `Audio ${i + 1}`, markers); }}
            className="w-full flex items-center gap-2 px-2 py-2 rounded-lg bg-gray-100 dark:bg-dark-hover hover:bg-gray-200 dark:hover:bg-dark-border text-left transition-colors group">
            <span className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full bg-blue-600 group-hover:bg-blue-500 text-white"><svg className="w-3 h-3 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg></span>
            <span className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1">{a.caption || `Audio ${i + 1}`}</span>
            {a.duration !== null && <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">{formatAudioDuration(a.duration)}</span>}
          </button>
        ))}
      </div>
    );
  }

  if (data.kind === 'audio') {
    const audios = data.audios;
    if (audios.length === 0) return <div className={panelBase}><p className="text-xs text-gray-400 dark:text-gray-500">No audio files</p></div>;
    return (
      <div className={`${panelBase} space-y-1`}>
        {audios.map((a, i) => (
          <button key={a.id} onClick={async () => { const markers = await window.electronAPI.audioMarkers.getByAudio(a.id, 'recording'); recordingAudioPlayer.play(a, a.caption || `Audio ${i + 1}`, markers); }}
            className="w-full flex items-center gap-2 px-2 py-2 rounded-lg bg-gray-100 dark:bg-dark-hover hover:bg-gray-200 dark:hover:bg-dark-border text-left transition-colors group">
            <span className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full bg-violet-600 group-hover:bg-violet-500 text-white"><svg className="w-3 h-3 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg></span>
            <span className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1">{a.caption || `Audio ${i + 1}`}</span>
            {a.duration !== null && <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">{formatAudioDuration(a.duration)}</span>}
          </button>
        ))}
      </div>
    );
  }

  if (data.kind === 'duration_note' || data.kind === 'recording_note') {
    const html = data.html;
    if (!html) {
      return (
        <div className={panelBase}>
          <p className="text-xs text-gray-400 dark:text-gray-500">No note</p>
        </div>
      );
    }
    return (
      <div className={panelBase}>
        <div className="bg-amber-50 dark:bg-amber-900/10 rounded-lg p-3">
          <div
            ref={noteRef}
            className={`notes-content text-sm text-gray-700 dark:text-gray-300 transition-all overflow-hidden ${noteExpanded ? '' : 'max-h-24'}`}
            dangerouslySetInnerHTML={{ __html: html }}
          />
          {(noteOverflows || noteExpanded) && (
            <button
              onClick={() => setNoteExpanded(e => !e)}
              className="mt-1.5 text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
            >
              {noteExpanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}

// ─── Result card ──────────────────────────────────────────────────────────────
function Breadcrumb({ result }: { result: GlobalSearchResult }) {
  const parts: string[] = [];
  if (result.topic_name) parts.push(result.topic_name);
  if (result.recording_name) parts.push(result.recording_name);
  if (!parts.length) return null;
  return (
    <div className="text-xs text-gray-400 dark:text-gray-500 mb-1 truncate">
      {parts.join(' › ')}
    </div>
  );
}

function Snippet({ html }: { html: string }) {
  return (
    <p
      className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed [&_mark]:bg-yellow-200 [&_mark]:dark:bg-yellow-700 [&_mark]:rounded-sm [&_mark]:px-0.5"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

const CONTEXT_MENU_TYPES = new Set(['duration_image', 'image', 'duration_audio', 'audio', 'quick_capture_image']);

interface ResultCardProps {
  result: GlobalSearchResult;
  onNavigate: (result: GlobalSearchResult) => void;
}

function ResultCard({ result, onNavigate }: ResultCardProps) {
  const hasNav = result.recording_id !== null;
  const previewKind = getPreviewKind(result);
  const supportsContextMenu = CONTEXT_MENU_TYPES.has(result.content_type);
  const isImageType = result.content_type === 'duration_image' || result.content_type === 'image' || result.content_type === 'quick_capture_image';

  const [isExpanded, setIsExpanded] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const hasFetched = useRef(false);

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Caption modal — 'card' = editing result card item, 'lightbox' = editing current lightbox image
  const [captionModal, setCaptionModal] = useState<boolean>(false);
  const [captionTarget, setCaptionTarget] = useState<'card' | 'lightbox'>('card');
  const [captionText, setCaptionText] = useState('');

  // Tag modal
  const [showTagModal, setShowTagModal] = useState(false);

  // Deleted state
  const [isDeleted, setIsDeleted] = useState(false);

  // Lightbox + image audio
  const [lightbox, setLightbox] = useState<{ images: LightboxImage[]; index: number } | null>(null);
  const [imageAudiosMap, setImageAudiosMap] = useState<Record<number, AnyImageAudio[]>>({});

  const audioRecording = useAudioRecording();
  const imageAudioPlayer = useImageAudioPlayer();

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contextMenu]);

  // Refresh image audios when audio saved
  const fetchImageAudios = useCallback(async (images: LightboxImage[]) => {
    const isRecordingImage = result.content_type === 'image';
    const isCaptureImage = result.content_type === 'quick_capture_image';
    const entries = await Promise.all(
      images
        .filter(img => img.id !== undefined)
        .map(async img => {
          let audios: AnyImageAudio[];
          if (isRecordingImage) {
            audios = await window.electronAPI.imageAudios.getByImage(img.id!);
          } else if (isCaptureImage) {
            audios = await window.electronAPI.captureImageAudios.getByImage(img.id!);
          } else {
            audios = await window.electronAPI.durationImageAudios.getByDurationImage(img.id!);
          }
          return [img.id!, audios] as [number, AnyImageAudio[]];
        })
    );
    setImageAudiosMap(Object.fromEntries(entries));
  }, [result.content_type]);

  useEffect(() => {
    if (!lightbox) return;
    const refresh = () => fetchImageAudios(lightbox.images);
    window.addEventListener(AUDIO_SAVED_EVENT, refresh);
    return () => window.removeEventListener(AUDIO_SAVED_EVENT, refresh);
  }, [lightbox, fetchImageAudios]);

  const handleToggle = useCallback(() => {
    if (!previewKind) return;
    setIsExpanded(prev => {
      const next = !prev;
      if (next && !hasFetched.current) {
        hasFetched.current = true;
        setPreviewLoading(true);
        setPreviewError(false);
        fetchPreviewData(result, previewKind)
          .then(data => setPreviewData(data))
          .catch(() => setPreviewError(true))
          .finally(() => setPreviewLoading(false));
      }
      return next;
    });
  }, [previewKind, result]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (!supportsContextMenu) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, [supportsContextMenu]);

  const handleOpenCaptionModal = useCallback(() => {
    setContextMenu(null);
    setCaptionTarget('card');
    setCaptionText(result.snippet.replace(/<[^>]*>/g, '') || '');
    setCaptionModal(true);
  }, [result.snippet]);

  const handleSaveCaption = useCallback(async () => {
    const cap = captionText.trim() || null;
    try {
      switch (result.content_type) {
        case 'duration_image':
          await window.electronAPI.durationImages.updateCaption(result.source_id, cap);
          break;
        case 'image':
          await window.electronAPI.media.updateImageCaption(result.source_id, cap);
          break;
        case 'duration_audio':
          await window.electronAPI.durationAudios.updateCaption(result.source_id, cap);
          break;
        case 'audio':
          await window.electronAPI.audios.updateCaption(result.source_id, cap);
          break;
        case 'quick_capture_image':
          await window.electronAPI.quickCaptures.updateImageCaption(result.source_id, cap);
          break;
      }
    } finally {
      setCaptionModal(false);
    }
  }, [captionText, result.content_type, result.source_id]);

  const handleDelete = useCallback(async () => {
    setContextMenu(null);
    if (!window.confirm('Delete this item?')) return;
    switch (result.content_type) {
      case 'duration_image':
        await window.electronAPI.durationImages.delete(result.source_id);
        break;
      case 'image':
        await window.electronAPI.media.deleteImage(result.source_id);
        break;
      case 'duration_audio':
        await window.electronAPI.durationAudios.delete(result.source_id);
        break;
      case 'audio':
        await window.electronAPI.audios.delete(result.source_id);
        break;
      case 'quick_capture_image':
        await window.electronAPI.quickCaptures.deleteImage(result.source_id);
        break;
    }
    setIsDeleted(true);
  }, [result.content_type, result.source_id]);

  const handleOpenLightbox = useCallback((images: LightboxImage[], index: number) => {
    setLightbox({ images, index });
    fetchImageAudios(images);
  }, [fetchImageAudios]);

  const handleRecordForImage = useCallback((imageId: number) => {
    const label = result.snippet.replace(/<[^>]*>/g, '').slice(0, 40) || 'Image';
    if (result.content_type === 'image') {
      audioRecording.startRecording({
        type: 'recording_image',
        imageId,
        recordingId: result.recording_id!,
        label,
      });
    } else if (result.content_type === 'quick_capture_image') {
      audioRecording.startRecording({
        type: 'capture_image',
        captureImageId: imageId,
        label,
      });
    } else {
      audioRecording.startRecording({
        type: 'duration_image',
        durationImageId: imageId,
        durationId: result.duration_id!,
        recordingId: result.recording_id!,
        label,
      });
    }
  }, [result, audioRecording]);

  const handlePlayImageAudio = useCallback(async (audio: AnyImageAudio, label: string) => {
    const audioType = result.content_type === 'image' ? 'recording_image'
      : result.content_type === 'quick_capture_image' ? 'capture_image'
      : 'duration_image';
    const markers = await window.electronAPI.audioMarkers.getByAudio(audio.id, audioType);
    imageAudioPlayer.play(
      audio,
      label,
      markers,
      (id, cap) => result.content_type === 'image'
        ? window.electronAPI.imageAudios.updateCaption(id, cap)
        : result.content_type === 'quick_capture_image'
        ? window.electronAPI.captureImageAudios.updateCaption(id, cap)
        : window.electronAPI.durationImageAudios.updateCaption(id, cap),
    );
  }, [result.content_type, imageAudioPlayer]);

  const handleDeleteImageAudio = useCallback(async (audioId: number, imageId: number) => {
    if (result.content_type === 'image') {
      await window.electronAPI.imageAudios.delete(audioId);
    } else if (result.content_type === 'quick_capture_image') {
      await window.electronAPI.captureImageAudios.delete(audioId);
    } else {
      await window.electronAPI.durationImageAudios.delete(audioId);
    }
    setImageAudiosMap(prev => ({
      ...prev,
      [imageId]: (prev[imageId] ?? []).filter(a => a.id !== audioId),
    }));
  }, [result.content_type]);

  const handleUpdateImageAudioCaption = useCallback(async (audioId: number, imageId: number, cap: string | null) => {
    if (result.content_type === 'image') {
      await window.electronAPI.imageAudios.updateCaption(audioId, cap);
    } else if (result.content_type === 'quick_capture_image') {
      await window.electronAPI.captureImageAudios.updateCaption(audioId, cap);
    } else {
      await window.electronAPI.durationImageAudios.updateCaption(audioId, cap);
    }
    setImageAudiosMap(prev => ({
      ...prev,
      [imageId]: (prev[imageId] ?? []).map(a => a.id === audioId ? { ...a, caption: cap } : a),
    }));
  }, [result.content_type]);

  // Edit caption for the currently open lightbox image
  const handleEditLightboxImageCaption = useCallback(() => {
    if (!lightbox) return;
    const img = lightbox.images[lightbox.index];
    setCaptionTarget('lightbox');
    setCaptionText(img.caption ?? '');
    setCaptionModal(true);
  }, [lightbox]);

  // Caption save routes to the currently open lightbox image (not result.source_id)
  const handleSaveLightboxImageCaption = useCallback(async () => {
    if (!lightbox) return;
    const img = lightbox.images[lightbox.index];
    if (!img.id) return;
    const cap = captionText.trim() || null;
    try {
      if (result.content_type === 'image') {
        await window.electronAPI.media.updateImageCaption(img.id, cap);
      } else if (result.content_type === 'quick_capture_image') {
        await window.electronAPI.quickCaptures.updateImageCaption(img.id, cap);
      } else {
        await window.electronAPI.durationImages.updateCaption(img.id, cap);
      }
      // Update caption in lightbox images array
      setLightbox(lb => {
        if (!lb) return lb;
        const imgs = lb.images.map((im, i) => i === lb.index ? { ...im, caption: cap } : im);
        return { ...lb, images: imgs };
      });
    } finally {
      setCaptionModal(false);
    }
  }, [lightbox, captionText, result.content_type]);

  // Delete the currently open lightbox image
  const handleDeleteLightboxImage = useCallback(async () => {
    if (!lightbox) return;
    const img = lightbox.images[lightbox.index];
    if (!img.id) return;
    if (!window.confirm('Delete this image?')) return;
    if (result.content_type === 'image') {
      await window.electronAPI.media.deleteImage(img.id);
    } else if (result.content_type === 'quick_capture_image') {
      await window.electronAPI.quickCaptures.deleteImage(img.id);
    } else {
      await window.electronAPI.durationImages.delete(img.id);
    }
    const remaining = lightbox.images.filter((_, i) => i !== lightbox.index);
    if (remaining.length === 0) {
      setLightbox(null);
      setIsDeleted(true);
    } else {
      setLightbox({ images: remaining, index: Math.min(lightbox.index, remaining.length - 1) });
    }
  }, [lightbox, result.content_type]);

  if (isDeleted) return null;

  return (
    <div className="group">
      {/* Clickable card body */}
      <div
        className={`flex gap-3 p-3 hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors${previewKind || isImageType ? ' cursor-pointer' : ''}`}
        onClick={isImageType
          ? () => result.file_path && handleOpenLightbox([{ file_path: result.file_path, caption: result.snippet.replace(/<[^>]*>/g, '') || null, id: result.source_id }], 0)
          : previewKind ? handleToggle : undefined}
        onContextMenu={handleContextMenu}
      >
        {/* Thumbnail for image types */}
        {result.thumbnail_path && (
          <img
            src={window.electronAPI.paths.getFileUrl(result.thumbnail_path)}
            className="w-16 h-16 object-cover rounded flex-shrink-0"
            loading="lazy"
          />
        )}
        {/* File icon for non-thumbnail media */}
        {!result.thumbnail_path && result.file_path && (
          <div className="w-10 h-10 rounded bg-gray-100 dark:bg-dark-surface flex items-center justify-center flex-shrink-0 text-lg">
            {result.content_type.includes('audio') ? '🔊' : '📄'}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <Breadcrumb result={result} />

          {/* Marker type badge */}
          {result.marker_type && (
            <span className={`inline-block text-xs px-1.5 py-0.5 rounded mr-2 mb-1 font-medium ${MARKER_COLORS[result.marker_type] ?? 'bg-gray-200 text-gray-700'}`}>
              {MARKER_LABELS[result.marker_type] ?? result.marker_type}
            </span>
          )}

          <Snippet html={result.snippet} />

          {/* Code preview */}
          {result.code && (
            <pre className="mt-1 text-xs bg-gray-100 dark:bg-dark-surface rounded p-2 overflow-x-auto max-h-24 text-gray-600 dark:text-gray-300 font-mono">
              {result.code.slice(0, 400)}{result.code.length > 400 ? '…' : ''}
            </pre>
          )}
        </div>

        {/* Chevron indicator — only for non-image expandable types */}
        {previewKind && !isImageType && (
          <svg
            className={`w-4 h-4 flex-shrink-0 text-gray-400 dark:text-gray-500 self-center transition-transform duration-150${isExpanded ? ' rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}

        {/* Navigate link */}
        {hasNav && (
          <button
            onClick={e => { e.stopPropagation(); onNavigate(result); }}
            className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity self-center p-1.5 rounded hover:bg-gray-200 dark:hover:bg-dark-border text-gray-500 dark:text-gray-400"
            title="Open recording"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
        )}
      </div>

      {/* Expansion panel */}
      {isExpanded && (
        <ExpandedPreview
          data={previewData}
          loading={previewLoading}
          error={previewError}
          onOpenLightbox={handleOpenLightbox}
        />
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-lg shadow-lg py-1 min-w-[160px]"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 180),
            top: Math.min(contextMenu.y, window.innerHeight - 130),
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-dark-hover flex items-center gap-2"
            onClick={handleOpenCaptionModal}
          >
            <span>✏️</span> Add Caption
          </button>
          <button
            className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-dark-hover flex items-center gap-2"
            onClick={() => { setContextMenu(null); setShowTagModal(true); }}
          >
            <span>🏷️</span> Tags
          </button>
          <div className="border-t border-gray-100 dark:border-dark-border my-1" />
          <button
            className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-gray-100 dark:hover:bg-dark-hover flex items-center gap-2"
            onClick={handleDelete}
          >
            <span>🗑️</span> Delete
          </button>
        </div>
      )}

      {/* Caption modal */}
      {captionModal && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50"
          onClick={() => setCaptionModal(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-[360px] max-w-[90vw] p-5"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">✏️ Caption</p>
            <input
              type="text"
              autoFocus
              value={captionText}
              onChange={e => setCaptionText(e.target.value)}
              onKeyDown={e => {
                const save = captionTarget === 'lightbox' ? handleSaveLightboxImageCaption : handleSaveCaption;
                if (e.key === 'Enter') save();
                if (e.key === 'Escape') setCaptionModal(false);
              }}
              placeholder="Add a caption…"
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 outline-none focus:border-blue-400 dark:focus:border-blue-500"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setCaptionModal(false)}
                className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-dark-hover rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={captionTarget === 'lightbox' ? handleSaveLightboxImageCaption : handleSaveCaption}
                className="px-3 py-1.5 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tag modal */}
      {showTagModal && (
        <TagModal
          mediaType={result.content_type as MediaTagType}
          mediaId={result.source_id}
          title="Tags"
          onClose={() => setShowTagModal(false)}
        />
      )}

      {/* Image lightbox with audio */}
      {lightbox && (result.content_type === 'duration_image' || result.content_type === 'image' || result.content_type === 'quick_capture_image') && (
        <ImageLightbox
          images={lightbox.images}
          selectedIndex={lightbox.index}
          onClose={() => { setLightbox(null); setImageAudiosMap({}); }}
          onNavigate={i => setLightbox(lb => lb ? { ...lb, index: i } : null)}
          imageAudiosMap={imageAudiosMap}
          onRecordForImage={result.recording_id !== null || result.content_type === 'quick_capture_image' ? handleRecordForImage : undefined}
          onDeleteImageAudio={handleDeleteImageAudio}
          onPlayImageAudio={handlePlayImageAudio}
          onUpdateImageAudioCaption={handleUpdateImageAudioCaption}
          onEditCaption={handleEditLightboxImageCaption}
          onDelete={handleDeleteLightboxImage}
          mediaType={result.content_type as MediaTagType}
        />
      )}
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────
const INITIAL_SHOW = 5;

function ResultSection({
  label,
  icon,
  items,
  onNavigate,
}: {
  label: string;
  icon: string;
  items: GlobalSearchResult[];
  onNavigate: (result: GlobalSearchResult) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, INITIAL_SHOW);

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">{icon}</span>
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{label}</h3>
        <span className="text-xs text-gray-400 dark:text-gray-500">({items.length})</span>
      </div>
      <div className="border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-dark-border">
        {visible.map((r, i) => (
          <ResultCard key={`${r.content_type}-${r.source_id}-${i}`} result={r} onNavigate={onNavigate} />
        ))}
      </div>
      {items.length > INITIAL_SHOW && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="mt-2 text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
        >
          {expanded ? 'Show less' : `Show all ${items.length} results`}
        </button>
      )}
    </section>
  );
}


// ─── SearchPage ───────────────────────────────────────────────────────────────
export default function SearchPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [showTagBrowser, setShowTagBrowser] = useState(false);
  const [activeTags, setActiveTags] = useState<string[]>([]);

  const {
    query, setQuery,
    results,
    grouped,
    loading, isTyping, hasQuery,
    activeQuery,
    totalCount, categoriesWithResults,
  } = useGlobalSearch();
  useTabTitle(query ? `Search: ${query}` : 'Search');

  // Pre-populate from ?q= URL param on mount
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) setQuery(q);
    // Autofocus
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const navigableResults = useMemo(
    () => results.filter(r => r.recording_id !== null),
    [results],
  );

  const handleNavigate = useCallback((result: GlobalSearchResult) => {
    if (!result.recording_id) return;
    const navIndex = navigableResults.findIndex(
      r => r.source_id === result.source_id && r.content_type === result.content_type,
    );
    const navState: SearchNavState = {
      results: navigableResults,
      currentIndex: navIndex >= 0 ? navIndex : 0,
      query: activeQuery,
    };
    navigate(`/recording/${result.recording_id}`, { state: { searchNav: navState } });
  }, [navigate, navigableResults, activeQuery]);

  const handleTagClick = useCallback((tagName: string) => {
    setActiveTags(prev => prev.includes(tagName) ? prev.filter(t => t !== tagName) : [...prev, tagName]);
  }, []);

  const sectionsWithResults = SECTION_ORDER.filter(s => grouped[s.key].length > 0);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Search input */}
      <div className="relative mb-3">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setActiveTags([]); }}
          placeholder="Search marks, images, audios, code, notes…"
          className="w-full pl-12 pr-4 py-3 text-base rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 shadow-sm"
          autoComplete="off"
          spellCheck={false}
        />
        {(loading || isTyping) && (
          <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
      </div>

      {/* Tag browser toggle */}
      <div className="flex items-center gap-2 mb-5">
        <button
          onClick={() => { setShowTagBrowser(v => !v); if (showTagBrowser) setActiveTags([]); }}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border transition-colors ${showTagBrowser ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300' : 'border-gray-200 dark:border-dark-border text-gray-500 dark:text-gray-400 hover:border-blue-300 dark:hover:border-blue-600'}`}
        >
          🏷️ Browse by Tag
          <span className={`text-[10px] transition-transform ${showTagBrowser ? 'rotate-180' : ''}`}>▾</span>
        </button>
        {activeTags.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs text-gray-400">Showing:</span>
            {activeTags.map(tag => (
              <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700">
                #{tag}
                <button className="hover:text-blue-900 dark:hover:text-blue-100" onClick={() => setActiveTags(prev => prev.filter(t => t !== tag))}>×</button>
              </span>
            ))}
            {activeTags.length > 1 && (
              <button onClick={() => setActiveTags([])} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 ml-1">clear all</button>
            )}
          </div>
        )}
      </div>

      {/* Tag browser panel */}
      {showTagBrowser && (
        <div className="mb-5 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface overflow-hidden" style={{ maxHeight: '300px' }}>
          <TagBrowser onTagClick={handleTagClick} />
        </div>
      )}

      {/* Tag results */}
      {activeTags.length > 0 && (
        <TagResultsView
          tagNames={activeTags}
          onNavigate={(recordingId) => navigate(`/recording/${recordingId}`)}
        />
      )}

      {/* Text search results (hidden while browsing by tag) */}
      {activeTags.length === 0 && (
        <>
          {/* Summary bar */}
          {hasQuery && !loading && !isTyping && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              {totalCount === 0
                ? 'No results found'
                : `${totalCount} result${totalCount !== 1 ? 's' : ''} across ${categoriesWithResults} categor${categoriesWithResults !== 1 ? 'ies' : 'y'}`}
            </p>
          )}

          {/* Empty state */}
          {!hasQuery && !showTagBrowser && (
            <div className="text-center py-16 text-gray-400 dark:text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="text-sm">Search across all marks, images, audios, videos, code and notes</p>
              <p className="text-xs mt-1 opacity-70">Prefix matching enabled — type partial words</p>
            </div>
          )}

          {/* Results */}
          {sectionsWithResults.map(({ key, label, icon }) => (
            <ResultSection
              key={key}
              label={label}
              icon={icon}
              items={grouped[key]}
              onNavigate={handleNavigate}
            />
          ))}
        </>
      )}
    </div>
  );
}
