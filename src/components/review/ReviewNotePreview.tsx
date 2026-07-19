import { useState, useEffect, useRef } from 'react';
import type { ReviewEvent, ReviewNoteImage, ReviewNoteAudio } from '../../types';
import { RATING_META } from '../../utils/fsrs';

/**
 * Read-only renderers for a logged review note's attachments, shared by the Echo detail page
 * (light surfaces, theme-aware) and the in-session history drawer (always dark).
 *
 * `variant` is NOT cosmetic sugar: the review session paints a hardcoded `bg-gray-950` regardless
 * of the app theme, so Tailwind's `dark:` variants — which key off the root class — do not fire
 * there. In light theme these components would otherwise render light-on-black. Every dark style
 * below is therefore stated outright rather than left to `dark:`.
 *
 * Editing lives in ReviewNoteImages / ReviewNoteAudios; nothing here writes.
 */

export type ReviewPreviewVariant = 'dark' | 'light';

/** Forced-dark rating chips. RATING_META's own classes lean on `dark:` — see the note above. */
const RATING_DARK: Record<number, string> = {
  1: 'bg-red-900/40 text-red-300',
  2: 'bg-orange-900/40 text-orange-300',
  3: 'bg-blue-900/40 text-blue-300',
  4: 'bg-emerald-900/40 text-emerald-300',
};

export function ratingBadge(e: ReviewEvent, variant: ReviewPreviewVariant = 'light') {
  const dark = variant === 'dark';
  if (e.rating == null) {
    return {
      label: e.scheduling_mode === 'manual' ? 'Manual' : '—',
      cls: dark
        ? 'bg-gray-800 text-gray-400'
        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    };
  }
  const meta = RATING_META[e.rating];
  if (!meta) return { label: String(e.rating), cls: dark ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-600' };
  return { label: meta.label, cls: dark ? (RATING_DARK[e.rating] ?? 'bg-gray-800 text-gray-400') : meta.cls };
}

export function fmtDuration(sec: number | null): string | null {
  if (sec == null) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Play a note's voice notes without entering edit mode. Recording lives in ReviewNoteAudios. */
export function NoteVoicePlayback({
  audios,
  variant = 'light',
}: {
  audios: ReviewNoteAudio[];
  variant?: ReviewPreviewVariant;
}) {
  const [playingId, setPlayingId] = useState<number | null>(null);
  const elRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => { elRef.current?.pause(); elRef.current = null; }, []);
  if (audios.length === 0) return null;

  const dark = variant === 'dark';

  const play = (a: ReviewNoteAudio) => {
    elRef.current?.pause();
    if (playingId === a.id) { setPlayingId(null); return; }
    const el = new Audio(window.electronAPI.paths.getFileUrl(a.file_path));
    el.onended = () => setPlayingId(null);
    elRef.current = el;
    setPlayingId(a.id);
    void el.play();
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {audios.map((a, i) => (
        <button
          key={a.id}
          onClick={() => play(a)}
          title={playingId === a.id ? 'Stop' : 'Play this voice note'}
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 border text-[11px] transition-colors ${
            dark
              ? 'border-gray-700 bg-gray-900 text-gray-300 hover:border-blue-500'
              : 'border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-gray-600 dark:text-gray-300 hover:border-primary-400'
          }`}
        >
          <span className="leading-none">{playingId === a.id ? '⏹' : '▶'}</span>
          <span className="tabular-nums">
            🎙 {a.duration != null ? `${Math.floor(a.duration / 60)}:${String(Math.floor(a.duration % 60)).padStart(2, '0')}` : `#${i + 1}`}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Read-only thumbnail strip for a note's pictures. Editing lives in ReviewNoteImages. */
export function NoteThumbs({
  images,
  variant = 'light',
  onOpen,
}: {
  images: ReviewNoteImage[];
  variant?: ReviewPreviewVariant;
  /** Optional click-to-enlarge. Omitted on the detail page, where the column is already readable. */
  onOpen?: (image: ReviewNoteImage) => void;
}) {
  if (images.length === 0) return null;
  const dark = variant === 'dark';
  return (
    <div className="flex flex-wrap gap-1.5">
      {images.map(img => (
        <img
          key={img.id}
          src={window.electronAPI.paths.getFileUrl(img.thumbnail_path ?? img.file_path)}
          alt={img.caption ?? ''}
          onClick={onOpen ? () => onOpen(img) : undefined}
          title={onOpen ? (img.caption ?? 'Click to enlarge') : (img.caption ?? '')}
          className={`h-12 w-12 object-cover rounded border ${
            dark ? 'border-gray-700' : 'border-gray-200 dark:border-dark-border'
          } ${onOpen ? 'cursor-zoom-in hover:border-blue-500 transition-colors' : ''}`}
        />
      ))}
    </div>
  );
}
