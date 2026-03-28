import { useState, useRef, useEffect, useCallback } from 'react';
import type { QuickCapture, QuickCaptureImage, QuickCaptureAudio, DurationColor, DurationGroupColor, AnyImageAudio } from '../../types';
import SortableImageGrid from '../common/SortableImageGrid';
import type { SortableImageItem } from '../common/SortableImageGrid';
import ImageLightbox from '../common/ImageLightbox';
import { TagModal } from '../common/TagModal';
import { useImageAudioPlayer } from '../../context/ImageAudioPlayerContext';
import { useAudioRecording, AUDIO_SAVED_EVENT } from '../../context/AudioRecordingContext';

interface CaptureItemProps {
  capture: QuickCapture;
  onDelete: (id: number) => void;
  expiresInDays?: number;
}

type ContextMenuState =
  | { kind: 'image'; item: QuickCaptureImage; x: number; y: number }
  | { kind: 'audio'; item: QuickCaptureAudio; x: number; y: number }
  | null;

type CaptionModalState =
  | { kind: 'image'; id: number; current: string | null }
  | { kind: 'audio'; id: number; current: string | null }
  | null;

type TagModalState =
  | { kind: 'image'; id: number }
  | { kind: 'audio'; id: number }
  | null;

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const iso = dateStr.replace(' ', 'T') + (dateStr.includes('Z') ? '' : 'Z');
  const then = new Date(iso).getTime();
  const diff = now - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}

export default function CaptureItem({ capture, onDelete, expiresInDays }: CaptureItemProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [captureImageAudiosMap, setCaptureImageAudiosMap] = useState<Record<number, AnyImageAudio[]>>({});
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

  const imageAudioPlayer = useImageAudioPlayer();
  const audioRecording = useAudioRecording();
  const [captionModal, setCaptionModal] = useState<CaptionModalState>(null);
  const [captionText, setCaptionText] = useState('');
  const [tagModal, setTagModal] = useState<TagModalState>(null);
  const [localAudios, setLocalAudios] = useState<QuickCaptureAudio[]>(capture.audios);
  const audioRefs = useRef<(HTMLAudioElement | null)[]>([]);

  // Map QuickCaptureImage → SortableImageItem (color: null = no color bars)
  const [localImages, setLocalImages] = useState<SortableImageItem[]>(() =>
    capture.images.map(img => ({
      ...img,
      color: null as DurationColor,
      group_color: null as DurationGroupColor,
    }))
  );

  // Merge newly added images/audios when the capture prop updates
  useEffect(() => {
    setLocalImages(prev => {
      const prevIds = new Set(prev.map(i => i.id));
      const added = capture.images.filter(img => !prevIds.has(img.id));
      if (added.length === 0) return prev;
      return [
        ...prev,
        ...added.map(img => ({ ...img, color: null as DurationColor, group_color: null as DurationGroupColor })),
      ];
    });
  }, [capture.images]);

  useEffect(() => {
    setLocalAudios(prev => {
      const prevIds = new Set(prev.map(a => a.id));
      const added = capture.audios.filter(a => !prevIds.has(a.id));
      if (added.length === 0) return prev;
      return [...prev, ...added];
    });
  }, [capture.audios]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [contextMenu]);

  const fetchCaptureImageAudios = useCallback(async (images: SortableImageItem[]) => {
    const map: Record<number, AnyImageAudio[]> = {};
    await Promise.all(images.map(async (img) => {
      map[img.id] = await window.electronAPI.captureImageAudios.getByImage(img.id);
    }));
    setCaptureImageAudiosMap(map);
  }, []);

  const openLightbox = useCallback(async (index: number) => {
    setLightboxIndex(index);
    await fetchCaptureImageAudios(localImages);
  }, [localImages, fetchCaptureImageAudios]);

  // Refresh audio map after recording
  useEffect(() => {
    if (lightboxIndex === null) return;
    const refresh = () => fetchCaptureImageAudios(localImages);
    window.addEventListener(AUDIO_SAVED_EVENT, refresh);
    return () => window.removeEventListener(AUDIO_SAVED_EVENT, refresh);
  }, [lightboxIndex, localImages, fetchCaptureImageAudios]);

  const currentLightboxImage = lightboxIndex !== null ? localImages[lightboxIndex] : null;

  const handlePlayCaptureImageAudio = useCallback(async (audio: AnyImageAudio, label: string) => {
    const markers = await window.electronAPI.audioMarkers.getByAudio(audio.id, 'capture_image');
    imageAudioPlayer.play(
      audio,
      label,
      markers,
      (id, cap) => window.electronAPI.captureImageAudios.updateCaption(id, cap),
    );
  }, [imageAudioPlayer]);

  const handleRecordForCaptureImage = useCallback((imageId: number) => {
    if (!currentLightboxImage) return;
    audioRecording.startRecording({
      type: 'capture_image',
      captureImageId: imageId,
      label: currentLightboxImage.caption || 'Capture Image',
    });
  }, [currentLightboxImage, audioRecording]);

  const handleDeleteCaptureImageAudio = useCallback(async (audioId: number, imageId: number) => {
    await window.electronAPI.captureImageAudios.delete(audioId);
    setCaptureImageAudiosMap(prev => ({
      ...prev,
      [imageId]: (prev[imageId] ?? []).filter(a => a.id !== audioId),
    }));
  }, []);

  const handleUpdateCaptureImageAudioCaption = useCallback(async (audioId: number, imageId: number, cap: string | null) => {
    await window.electronAPI.captureImageAudios.updateCaption(audioId, cap);
    setCaptureImageAudiosMap(prev => ({
      ...prev,
      [imageId]: (prev[imageId] ?? []).map(a => a.id === audioId ? { ...a, caption: cap } : a),
    }));
  }, []);

  const handleReorder = async (orderedIds: number[]) => {
    setLocalImages(prev => orderedIds.map(id => prev.find(img => img.id === id)!));
    await window.electronAPI.quickCaptures.reorderImages(capture.id, orderedIds);
  };

  const handleDeleteImage = async (imageId: number) => {
    setLocalImages(prev => prev.filter(img => img.id !== imageId));
    await window.electronAPI.quickCaptures.deleteImage(imageId);
  };

  const handleDeleteAudio = async (audioId: number) => {
    setLocalAudios(prev => prev.filter(a => a.id !== audioId));
    await window.electronAPI.quickCaptures.deleteAudio(audioId);
  };

  const handleAddImage = async () => {
    const items = await navigator.clipboard.read().catch(() => [] as ClipboardItem[]);
    for (const item of items) {
      const imageType = item.types.find(t => t.startsWith('image/'));
      if (!imageType) continue;
      const blob = await item.getType(imageType);
      const ext = imageType.split('/')[1] || 'png';
      const buf = await blob.arrayBuffer();
      const saved = await window.electronAPI.quickCaptures.addImage(capture.id, buf, ext);
      setLocalImages(prev => [...prev, { ...saved, color: null as DurationColor, group_color: null as DurationGroupColor }]);
      break;
    }
  };

  const handleImageContextMenu = (e: React.MouseEvent, img: SortableImageItem) => {
    e.preventDefault();
    e.stopPropagation();
    // Find the original QuickCaptureImage
    const original = capture.images.find(i => i.id === img.id) ?? { ...img, capture_id: capture.id, sort_order: 0, created_at: '' } as QuickCaptureImage;
    // Also open lightbox at the clicked image's position
    const idx = localImages.findIndex(i => i.id === img.id);
    if (idx !== -1) openLightbox(idx);
    setContextMenu({ kind: 'image', item: original, x: e.clientX, y: e.clientY });
  };

  const handleAudioContextMenu = (e: React.MouseEvent, audio: QuickCaptureAudio) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ kind: 'audio', item: audio, x: e.clientX, y: e.clientY });
  };

  const openCaptionModal = (state: CaptionModalState) => {
    setContextMenu(null);
    setCaptionModal(state);
    setCaptionText(state?.current ?? '');
  };

  const saveCaption = async () => {
    if (!captionModal) return;
    const trimmed = captionText.trim() || null;
    if (captionModal.kind === 'image') {
      const updated = await window.electronAPI.quickCaptures.updateImageCaption(captionModal.id, trimmed);
      setLocalImages(prev => prev.map(img => img.id === captionModal.id ? { ...img, caption: updated.caption } : img));
    } else {
      const updated = await window.electronAPI.quickCaptures.updateAudioCaption(captionModal.id, trimmed);
      setLocalAudios(prev => prev.map(a => a.id === captionModal.id ? { ...a, caption: updated.caption } : a));
    }
    setCaptionModal(null);
  };

  const handleLightboxEditCaption = () => {
    if (lightboxIndex === null) return;
    const img = localImages[lightboxIndex];
    setCaptionModal({ kind: 'image', id: img.id, current: img.caption });
    setCaptionText(img.caption ?? '');
  };

  const handleLightboxDeleteImage = async () => {
    if (lightboxIndex === null) return;
    const img = localImages[lightboxIndex];
    if (!window.confirm('Delete this image?')) return;
    const newImages = localImages.filter(i => i.id !== img.id);
    setLocalImages(newImages);
    if (newImages.length === 0) {
      setLightboxIndex(null);
      setCaptureImageAudiosMap({});
    } else {
      setLightboxIndex(Math.min(lightboxIndex, newImages.length - 1));
    }
    await window.electronAPI.quickCaptures.deleteImage(img.id);
  };

  return (
    <div className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">

      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 dark:text-gray-500">{relativeTime(capture.created_at)}</span>
          {expiresInDays !== undefined && expiresInDays <= 2 && (
            <span className="text-xs text-amber-500 dark:text-amber-400 font-medium">expires in {expiresInDays}d</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {confirmDelete ? (
            <>
              <button
                onClick={() => onDelete(capture.id)}
                className="text-xs px-2 py-0.5 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-dark-hover text-gray-600 dark:text-gray-400 rounded hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-400 transition-colors rounded"
              title="Delete"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Note */}
      {capture.note && (
        <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap mb-3">{capture.note}</p>
      )}

      {/* ── Images section ── */}
      {localImages.length > 0 && (
        <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-blue-700 dark:text-blue-300">
              Images ({localImages.length})
            </h3>
            <button
              onClick={handleAddImage}
              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
            >
              📋 Paste
            </button>
          </div>
          <SortableImageGrid
            images={localImages}
            gridClassName="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2"
            colorOverrides={{}}
            groupColorOverrides={{}}
            colorKeyPrefix="qcImg"
            captionColorClass="text-blue-600 dark:text-blue-400"
            onImageClick={openLightbox}
            onContextMenu={handleImageContextMenu}
            onDelete={handleDeleteImage}
            onReorder={handleReorder}
            pastePlaceholder={
              <div className="flex flex-col items-center">
                <div className="relative w-full max-w-[160px]">
                  <div
                    className="aspect-square rounded-lg border-2 border-dashed border-blue-300 dark:border-blue-600
                               bg-blue-50/50 dark:bg-blue-900/10 cursor-pointer hover:border-blue-400 dark:hover:border-blue-500
                               hover:bg-blue-100/50 dark:hover:bg-blue-900/20 transition-colors flex items-center justify-center"
                    onClick={handleAddImage}
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

      {/* ── Audio section ── */}
      {localAudios.length > 0 && (
        <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-lg">
          <h3 className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">
            Audio ({localAudios.length})
          </h3>
          <div className="space-y-2">
            {localAudios.map((audio, idx) => (
              <AudioRow
                key={audio.id}
                index={idx}
                src={window.electronAPI.paths.getFileUrl(audio.file_path)}
                caption={audio.caption}
                audioRef={(el) => { audioRefs.current[idx] = el; }}
                onPlay={() => {
                  audioRefs.current.forEach((el, i) => {
                    if (i !== idx && el) el.pause();
                  });
                }}
                onContextMenu={(e) => handleAudioContextMenu(e, audio)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {capture.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {capture.tags.map(tag => (
            <span
              key={tag}
              className="px-2 py-0.5 text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full border border-blue-200 dark:border-blue-700/50"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <ImageLightbox
          images={localImages}
          selectedIndex={lightboxIndex}
          onClose={() => { setLightboxIndex(null); setCaptureImageAudiosMap({}); }}
          onNavigate={setLightboxIndex}
          mediaType="quick_capture_image"
          imageAudiosMap={captureImageAudiosMap}
          onPlayImageAudio={handlePlayCaptureImageAudio}
          onRecordForImage={handleRecordForCaptureImage}
          onDeleteImageAudio={handleDeleteCaptureImageAudio}
          onUpdateImageAudioCaption={handleUpdateCaptureImageAudioCaption}
          onEditCaption={handleLightboxEditCaption}
          onDelete={handleLightboxDeleteImage}
        />
      )}

      {/* ── Context Menu ── */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-lg shadow-lg py-1 min-w-[150px]"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 170),
            top: Math.min(contextMenu.y, window.innerHeight - 120),
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-dark-hover flex items-center gap-2"
            onClick={() => openCaptionModal({
              kind: contextMenu.kind,
              id: contextMenu.item.id,
              current: contextMenu.item.caption,
            })}
          >
            <span>✏️</span> Add Caption
          </button>
          <button
            className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-dark-hover flex items-center gap-2"
            onClick={() => {
              setContextMenu(null);
              setTagModal({ kind: contextMenu.kind, id: contextMenu.item.id });
            }}
          >
            <span>🏷️</span> Tags
          </button>
          <div className="border-t border-gray-100 dark:border-dark-border my-1" />
          <button
            className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-gray-100 dark:hover:bg-dark-hover flex items-center gap-2"
            onClick={() => {
              const { kind, item } = contextMenu;
              setContextMenu(null);
              if (kind === 'image') handleDeleteImage(item.id);
              else handleDeleteAudio(item.id);
            }}
          >
            <span>🗑️</span> Delete
          </button>
        </div>
      )}

      {/* ── Caption Modal ── */}
      {captionModal && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50"
          onClick={() => setCaptionModal(null)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-[360px] max-w-[90vw] p-5"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">
              ✏️ {captionModal.kind === 'image' ? 'Image' : 'Audio'} Caption
            </p>
            <input
              type="text"
              autoFocus
              value={captionText}
              onChange={e => setCaptionText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveCaption(); if (e.key === 'Escape') setCaptionModal(null); }}
              placeholder="Add a caption…"
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 outline-none focus:border-blue-400 dark:focus:border-blue-500"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setCaptionModal(null)}
                className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-dark-hover rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveCaption}
                className="px-3 py-1.5 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tag Modal ── */}
      {tagModal && (
        <TagModal
          mediaType={tagModal.kind === 'image' ? 'quick_capture_image' : 'quick_capture_audio'}
          mediaId={tagModal.id}
          title={tagModal.kind === 'image' ? 'Image Tags' : 'Audio Tags'}
          onClose={() => setTagModal(null)}
        />
      )}
    </div>
  );
}

// ── Inline audio row ──────────────────────────────────────────────
interface AudioRowProps {
  index: number;
  src: string;
  caption: string | null;
  audioRef: (el: HTMLAudioElement | null) => void;
  onPlay: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function AudioRow({ index, src, caption, audioRef, onPlay, onContextMenu }: AudioRowProps) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const ref = useRef<HTMLAudioElement | null>(null);

  const setRef = (el: HTMLAudioElement | null) => {
    ref.current = el;
    audioRef(el);
  };

  const togglePlay = () => {
    const el = ref.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      onPlay();
      el.play();
    }
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${m}:${ss.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className="flex items-center gap-2 py-1 px-2 rounded-lg bg-blue-900/20 border border-blue-800/30"
      onContextMenu={onContextMenu}
    >
      <span className="w-4 h-4 bg-blue-500/30 border border-blue-400/50 text-blue-300 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0">
        {index + 1}
      </span>

      <button
        onClick={togglePlay}
        className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow"
        title={playing ? 'Pause' : 'Play'}
      >
        {playing ? (
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        ) : (
          <svg className="w-3 h-3 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        {caption ? (
          <span className="text-xs text-blue-300 truncate block">{caption}</span>
        ) : (
          <div className="flex items-center gap-1.5">
            <div
              className="flex-1 h-1 bg-blue-800/40 rounded-full cursor-pointer"
              onClick={e => {
                const el = ref.current;
                if (!el || !duration) return;
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                el.currentTime = pct * duration;
              }}
            >
              <div
                className="h-full bg-blue-400 rounded-full transition-all"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-blue-400 flex-shrink-0">
              {fmt(duration > 0 ? progress * duration : 0)}/{fmt(duration)}
            </span>
          </div>
        )}
      </div>

      <audio
        ref={setRef}
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setProgress(0); }}
        onLoadedMetadata={e => setDuration((e.target as HTMLAudioElement).duration)}
        onTimeUpdate={e => {
          const el = e.target as HTMLAudioElement;
          if (el.duration) setProgress(el.currentTime / el.duration);
        }}
      />
    </div>
  );
}
