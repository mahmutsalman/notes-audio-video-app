import { useState, useEffect, useCallback, useRef } from 'react';
import TagInput from '../common/TagInput';
import { useSimpleAudioRecorder } from '../../hooks/useSimpleAudioRecorder';
import type { QuickCapture } from '../../types';
import PendingImageGrid, { type PendingImage } from './PendingImageGrid';

interface PendingAudio {
  blob: Blob;
  durationSec: number;
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
  const recorder = useSimpleAudioRecorder();

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

  const handleStopRecording = useCallback(async () => {
    const blob = await recorder.stopRecording();
    if (blob) {
      setPendingAudio({ blob, durationSec: recorder.duration });
    }
  }, [recorder]);

  const removeImage = (uid: number) => {
    setPendingImages(prev => {
      const img = prev.find(i => i.uid === uid);
      if (img) URL.revokeObjectURL(img.previewUrl);
      return prev.filter(i => i.uid !== uid);
    });
  };

  const removeAudio = () => {
    recorder.reset();
    setPendingAudio(null);
  };

  const isEmpty = !note.trim() && pendingImages.length === 0 && !pendingAudio;

  const handleSave = useCallback(async () => {
    if (isEmpty || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { id } = await window.electronAPI.quickCaptures.create(note.trim(), tags);
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
        await window.electronAPI.quickCaptures.addAudio(id, buf, 'webm');
      }
      const recent = await window.electronAPI.quickCaptures.getRecent();
      const saved = recent.find(c => c.id === id);
      if (saved) onSaved(saved);
      setNote(''); setTags([]); setPendingImages([]); setPendingAudio(null);
      recorder.reset();
      textareaRef.current?.focus();
    } catch (err) {
      console.error('[CaptureInput] save failed:', err);
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [note, tags, pendingImages, pendingAudio, isEmpty, saving, onSaved, recorder]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSave();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave]);

  // Paste zone shown at end of grid (or as the full empty state)
  const pastePlaceholder = (
    <div
      className="w-full max-w-[160px] aspect-square border-2 border-dashed border-violet-300 dark:border-violet-700
                 rounded-lg flex flex-col items-center justify-center cursor-pointer
                 hover:border-violet-400 dark:hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/30
                 transition-colors flex-shrink-0"
      onClick={pasteImage}
    >
      <svg className="w-5 h-5 text-violet-300 dark:text-violet-600 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      <p className="text-[10px] text-violet-400 dark:text-violet-500">⌘V</p>
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
      <div className="p-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800/50 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-violet-700 dark:text-violet-300">
            Images{pendingImages.length > 0 ? ` (${pendingImages.length})` : ''}
          </h3>
          <button
            onClick={pasteImage}
            className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition-colors"
          >
            📋 Paste
          </button>
        </div>

        <PendingImageGrid
          images={pendingImages}
          onReorder={setPendingImages}
          onDelete={removeImage}
          pastePlaceholder={pastePlaceholder}
        />
      </div>

      {/* ── Audio section ── */}
      <div className="p-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800/50 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-violet-700 dark:text-violet-300">
            Audio{pendingAudio ? ' (1)' : recorder.isRecording ? ' — recording…' : ''}
          </h3>
          <button
            onClick={recorder.isRecording ? handleStopRecording : recorder.startRecording}
            className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 disabled:opacity-40 transition-colors"
          >
            {recorder.isRecording ? '⏹ Stop' : '🎙️ Record'}
          </button>
        </div>

        {recorder.isRecording ? (
          <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-violet-900/20 border border-violet-800/30">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
            <span className="text-xs text-violet-300 flex-1">Recording… {fmt(recorder.duration)}</span>
          </div>
        ) : pendingAudio ? (
          <div className="group flex items-center gap-2 py-1 px-2 rounded-lg bg-violet-900/20 border border-violet-800/30">
            <span className="w-4 h-4 bg-violet-500/30 border border-violet-400/50 text-violet-300 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0">
              1
            </span>
            <svg className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path d="M18 3a1 1 0 00-1.447-.894L8.763 6H5a3 3 0 000 6h.28l1.771 5.316A1 1 0 008 18h1a1 1 0 001-1v-4.382l6.553 3.276A1 1 0 0018 15V3z" />
            </svg>
            <span className="flex-1 text-xs text-violet-300">Voice note — {fmt(pendingAudio.durationSec)}</span>
            <button
              onClick={removeAudio}
              className="w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-sm opacity-0 group-hover:opacity-100 transition-opacity"
            >
              ×
            </button>
          </div>
        ) : (
          <div
            className="border-2 border-dashed border-violet-300 dark:border-violet-700 rounded-lg py-5 text-center cursor-pointer hover:border-violet-400 dark:hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors"
            onClick={recorder.startRecording}
          >
            <svg className="w-6 h-6 mx-auto mb-1 text-violet-300 dark:text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <p className="text-xs text-violet-400 dark:text-violet-500">Click to record audio</p>
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
          <TagInput tags={tags} onChange={setTags} placeholder="Add tags…" />
        </div>
        <button
          onClick={handleSave}
          disabled={isEmpty || saving}
          className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
          title="Save (⌘↵)"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
