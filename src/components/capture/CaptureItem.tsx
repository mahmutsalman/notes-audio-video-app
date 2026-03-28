import { useState, useRef, useEffect } from 'react';
import type { QuickCapture, DurationColor, DurationGroupColor } from '../../types';
import SortableImageGrid from '../common/SortableImageGrid';
import ImageLightbox from '../common/ImageLightbox';

interface CaptureItemProps {
  capture: QuickCapture;
  onDelete: (id: number) => void;
  expiresInDays?: number;
}

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
  const audioRefs = useRef<(HTMLAudioElement | null)[]>([]);

  // Map QuickCaptureImage → SortableImageItem (color: null = no color bars)
  const [localImages, setLocalImages] = useState(() =>
    capture.images.map(img => ({
      ...img,
      color: null as DurationColor,
      group_color: null as DurationGroupColor,
    }))
  );

  // Merge newly added images when the capture prop updates (e.g. after a second save)
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

  const handleReorder = async (orderedIds: number[]) => {
    setLocalImages(prev => orderedIds.map(id => prev.find(img => img.id === id)!));
    await window.electronAPI.quickCaptures.reorderImages(capture.id, orderedIds);
  };

  const handleDeleteImage = async (imageId: number) => {
    setLocalImages(prev => prev.filter(img => img.id !== imageId));
    await window.electronAPI.quickCaptures.deleteImage(imageId);
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
            onImageClick={setLightboxIndex}
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
      {capture.audios.length > 0 && (
        <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-lg">
          <h3 className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">
            Audio ({capture.audios.length})
          </h3>
          <div className="space-y-2">
            {capture.audios.map((audio, idx) => (
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
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
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
}

function AudioRow({ index, src, caption, audioRef, onPlay }: AudioRowProps) {
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
    <div className="flex items-center gap-2 py-1 px-2 rounded-lg bg-blue-900/20 border border-blue-800/30">
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
