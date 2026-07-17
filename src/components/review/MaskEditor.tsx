import { useState, useRef, useCallback, useEffect } from 'react';
import type { ReviewMask, ReviewItem, ReviewItemNote, ReviewItemAudio, ReviewItemImage, MediaTagType } from '../../types';
import { TagAutocomplete } from '../common/TagAutocomplete';
import { IMAGE_COLORS, IMAGE_COLOR_KEYS } from '../../utils/imageColors';
import { emitReviewChanged } from '../../utils/events';
import { useAudioRecording, AUDIO_SAVED_EVENT, type PendingMarker } from '../../context/AudioRecordingContext';

interface DrawingRect {
  x: number; y: number; w: number; h: number; // normalized 0–1
}

interface MaskEditorProps {
  /** Absolute path to the image file */
  src: string;
  /**
   * The enrolled review item's id, or `null` for a DRAFT. In draft mode nothing is written
   * to the DB — masks are buffered in memory and only persisted when the user clicks Save,
   * which first calls `onCommit()` to create the review item. Closing/× discards everything.
   */
  reviewItemId: number | null;
  existingMasks: ReviewMask[];
  onMasksChanged: (masks: ReviewMask[]) => void;
  onClose: () => void;
  /** Underlying image identity, so tags can be assigned (they live on the image, not the echo). */
  mediaTagType?: MediaTagType;
  mediaTagId?: number;
  /**
   * "Mark 20 · Minimum Window Substring" — the question this echo will be filed under, shown
   * read-only. It is derived from the image's own mark on the way in and re-derived server-side on
   * enroll, so there is nothing to fill in and nothing that can drift; this is here purely so you
   * can SEE what the card will be attached to before committing to it.
   */
  sourceLabel?: string | null;
  /**
   * The mark's question images (`media://` urls). The NAME of a question often isn't enough to
   * recall it — seeing the problem statement is. A mark may have several (a statement plus its
   * constraints, say). Click any to enlarge; ←/→ move between them.
   */
  sourceImageSrcs?: string[];
  /** Draft-only: create the review item on Save and return it (null ⇒ enroll failed, keep editor open). */
  onCommit?: () => Promise<ReviewItem | null>;
}

const LEVEL_LABELS = ['Level 1 — nearly readable', 'Level 2', 'Level 3 (default)', 'Level 4', 'Level 5 — very hard'];

export default function MaskEditor({ src, reviewItemId, existingMasks, onMasksChanged, onClose, mediaTagType, mediaTagId, sourceLabel, sourceImageSrcs = [], onCommit }: MaskEditorProps) {
  // Draft mode = brand-new "Add to Echo": buffer everything, persist only on Save.
  const draft = reviewItemId == null;
  const [masks, setMasks] = useState<ReviewMask[]>(existingMasks);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ nx: number; ny: number } | null>(null);
  const [drawPreview, setDrawPreview] = useState<DrawingRect | null>(null);
  const [selectedMaskId, setSelectedMaskId] = useState<number | null>(null);
  const [defaultLevel, setDefaultLevel] = useState(3);
  const [saving, setSaving] = useState(false);
  // Index into sourceImageSrcs of the enlarged question image, or null when none is open.
  const [questionIndex, setQuestionIndex] = useState<number | null>(null);
  // Colour labels on the underlying image. They live on the image (not the echo), same as tags —
  // so they're the same labels the grid shows as rings, and toggling here shows up there.
  const [colors, setColors] = useState<string[]>([]);
  // Which hint input just got an Enter — drives a brief green "saved" glow. The hint is already
  // persisted on every keystroke; this exists purely so the Enter has visible confirmation.
  const [flashedMaskId, setFlashedMaskId] = useState<number | null>(null);
  // Side content on the echo ITSELF (not per-review): free-text notes + voice recordings, shown
  // on the review card front. Draft mode buffers both (temp negative ids / blobs) until Save.
  const [itemNotes, setItemNotes] = useState<ReviewItemNote[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [itemAudios, setItemAudios] = useState<ReviewItemAudio[]>([]);
  const [draftAudios, setDraftAudios] = useState<{ blob: Blob; durationSec: number; markers: PendingMarker[] }[]>([]);
  // Images pasted onto the echo itself. Draft mode buffers the raw bytes (plus an object URL
  // purely for preview) and writes them on Save, same lifecycle as draft audios.
  const [itemImages, setItemImages] = useState<ReviewItemImage[]>([]);
  const [draftImages, setDraftImages] = useState<{ buffer: ArrayBuffer; extension: string; url: string }[]>([]);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  // Enlarged pasted image (media:// url or draft object URL), or null when none is open.
  const [enlargedImageSrc, setEnlargedImageSrc] = useState<string | null>(null);
  const [playingAudioKey, setPlayingAudioKey] = useState<string | null>(null);
  const playbackElRef = useRef<HTMLAudioElement | null>(null);
  const { startRecording, isRecording, target, pendingEchoAudio, clearPendingEchoAudio } = useAudioRecording();
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mediaTagType || mediaTagId == null) return;
    window.electronAPI.mediaColors.getByMedia(mediaTagType, mediaTagId).then(setColors);
  }, [mediaTagType, mediaTagId]);

  // Esc / ←→ while a question image is enlarged. Capture phase + stopImmediatePropagation so Esc
  // closes only the enlarged image, never the editor underneath it.
  useEffect(() => {
    if (questionIndex == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (!['Escape', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const n = sourceImageSrcs.length;
      if (e.key === 'Escape') setQuestionIndex(null);
      else if (e.key === 'ArrowLeft') setQuestionIndex(i => ((i ?? 0) - 1 + n) % n);
      else setQuestionIndex(i => ((i ?? 0) + 1) % n);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [questionIndex, sourceImageSrcs.length]);

  // Existing item: load its side notes + audios + images once.
  useEffect(() => {
    if (draft || reviewItemId == null) return;
    window.electronAPI.reviewItemNotes.getByItem(reviewItemId).then(setItemNotes);
    window.electronAPI.reviewItemAudios.getByItem(reviewItemId).then(setItemAudios);
    window.electronAPI.reviewItemImages.getByItem(reviewItemId).then(setItemImages);
  }, [draft, reviewItemId]);

  // Draft mode: the recording bar parks the finished blob in pendingEchoAudio — adopt it here.
  useEffect(() => {
    if (!draft || !pendingEchoAudio) return;
    setDraftAudios(prev => [...prev, pendingEchoAudio]);
    clearPendingEchoAudio();
  }, [draft, pendingEchoAudio, clearPendingEchoAudio]);

  // Existing item: refresh the audio list when the recording bar finishes saving to this echo.
  useEffect(() => {
    if (draft || reviewItemId == null) return;
    const handler = (e: Event) => {
      const t = (e as CustomEvent).detail?.target;
      if (t?.type === 'review_item' && t.reviewItemId === reviewItemId) {
        window.electronAPI.reviewItemAudios.getByItem(reviewItemId).then(setItemAudios);
      }
    };
    window.addEventListener(AUDIO_SAVED_EVENT, handler);
    return () => window.removeEventListener(AUDIO_SAVED_EVENT, handler);
  }, [draft, reviewItemId]);

  // Stop playback when the editor unmounts — an orphaned element keeps playing.
  useEffect(() => () => { playbackElRef.current?.pause(); playbackElRef.current = null; }, []);

  // Esc closes only the enlarged pasted image, never the editor underneath it (same contract
  // as the question-image overlay above).
  useEffect(() => {
    if (enlargedImageSrc == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setEnlargedImageSrc(null);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [enlargedImageSrc]);

  const recordingHere = isRecording && (target?.type === 'review_item' || target?.type === 'review_item_draft');

  const handleStartRecording = () => {
    if (isRecording) return;
    if (draft) void startRecording({ type: 'review_item_draft', label: 'New echo' });
    else void startRecording({ type: 'review_item', reviewItemId: reviewItemId!, label: 'Echo' });
  };

  const handleAddNote = async () => {
    const body = newNoteText.trim();
    if (!body) return;
    if (draft) {
      setItemNotes(prev => [...prev, {
        id: -(prev.length + 1), review_item_id: -1, body, sort_order: prev.length, created_at: '',
      }]);
    } else {
      const saved = await window.electronAPI.reviewItemNotes.add(reviewItemId!, body);
      setItemNotes(prev => [...prev, saved]);
    }
    setNewNoteText('');
  };

  const handleUpdateNote = async (note: ReviewItemNote, body: string) => {
    if (!draft) await window.electronAPI.reviewItemNotes.update(note.id, body);
    setItemNotes(prev => prev.map(n => n.id === note.id ? { ...n, body } : n));
  };

  const handleDeleteNote = async (noteId: number) => {
    if (!draft) await window.electronAPI.reviewItemNotes.delete(noteId);
    setItemNotes(prev => prev.filter(n => n.id !== noteId));
  };

  const stopPlayback = () => {
    playbackElRef.current?.pause();
    playbackElRef.current = null;
    setPlayingAudioKey(null);
  };

  const playAudio = (key: string, url: string) => {
    if (playingAudioKey === key) { stopPlayback(); return; }
    playbackElRef.current?.pause();
    const el = new Audio(url);
    el.onended = () => setPlayingAudioKey(cur => (cur === key ? null : cur));
    playbackElRef.current = el;
    setPlayingAudioKey(key);
    void el.play();
  };

  const handleDeleteAudio = async (audioId: number) => {
    if (playingAudioKey === `saved-${audioId}`) stopPlayback();
    await window.electronAPI.reviewItemAudios.delete(audioId);
    setItemAudios(prev => prev.filter(a => a.id !== audioId));
  };

  const handleDeleteDraftAudio = (index: number) => {
    if (playingAudioKey === `draft-${index}`) stopPlayback();
    setDraftAudios(prev => prev.filter((_, i) => i !== index));
  };

  const handleAttachImageFromClipboard = async () => {
    if (imageBusy) return;
    setImageBusy(true);
    setImageError(null);
    try {
      const result = await window.electronAPI.clipboard.readImage();
      if (!result.success || !result.buffer) {
        // Reading the clipboard is not permission-gated; an empty result means the
        // clipboard genuinely holds no image (e.g. it holds text).
        setImageError('No image in the clipboard');
        return;
      }
      const buffer = result.buffer as unknown as ArrayBuffer;
      const extension = result.extension ?? 'png';
      if (draft) {
        const url = URL.createObjectURL(new Blob([buffer]));
        setDraftImages(prev => [...prev, { buffer, extension, url }]);
      } else {
        const saved = await window.electronAPI.reviewItemImages.add(reviewItemId!, buffer, extension);
        setItemImages(prev => [...prev, saved]);
      }
    } finally {
      setImageBusy(false);
    }
  };

  const handleDeleteImage = async (imageId: number) => {
    await window.electronAPI.reviewItemImages.delete(imageId);
    setItemImages(prev => prev.filter(i => i.id !== imageId));
    setEnlargedImageSrc(null);
  };

  const handleDeleteDraftImage = (index: number) => {
    setDraftImages(prev => {
      URL.revokeObjectURL(prev[index]?.url);
      return prev.filter((_, i) => i !== index);
    });
    setEnlargedImageSrc(null);
  };

  // Revoke draft preview URLs on unmount — Cancel/× discards the buffers, the URLs must not leak.
  const draftImagesRef = useRef(draftImages);
  draftImagesRef.current = draftImages;
  useEffect(() => () => { draftImagesRef.current.forEach(d => URL.revokeObjectURL(d.url)); }, []);

  const toggleColor = async (key: string) => {
    if (!mediaTagType || mediaTagId == null) return;
    setColors(await window.electronAPI.mediaColors.toggle(mediaTagType, mediaTagId, key));
  };

  const flashHintSaved = (maskId: number) => {
    setFlashedMaskId(maskId);
    window.setTimeout(() => setFlashedMaskId(cur => (cur === maskId ? null : cur)), 900);
  };

  // Compute the displayed image rect within the container (object-fit: contain)
  const getImageRect = useCallback((): { x: number; y: number; w: number; h: number } | null => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) return null;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh) return null;
    const scale = Math.min(cw / nw, ch / nh);
    const fw = nw * scale;
    const fh = nh * scale;
    return { x: (cw - fw) / 2, y: (ch - fh) / 2, w: fw, h: fh };
  }, []);

  // Convert client coords to normalized image coords (0–1)
  const toNorm = useCallback((clientX: number, clientY: number): { nx: number; ny: number } | null => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const imgRect = getImageRect();
    if (!imgRect) return null;
    const lx = clientX - rect.left;
    const ly = clientY - rect.top;
    const nx = (lx - imgRect.x) / imgRect.w;
    const ny = (ly - imgRect.y) / imgRect.h;
    return { nx: Math.max(0, Math.min(1, nx)), ny: Math.max(0, Math.min(1, ny)) };
  }, [getImageRect]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const norm = toNorm(e.clientX, e.clientY);
    if (!norm) return;
    setIsDrawing(true);
    setDrawStart(norm);
    setDrawPreview(null);
    setSelectedMaskId(null);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDrawing || !drawStart) return;
    const norm = toNorm(e.clientX, e.clientY);
    if (!norm) return;
    const x = Math.min(drawStart.nx, norm.nx);
    const y = Math.min(drawStart.ny, norm.ny);
    const w = Math.abs(norm.nx - drawStart.nx);
    const h = Math.abs(norm.ny - drawStart.ny);
    setDrawPreview({ x, y, w, h });
  }, [isDrawing, drawStart, toNorm]);

  const handleMouseUp = useCallback(async (e: MouseEvent) => {
    if (!isDrawing || !drawStart) return;
    setIsDrawing(false);
    const norm = toNorm(e.clientX, e.clientY);
    if (!norm) { setDrawPreview(null); setDrawStart(null); return; }

    const x = Math.min(drawStart.nx, norm.nx);
    const y = Math.min(drawStart.ny, norm.ny);
    const w = Math.abs(norm.nx - drawStart.nx);
    const h = Math.abs(norm.ny - drawStart.ny);

    // Ignore tiny accidental clicks
    if (w < 0.01 || h < 0.01) { setDrawPreview(null); setDrawStart(null); return; }

    let newMask: ReviewMask;
    if (draft) {
      // Buffer in memory with a temp negative id; persisted on Save.
      newMask = {
        id: -(masks.length + 1),
        review_item_id: -1,
        x, y, w, h,
        pixelation_level: defaultLevel,
        hint_text: null,
        sort_order: masks.length,
        created_at: '',
      };
    } else {
      newMask = await window.electronAPI.reviewMasks.create(
        reviewItemId!, x, y, w, h, defaultLevel, null, masks.length
      );
    }
    const updated = [...masks, newMask];
    setMasks(updated);
    onMasksChanged(updated);
    setSelectedMaskId(newMask.id);
    setDrawPreview(null);
    setDrawStart(null);
  }, [isDrawing, drawStart, toNorm, masks, reviewItemId, draft, defaultLevel, onMasksChanged]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const handleDeleteMask = async (id: number) => {
    if (!draft) await window.electronAPI.reviewMasks.delete(id);
    const updated = masks.filter(m => m.id !== id);
    setMasks(updated);
    onMasksChanged(updated);
    if (selectedMaskId === id) setSelectedMaskId(null);
  };

  const handleUpdateHint = async (mask: ReviewMask, hint: string) => {
    if (!draft) await window.electronAPI.reviewMasks.update(mask.id, mask.x, mask.y, mask.w, mask.h, mask.pixelation_level, hint || null);
    const updated = masks.map(m => m.id === mask.id ? { ...m, hint_text: hint || null } : m);
    setMasks(updated);
    onMasksChanged(updated);
  };

  const handleUpdateLevel = async (mask: ReviewMask, level: number) => {
    if (!draft) await window.electronAPI.reviewMasks.update(mask.id, mask.x, mask.y, mask.w, mask.h, level, mask.hint_text);
    const updated = masks.map(m => m.id === mask.id ? { ...m, pixelation_level: level } : m);
    setMasks(updated);
    onMasksChanged(updated);
  };

  // Save: in draft mode this is the ONLY thing that writes to the DB — create the review
  // item, then persist the buffered masks in order. Existing items already autosaved live.
  const handleSave = async () => {
    if (!draft) { onClose(); return; }
    if (saving) return;
    setSaving(true);
    const item = await onCommit?.();
    if (!item) { setSaving(false); return; }  // enroll failed — keep the editor open
    for (let i = 0; i < masks.length; i++) {
      const m = masks[i];
      await window.electronAPI.reviewMasks.create(item.id, m.x, m.y, m.w, m.h, m.pixelation_level, m.hint_text, i);
    }
    for (const n of itemNotes) {
      if (n.body.trim()) await window.electronAPI.reviewItemNotes.add(item.id, n.body.trim());
    }
    // Text typed into the add-box but never Entered still counts — losing it on Save would be cruel.
    if (newNoteText.trim()) await window.electronAPI.reviewItemNotes.add(item.id, newNoteText.trim());
    for (const a of draftAudios) {
      const buf = await a.blob.arrayBuffer();
      const savedAudio = await window.electronAPI.reviewItemAudios.add(item.id, buf, a.durationSec || null, 'webm');
      const markers = a.markers
        .filter(m => m.start_time !== undefined)
        .map(m => ({
          audio_id: savedAudio.id,
          audio_type: 'review_item' as const,
          marker_type: m.marker_type,
          start_time: m.start_time,
          end_time: m.end_time,
          caption: null,
        }));
      if (markers.length > 0) await window.electronAPI.audioMarkers.addBatch(markers);
    }
    for (const img of draftImages) {
      await window.electronAPI.reviewItemImages.add(item.id, img.buffer, img.extension);
    }
    emitReviewChanged();
    onClose();
  };

  const imgRect = getImageRect();

  return (
    <div
      className="absolute inset-0 z-[70] flex bg-black/95"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Main canvas area */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden cursor-crosshair"
        onMouseDown={handleMouseDown}
      >
        <img
          ref={imgRef}
          src={src}
          alt=""
          draggable={false}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          onLoad={() => { /* trigger re-render */ setDefaultLevel(l => l); }}
        />

        {/* Existing mask overlays */}
        {imgRect && masks.map(mask => {
          const isSelected = mask.id === selectedMaskId;
          return (
            <div
              key={mask.id}
              className={`absolute border-2 cursor-pointer transition-colors ${
                isSelected ? 'border-yellow-400 bg-yellow-400/20' : 'border-blue-400 bg-blue-400/10 hover:bg-blue-400/20'
              }`}
              style={{
                left: imgRect.x + mask.x * imgRect.w,
                top: imgRect.y + mask.y * imgRect.h,
                width: mask.w * imgRect.w,
                height: mask.h * imgRect.h,
              }}
              onClick={(e) => { e.stopPropagation(); setSelectedMaskId(mask.id); }}
            >
              <span className="absolute top-0.5 left-0.5 bg-black/60 text-white text-[10px] px-1 rounded leading-none">
                L{mask.pixelation_level}
              </span>
            </div>
          );
        })}

        {/* Draw preview */}
        {imgRect && drawPreview && (
          <div
            className="absolute border-2 border-dashed border-green-400 bg-green-400/10 pointer-events-none"
            style={{
              left: imgRect.x + drawPreview.x * imgRect.w,
              top: imgRect.y + drawPreview.y * imgRect.h,
              width: drawPreview.w * imgRect.w,
              height: drawPreview.h * imgRect.h,
            }}
          />
        )}

        {/* Instruction hint — pinned to the bottom edge so it never covers the image content */}
        {masks.length === 0 && !isDrawing && (
          <div className="absolute inset-x-0 bottom-0 flex justify-center pb-3 pointer-events-none">
            <div className="bg-black/70 text-white text-xs px-3 py-1.5 rounded-full">
              Drag to draw a mask rectangle
            </div>
          </div>
        )}
      </div>

      {/* Right panel */}
      <div className="w-72 bg-gray-900 border-l border-gray-700 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <span className="text-white text-sm font-medium">{draft ? 'Add to Echo' : 'Mask Editor'}</span>
          <button
            onClick={onClose}
            title={draft ? 'Discard — nothing is saved' : 'Close'}
            className="text-gray-400 hover:text-white text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Source — which question this card belongs to. Filled in automatically from the mark the
            image lives on; you never type it. Shown because an echo without its question is
            unreviewable, and you should be able to see it is set BEFORE you hit Save. */}
        {(sourceLabel || sourceImageSrcs.length > 0) && (
          <div className="px-4 py-3 border-b border-gray-700">
            <p className="text-gray-400 text-xs mb-2">
              Source
              {sourceImageSrcs.length > 1 && (
                <span className="text-gray-500"> · {sourceImageSrcs.length} question images</span>
              )}
            </p>
            {sourceLabel && (
              <div className="flex items-start gap-1.5 text-xs text-amber-300/90">
                <span aria-hidden className="leading-4">📌</span>
                <span className="leading-4">{sourceLabel}</span>
              </div>
            )}
            {/* The question images. The mark's NAME is often not enough to bring the problem back —
                seeing the statement is. A mark can carry several; click any to enlarge. */}
            {sourceImageSrcs.length > 0 && (
              <div className={`mt-2 grid gap-1.5 ${sourceImageSrcs.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {sourceImageSrcs.map((qsrc, i) => (
                  <button
                    key={qsrc}
                    onClick={() => setQuestionIndex(i)}
                    className="block rounded-md overflow-hidden border border-amber-400/40 hover:border-amber-400 transition-colors cursor-zoom-in"
                    title="Click to enlarge the question"
                  >
                    <img
                      src={qsrc}
                      alt="The question this card came from"
                      className={`w-full object-cover ${sourceImageSrcs.length === 1 ? 'max-h-28' : 'h-20'}`}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tags — assigned to the underlying image (shared with the image's own tags and
            Browse-by-Tag). Autosaves immediately via tags.setForMedia; works even in draft
            mode because the image already exists (only the echo is deferred). */}
        {mediaTagType && mediaTagId != null && (
          <div className="px-4 py-3 border-b border-gray-700">
            <p className="text-gray-400 text-xs mb-2">Tags</p>
            <TagAutocomplete
              mediaType={mediaTagType}
              mediaId={mediaTagId}
              key={`${mediaTagType}-${mediaTagId}`}
              autoFocus={false}
            />
          </div>
        )}

        {/* Colour labels — same labels the image grid draws as rings. Assigned to the IMAGE, so
            they're visible and editable here instead of only in the lightbox. */}
        {mediaTagType && mediaTagId != null && (
          <div className="px-4 py-3 border-b border-gray-700">
            <p className="text-gray-400 text-xs mb-2">
              Colors{colors.length > 0 && <span className="text-gray-500"> · {colors.length}</span>}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {IMAGE_COLOR_KEYS.map(key => {
                const active = colors.includes(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleColor(key)}
                    title={`${IMAGE_COLORS[key].label}${active ? ' — assigned' : ''}`}
                    style={{ backgroundColor: IMAGE_COLORS[key].hex }}
                    className={`w-5 h-5 rounded-full transition-all ${
                      active
                        ? 'ring-2 ring-offset-2 ring-offset-gray-900 ring-white scale-110'
                        : 'opacity-40 hover:opacity-80'
                    }`}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Default level selector */}
        <div className="px-4 py-3 border-b border-gray-700">
          <p className="text-gray-400 text-xs mb-2">New mask pixelation level</p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(l => (
              <button
                key={l}
                onClick={() => setDefaultLevel(l)}
                className={`flex-1 py-1 text-xs rounded transition-colors ${
                  defaultLevel === l
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable: notes + voice on the echo itself, then the mask list */}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
          {/* Notes — extra prompts beyond the mask rectangles: hints, questions, ideas. Shown on
              the review card front. As many as you like. */}
          <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-3 flex flex-col gap-2">
            <p className="text-gray-400 text-xs">
              Notes{itemNotes.length > 0 && <span className="text-gray-500"> · {itemNotes.length}</span>}
            </p>
            {itemNotes.map(note => (
              <div key={note.id} className="group/note relative">
                <input
                  type="text"
                  value={note.body}
                  onChange={(e) => handleUpdateNote(note, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full text-xs bg-gray-700 text-white rounded px-2 py-1.5 pr-6 border border-gray-600 focus:border-blue-500 focus:outline-none"
                />
                <button
                  onClick={() => handleDeleteNote(note.id)}
                  title="Delete this note"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-red-400 text-xs
                             opacity-0 group-hover/note:opacity-100 transition-opacity"
                >
                  ✕
                </button>
              </div>
            ))}
            <input
              type="text"
              value={newNoteText}
              onChange={(e) => setNewNoteText(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                e.stopPropagation();
                void handleAddNote();
              }}
              placeholder="Add a note (hint, question, idea) · Enter"
              className="w-full text-xs bg-gray-700/60 text-white rounded px-2 py-1.5 border border-dashed border-gray-600 focus:border-blue-500 focus:border-solid focus:outline-none placeholder:text-gray-500"
            />
          </div>

          {/* Images — pasted from the clipboard, shown on the review card front like the notes.
              Draft images are buffered and written on Save; click any to enlarge. */}
          <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-3 flex flex-col gap-2">
            <p className="text-gray-400 text-xs">
              Images{(itemImages.length + draftImages.length) > 0 && (
                <span className="text-gray-500"> · {itemImages.length + draftImages.length}</span>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {itemImages.map(img => (
                <div key={img.id} className="group/img relative">
                  <img
                    src={window.electronAPI.paths.getFileUrl(img.thumbnail_path ?? img.file_path)}
                    alt={img.caption ?? ''}
                    onClick={() => setEnlargedImageSrc(window.electronAPI.paths.getFileUrl(img.file_path))}
                    className="h-12 w-12 object-cover rounded cursor-zoom-in border border-gray-700"
                  />
                  <button
                    onClick={() => handleDeleteImage(img.id)}
                    title="Delete this image"
                    className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-600 text-white text-[10px] leading-none
                               opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {draftImages.map((img, i) => (
                <div key={`draft-${i}`} className="group/img relative" title="Saved with the echo">
                  <img
                    src={img.url}
                    alt=""
                    onClick={() => setEnlargedImageSrc(img.url)}
                    className="h-12 w-12 object-cover rounded cursor-zoom-in border border-blue-700/60"
                  />
                  <button
                    onClick={() => handleDeleteDraftImage(i)}
                    title="Discard this image"
                    className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-600 text-white text-[10px] leading-none
                               opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={handleAttachImageFromClipboard}
                disabled={imageBusy}
                title="Paste an image from the clipboard"
                className="h-12 w-12 rounded border border-dashed border-gray-600 text-gray-500 hover:border-blue-500
                           hover:text-blue-400 flex items-center justify-center text-sm transition-colors disabled:opacity-50"
              >
                {imageBusy ? '…' : '＋'}
              </button>
              {imageError && <span className="text-[11px] text-gray-500">{imageError}</span>}
            </div>
          </div>

          {/* Voice — recorded through the SAME bottom recording bar as everywhere else, so the
              important / question / similar-question marker toggles (and voice commands) work here
              too. Draft recordings are buffered and written on Save. */}
          <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-3 flex flex-col gap-2">
            <p className="text-gray-400 text-xs">
              Voice{(itemAudios.length + draftAudios.length) > 0 && (
                <span className="text-gray-500"> · {itemAudios.length + draftAudios.length}</span>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {itemAudios.map(a => (
                <div key={a.id} className="group/aud relative flex items-center gap-1.5 rounded-full pl-2 pr-2.5 py-1 border border-gray-700 bg-gray-900/60 text-gray-300 hover:border-gray-600 text-[11px]">
                  <button
                    onClick={() => playAudio(`saved-${a.id}`, window.electronAPI.paths.getFileUrl(a.file_path))}
                    title={playingAudioKey === `saved-${a.id}` ? 'Stop' : 'Play'}
                    className="flex items-center gap-1.5"
                  >
                    <span className="text-xs leading-none">{playingAudioKey === `saved-${a.id}` ? '⏹' : '▶'}</span>
                    <span className="tabular-nums">🎙 {a.duration != null ? `${Math.floor(a.duration / 60)}:${String(Math.floor(a.duration % 60)).padStart(2, '0')}` : ''}</span>
                  </button>
                  <button
                    onClick={() => handleDeleteAudio(a.id)}
                    title="Delete this recording"
                    className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-600 text-white text-[10px] leading-none
                               opacity-0 group-hover/aud:opacity-100 transition-opacity flex items-center justify-center"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {draftAudios.map((a, i) => (
                <div key={`draft-${i}`} className="group/aud relative flex items-center gap-1.5 rounded-full pl-2 pr-2.5 py-1 border border-blue-700/60 bg-blue-900/30 text-blue-200 text-[11px]" title="Saved with the echo">
                  <button
                    onClick={() => playAudio(`draft-${i}`, URL.createObjectURL(a.blob))}
                    className="flex items-center gap-1.5"
                  >
                    <span className="text-xs leading-none">{playingAudioKey === `draft-${i}` ? '⏹' : '▶'}</span>
                    <span className="tabular-nums">🎙 {`${Math.floor(a.durationSec / 60)}:${String(Math.floor(a.durationSec % 60)).padStart(2, '0')}`}</span>
                  </button>
                  <button
                    onClick={() => handleDeleteDraftAudio(i)}
                    title="Discard this recording"
                    className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-600 text-white text-[10px] leading-none
                               opacity-0 group-hover/aud:opacity-100 transition-opacity flex items-center justify-center"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {recordingHere ? (
                <span className="text-[11px] text-red-400 animate-pulse">● recording — stop in the bottom bar</span>
              ) : (
                <button
                  onClick={handleStartRecording}
                  disabled={isRecording}
                  title={isRecording ? 'Another recording is in progress' : 'Record a voice note — marker toggles work in the bottom bar'}
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1 border border-dashed border-gray-600 text-gray-400 hover:text-white hover:border-gray-400 disabled:opacity-40 text-[11px] transition-colors"
                >
                  🎙 Record
                </button>
              )}
            </div>
          </div>

          {/* Mask list */}
          {masks.length === 0 && (
            <p className="text-gray-500 text-xs text-center mt-4">No masks yet. Draw on the image.</p>
          )}
          {masks.map((mask, i) => (
            <div
              key={mask.id}
              className={`rounded-lg border p-3 flex flex-col gap-2 cursor-pointer transition-colors ${
                selectedMaskId === mask.id
                  ? 'border-yellow-500 bg-gray-800'
                  : 'border-gray-700 bg-gray-800/50 hover:border-gray-500'
              }`}
              onClick={() => setSelectedMaskId(mask.id)}
            >
              <div className="flex items-center justify-between">
                <span className="text-gray-200 text-xs font-medium">Mask {i + 1}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteMask(mask.id); }}
                  className="text-red-400 hover:text-red-300 text-xs"
                >
                  Delete
                </button>
              </div>

              {/* Pixelation level */}
              <div>
                <p className="text-gray-500 text-[10px] mb-1">Pixelation level</p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(l => (
                    <button
                      key={l}
                      onClick={(e) => { e.stopPropagation(); handleUpdateLevel(mask, l); }}
                      className={`flex-1 py-0.5 text-[11px] rounded transition-colors ${
                        mask.pixelation_level === l
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      }`}
                      title={LEVEL_LABELS[l - 1]}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hint text. Persisted on every keystroke already (buffered in draft mode, written
                  through otherwise) — Enter exists to CONFIRM that, with a green glow, because an
                  input that saves silently gives you no reason to believe it did. */}
              <div>
                <p className="text-gray-500 text-[10px] mb-1 flex items-center gap-1.5">
                  Hint (optional)
                  {flashedMaskId === mask.id && (
                    <span className="text-emerald-400 text-[10px]">✓ saved</span>
                  )}
                </p>
                <input
                  type="text"
                  value={mask.hint_text ?? ''}
                  onChange={(e) => handleUpdateHint(mask, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    e.stopPropagation();
                    flashHintSaved(mask.id);
                    (e.currentTarget as HTMLInputElement).blur();
                  }}
                  placeholder="e.g. 'Rust for loop syntax' · Enter to save"
                  className={`w-full text-xs bg-gray-700 text-white rounded px-2 py-1.5 border transition-all duration-300 focus:outline-none ${
                    flashedMaskId === mask.id
                      ? 'border-emerald-500 ring-2 ring-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.45)]'
                      : 'border-gray-600 focus:border-blue-500'
                  }`}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-gray-700 flex gap-2">
          {draft && (
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 text-sm font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {draft ? (saving ? 'Saving…' : 'Save') : 'Done'}
          </button>
        </div>
      </div>

      {/* Enlarged question image. Sits above the whole editor so the problem statement is readable
          while you decide what to mask. ←/→ move between a mark's question images. */}
      {questionIndex != null && sourceImageSrcs[questionIndex] && (
        <div
          onClick={() => setQuestionIndex(null)}
          className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-8 cursor-zoom-out"
        >
          <span className="fixed top-4 left-5 text-amber-300/90 text-xs px-2 py-1 rounded-md bg-black/60 pointer-events-none">
            ★ {sourceLabel ?? 'Question'}
            {sourceImageSrcs.length > 1 && ` · ${questionIndex + 1}/${sourceImageSrcs.length}`}
          </span>

          {sourceImageSrcs.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setQuestionIndex(i => ((i ?? 0) - 1 + sourceImageSrcs.length) % sourceImageSrcs.length);
                }}
                className="fixed left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 text-white/80 hover:text-white text-2xl leading-none flex items-center justify-center transition-colors cursor-pointer"
                title="Previous question image"
              >
                ‹
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setQuestionIndex(i => ((i ?? 0) + 1) % sourceImageSrcs.length);
                }}
                className="fixed right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 text-white/80 hover:text-white text-2xl leading-none flex items-center justify-center transition-colors cursor-pointer"
                title="Next question image"
              >
                ›
              </button>
            </>
          )}

          <img
            src={sourceImageSrcs[questionIndex]}
            alt="The question this card came from"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full object-contain cursor-default"
          />
        </div>
      )}

      {/* Enlarged pasted image (the echo's own side images). Esc / click outside closes it. */}
      {enlargedImageSrc && (
        <div
          onClick={() => setEnlargedImageSrc(null)}
          className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-8 cursor-zoom-out"
        >
          <img
            src={enlargedImageSrc}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full object-contain cursor-default"
          />
        </div>
      )}
    </div>
  );
}
