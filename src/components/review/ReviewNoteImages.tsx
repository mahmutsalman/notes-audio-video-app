import { useState } from 'react';
import type { ReviewNoteImage } from '../../types';
import ImageLightbox from '../common/ImageLightbox';

interface ReviewNoteImagesProps {
  /** The note these pictures hang off. Must already exist in the DB (i.e. Enter was pressed). */
  noteId: number;
  images: ReviewNoteImage[];
  onChange: (images: ReviewNoteImage[]) => void;
  /** Dark study-session palette vs. the light Echo detail page. */
  variant?: 'dark' | 'light';
}

/**
 * Pictures attached to one reflective review note.
 *
 * Lightweight by design (ADR-0006): paste to attach, click to view, hover to delete.
 * No tags, no OCR, no FTS — which is why ImageLightbox is rendered without `mediaType`
 * or `imageType`, so its tag/OCR/enroll affordances stay hidden.
 */
export default function ReviewNoteImages({ noteId, images, onChange, variant = 'dark' }: ReviewNoteImagesProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const dark = variant === 'dark';

  const attachFromClipboard = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.electronAPI.clipboard.readImage();
      if (!result.success || !result.buffer) {
        // Reading the clipboard is not permission-gated; an empty result means the
        // clipboard genuinely holds no image (e.g. it holds text).
        setError('No image in the clipboard');
        return;
      }
      const buf = result.buffer as unknown as ArrayBuffer;
      const saved = await window.electronAPI.reviewNoteImages.add(noteId, buf, result.extension);
      onChange([...images, saved]);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (imageId: number) => {
    await window.electronAPI.reviewNoteImages.delete(imageId);
    onChange(images.filter(i => i.id !== imageId));
    setLightboxIndex(null);
  };

  const thumbSrc = (img: ReviewNoteImage) =>
    window.electronAPI.paths.getFileUrl(img.thumbnail_path ?? img.file_path);

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {images.map((img, i) => (
          <div key={img.id} className="group/img relative">
            <img
              src={thumbSrc(img)}
              alt={img.caption ?? ''}
              onClick={() => setLightboxIndex(i)}
              className={`h-12 w-12 object-cover rounded cursor-zoom-in border ${
                dark ? 'border-gray-700' : 'border-gray-200 dark:border-dark-border'
              }`}
            />
            <button
              onClick={() => remove(img.id)}
              title="Delete this image"
              className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-600 text-white text-[10px] leading-none
                         opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center"
            >
              ✕
            </button>
          </div>
        ))}

        <button
          onClick={attachFromClipboard}
          disabled={busy}
          title="Paste an image from the clipboard"
          className={`h-12 w-12 rounded border border-dashed flex items-center justify-center text-sm transition-colors
            disabled:opacity-50 ${
              dark
                ? 'border-gray-700 text-gray-600 hover:border-primary-500 hover:text-primary-400'
                : 'border-gray-300 dark:border-dark-border text-gray-400 hover:border-primary-400 hover:text-primary-500'
            }`}
        >
          {busy ? '…' : '＋'}
        </button>

        {error && <span className="text-[11px] text-gray-500">{error}</span>}
      </div>

      {lightboxIndex !== null && images[lightboxIndex] && (
        <ImageLightbox
          images={images.map(i => ({ file_path: i.file_path, caption: i.caption, id: i.id }))}
          selectedIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          onDelete={() => remove(images[lightboxIndex].id)}
        />
      )}
    </>
  );
}
