import { useState, useEffect } from 'react';
import type { ReviewEvent, ReviewNoteKind, ReviewNoteImage } from '../../types';
import { NoteThumbs, NoteVoicePlayback, ratingBadge, fmtDuration } from './ReviewNotePreview';

interface ReviewHistoryPanelProps {
  /** The echo whose past reviews to show. Changing it refetches. */
  reviewItemId: number;
  onClose: () => void;
  /**
   * Fires when this panel opens/closes its full-screen image overlay. The session's keyboard
   * handler listens in the CAPTURE phase and registers first, so it would otherwise swallow the
   * Escape meant for that overlay and end the session instead. It stands down while this is true —
   * the same contract `showQuestion` / `enlargedItemImage` / `showEditor` already have.
   */
  onOverlayChange?: (open: boolean) => void;
}

/**
 * "What did I say about this card last time?" — every past review of the CURRENT card, newest
 * first, alongside the card itself.
 *
 * Read-only by design. This sits beside a card you are actively grading, so the drawer answers a
 * question rather than opening a second editing surface mid-review; adding and editing past notes
 * stays on the Echo detail page (`/echo/:id`), which already does it. The panel therefore never
 * writes, and needs no refresh plumbing — it reloads when the card changes.
 *
 * No new IPC: `reviewEvents.getByItem` already returns each event with its notes nested, and each
 * note with its images and voice recordings.
 */
export default function ReviewHistoryPanel({ reviewItemId, onClose, onOverlayChange }: ReviewHistoryPanelProps) {
  const [events, setEvents] = useState<ReviewEvent[] | null>(null);
  const [enlarged, setEnlarged] = useState<ReviewNoteImage | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEvents(null);
    setEnlarged(null);
    window.electronAPI.reviewEvents.getByItem(reviewItemId).then(ev => {
      if (!cancelled) setEvents(ev);
    });
    return () => { cancelled = true; };
  }, [reviewItemId]);

  // Keep the session's keyboard handler informed, and hand it back the keyboard on unmount —
  // closing the drawer while an image is enlarged must not leave the session permanently deaf.
  useEffect(() => {
    onOverlayChange?.(enlarged !== null);
  }, [enlarged, onOverlayChange]);
  useEffect(() => () => { onOverlayChange?.(false); }, [onOverlayChange]);

  // Escape closes the enlarged image and nothing else. Safe to own outright: the session stands
  // down via onOverlayChange above while this is mounted.
  useEffect(() => {
    if (!enlarged) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setEnlarged(null);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [enlarged]);

  // A review with no notes still matters — the grade and the interval are themselves history.
  const byKind = (e: ReviewEvent, k: ReviewNoteKind) => (e.notes ?? []).filter(n => n.kind === k);

  return (
    <div className="w-[380px] shrink-0 border-l border-gray-800 bg-gray-900/60 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-200">History</span>
          {events && events.length > 0 && (
            <span className="text-[11px] text-gray-500 tabular-nums">
              {events.length} review{events.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          title="Hide history (H)"
          className="text-gray-500 hover:text-gray-200 transition-colors text-sm leading-none p-1"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 min-h-0">
        {events === null && (
          <p className="text-xs text-gray-600 text-center py-6">Loading history…</p>
        )}

        {events !== null && events.length === 0 && (
          <p className="text-xs text-gray-600 text-center py-6 leading-relaxed">
            No reviews logged yet.<br />
            <span className="text-gray-700">This is the first time you're seeing this card.</span>
          </p>
        )}

        {events !== null && events.length > 0 && (
          <ul className="flex flex-col gap-2">
            {events.map(ev => {
              const badge = ratingBadge(ev, 'dark');
              const when = new Date(ev.reviewed_at);
              const duration = fmtDuration(ev.duration_seconds);
              const notes = ev.notes ?? [];
              return (
                <li key={ev.id} className="rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>
                      {badge.label}
                    </span>
                    <span className="text-[11px] text-gray-400">
                      {when.toLocaleDateString()} · {when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {ev.interval_after != null && (
                      <span className="text-[10px] text-gray-600">→ next in {ev.interval_after}d</span>
                    )}
                    {duration && <span className="text-[10px] text-gray-600">· ⏱ {duration}</span>}
                  </div>

                  {ev.stability_after != null && (
                    <p
                      className="mt-1 text-[10px] text-gray-600"
                      title="FSRS stability (days) and difficulty (/10) after this review"
                    >
                      S {ev.stability_after >= 1 ? Math.round(ev.stability_after) : ev.stability_after.toFixed(1)}
                      {ev.difficulty_after != null && ` · D ${ev.difficulty_after.toFixed(1)}`}
                    </p>
                  )}

                  {notes.length > 0 && (
                    <div className="mt-2 flex flex-col gap-2">
                      {byKind(ev, 'note').map(n => (
                        <div key={n.id} className="flex flex-col gap-1.5">
                          {n.body && (
                            <p className="text-[13px] text-gray-300 whitespace-pre-wrap break-words leading-relaxed">
                              {n.body}
                            </p>
                          )}
                          <NoteThumbs images={n.images ?? []} variant="dark" onOpen={setEnlarged} />
                          <NoteVoicePlayback audios={n.audios ?? []} variant="dark" />
                        </div>
                      ))}
                      {byKind(ev, 'missed').map(n => (
                        <div key={n.id} className="flex flex-col gap-1.5">
                          {n.body && (
                            <p className="text-[13px] text-amber-400/90 whitespace-pre-wrap break-words leading-relaxed">
                              <span className="text-[10px] uppercase tracking-wide text-amber-500/60 mr-1">Missed</span>
                              {n.body}
                            </p>
                          )}
                          <NoteThumbs images={n.images ?? []} variant="dark" onOpen={setEnlarged} />
                          <NoteVoicePlayback audios={n.audios ?? []} variant="dark" />
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* A 380px column can't show a screenshot. Click a thumb to fill the window.
          z-[70] clears the card and the drawer but stays under the question popup (z-[80]). */}
      {enlarged && (
        <div
          className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-8"
          onClick={() => setEnlarged(null)}
        >
          <img
            src={window.electronAPI.paths.getFileUrl(enlarged.file_path)}
            alt={enlarged.caption ?? ''}
            className="max-w-full max-h-full object-contain"
          />
          <button
            onClick={() => setEnlarged(null)}
            className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl leading-none"
            title="Close (click anywhere)"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
