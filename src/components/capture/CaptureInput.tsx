import { useState, useEffect, useCallback, useRef } from 'react';
import { TagInputSuggestions } from '../common/TagInputSuggestions';
import { useAudioRecording, type PendingMarker } from '../../context/AudioRecordingContext';
import type { QuickCapture } from '../../types';
import PendingImageGrid, { type PendingImage } from './PendingImageGrid';

interface PendingAudio {
  blob: Blob;
  durationSec: number;
  markers: PendingMarker[];
}

interface CaptureInputProps {
  onSaved: (capture: QuickCapture) => void;
}

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function CaptureInput({ onSaved }: CaptureInputProps) {
  const [note, setNote] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [pendingAudio, setPendingAudio] = useState<PendingAudio | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { startRecording, isRecording, pendingCaptureAudio, clearPendingCaptureAudio } = useAudioRecording();

  // Paste image from clipboard
  const pasteImage = useCallback(async () => {
    const result = await window.electronAPI.clipboard.readImage();
    if (result.success && result.buffer && result.extension) {
      const arr = result.buffer as unknown as ArrayBuffer;
      const previewUrl = URL.createObjectURL(new Blob([arr], { type: `image/${result.extension}` }));
      setPendingImages(prev => [...prev, { uid: Date.now() + Math.random(), buffer: arr, extension: result.extension!, previewUrl }]);
    }
  }, []);

  // Global ⌘V handler
  useEffect(() => {
    const handler = async (e: ClipboardEvent) => {
      const result = await window.electronAPI.clipboard.readImage();
      if (result.success && result.buffer && result.extension) {
        const arr = result.buffer as unknown as ArrayBuffer;
        const previewUrl = URL.createObjectURL(new Blob([arr], { type: `image/${result.extension}` }));
        setPendingImages(prev => [...prev, { uid: Date.now() + Math.random(), buffer: arr, extension: result.extension!, previewUrl }]);
        e.preventDefault();
      }
    };
    window.addEventListener('paste', handler);
    return () => window.removeEventListener('paste', handler);
  }, []);

  const removeImage = (uid: number) => {
    setPendingImages(prev => {
      const img = prev.find(i => i.uid === uid);
      if (img) URL.revokeObjectURL(img.previewUrl);
      return prev.filter(i => i.uid !== uid);
    });
  };

  const removeAudio = () => {
    setPendingAudio(null);
  };

  useEffect(() => {
    if (pendingCaptureAudio) {
      setPendingAudio({ blob: pendingCaptureAudio.blob, durationSec: pendingCaptureAudio.durationSec, markers: pendingCaptureAudio.markers });
      clearPendingCaptureAudio();
    }
  }, [pendingCaptureAudio, clearPendingCaptureAudio]);

  const isEmpty = !note.trim() && pendingImages.length === 0 && !pendingAudio;

  const handleSave = useCallback(async () => {
    if (isEmpty || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { id } = await window.electronAPI.quickCaptures.getOrCreate(note.trim(), tags);
      for (const img of pendingImages) {
        const u8 = img.buffer instanceof ArrayBuffer
          ? new Uint8Array(img.buffer)
          : new Uint8Array(img.buffer as unknown as ArrayBufferLike);
        const cleanBuf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
        await window.electronAPI.quickCaptures.addImage(id, cleanBuf, img.extension);
        URL.revokeObjectURL(img.previewUrl);
      }
      if (pendingAudio) {
        const buf = await pendingAudio.blob.arrayBuffer();
        const savedAudio = await window.electronAPI.quickCaptures.addAudio(id, buf, 'webm');
        if (pendingAudio.markers.length > 0) {
          await window.electronAPI.audioMarkers.addBatch(
            pendingAudio.markers.map(m => ({
              audio_id: savedAudio.id,
              audio_type: 'quick_capture_audio' as const,
              marker_type: m.marker_type,
              start_time: m.start_time,
              end_time: m.end_time,
              caption: null as string | null,
            }))
          );
        }
      }
      const recent = await window.electronAPI.quickCaptures.getRecent();
      const saved = recent.find(c => c.id === id);
      if (saved) onSaved(saved);
      setNote(''); setTags([]); setPendingImages([]); setPendingAudio(null);
      textareaRef.current?.focus();
    } catch (err) {
      console.error('[CaptureInput] save failed:', err);
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [note, tags, pendingImages, pendingAudio, isEmpty, saving, onSaved]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSave();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave]);

  // Small paste zone at end of grid (same size as thumbnails)
  const pastePlaceholder = (
    <div
      className="aspect-square border-2 border-dashed border-blue-300 dark:border-blue-700
                 rounded-lg flex flex-col items-center justify-center cursor-pointer
                 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30
                 transition-colors"
      onClick={pasteImage}
    >
      <svg className="w-5 h-5 text-blue-300 dark:text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
      </svg>
    </div>
  );

  return (
    <div className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl p-4 shadow-sm space-y-3">

      {/* Note textarea */}
      <textarea
        ref={textareaRef}
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Type a note… (⌘V to paste image, mic to record)"
        rows={3}
        autoFocus
        className="w-full resize-none outline-none bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 text-sm"
      />

      {/* ── Images section ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-blue-700 dark:text-blue-300">
            Images ({pendingImages.length})
          </h3>
          <button
            onClick={pasteImage}
            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
          >
            📋 Paste
          </button>
        </div>

        <PendingImageGrid
          images={pendingImages}
          onReorder={setPendingImages}
          onDelete={removeImage}
          gridClassName="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2"
          pastePlaceholder={pastePlaceholder}
        />
      </div>

      {/* ── Audio section ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-blue-700 dark:text-blue-300">
            Audio{pendingAudio ? ' (1)' : ''}
          </h3>
          <button
            onClick={() => startRecording({ type: 'capture', label: 'Quick Capture' })}
            disabled={isRecording}
            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-40 transition-colors"
          >
            🎙️ Record
          </button>
        </div>

        {pendingAudio && (
          <div className="group flex items-center gap-2 py-1 px-2 rounded-lg bg-blue-900/20 border border-blue-800/30">
            <span className="w-4 h-4 bg-blue-500/30 border border-blue-400/50 text-blue-300 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0">
              1
            </span>
            <svg className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path d="M18 3a1 1 0 00-1.447-.894L8.763 6H5a3 3 0 000 6h.28l1.771 5.316A1 1 0 008 18h1a1 1 0 001-1v-4.382l6.553 3.276A1 1 0 0018 15V3z" />
            </svg>
            <span className="flex-1 text-xs text-blue-300">Voice note — {fmt(pendingAudio.durationSec)}</span>
            <button
              onClick={removeAudio}
              className="w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-sm opacity-0 group-hover:opacity-100 transition-opacity"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* Save error */}
      {saveError && (
        <p className="text-xs text-red-500 dark:text-red-400">{saveError}</p>
      )}

      {/* Tags + Save */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <TagInputSuggestions tags={tags} onChange={setTags} placeholder="Add tags…" />
        </div>
        <button
          onClick={handleSave}
          disabled={isEmpty || saving}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
          title="Save (⌘↵)"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
