import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ReviewItem, ReviewMask, ReviewRating, ReviewPreset, ReviewNote, ReviewNoteKind } from '../../types';
import { formatDueExact } from '../../utils/srsAlgorithm';
import {
  previewRatings, applyRating, applyManual, applyManualDate,
  buildRatingEvent, buildManualEvent, type ReviewNoteExtras,
} from '../../utils/fsrs';
import PixelatedImage from './PixelatedImage';
import ReviewNoteImages from './ReviewNoteImages';
import ReviewCodePane from './ReviewCodePane';

interface ReviewSessionProps {
  items: ReviewItem[];
  onSessionEnd: () => void;
  /**
   * Peek mode: browse the masked "front" of cards (reveal blur, ←/→ navigate) without
   * saving any progress. Hides every study-only control (rating buttons, manual schedule,
   * reflective note, timer) — the only code paths that write FSRS state / review_events —
   * so nothing can be persisted.
   */
  readOnly?: boolean;
}

/** The two reflective prompts. Both accept many notes; Enter logs one and starts the next. */
const NOTE_COLUMNS: { kind: ReviewNoteKind; placeholder: string; nextPlaceholder: string }[] = [
  {
    kind: 'note',
    placeholder: 'What did you think? How did it feel? (Enter to log · Shift+Enter for new line)',
    nextPlaceholder: 'Another thought? (Enter to log)',
  },
  {
    kind: 'missed',
    placeholder: 'What did you miss / keep forgetting? (Enter to log · Shift+Enter for new line)',
    nextPlaceholder: 'Anything else you missed? (Enter to log)',
  },
];

const RATING_CONFIG: { rating: ReviewRating; label: string; color: string; hint: string }[] = [
  { rating: 'again', label: 'Again', color: 'bg-red-600 hover:bg-red-500', hint: 'Blackout — reset' },
  { rating: 'hard', label: 'Hard', color: 'bg-orange-600 hover:bg-orange-500', hint: 'Difficult' },
  { rating: 'good', label: 'Good', color: 'bg-blue-600 hover:bg-blue-500', hint: 'Normal recall' },
  { rating: 'easy', label: 'Easy', color: 'bg-emerald-600 hover:bg-emerald-500', hint: 'Perfect recall' },
];

function formatTimer(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export default function ReviewSession({ items, onSessionEnd, readOnly = false }: ReviewSessionProps) {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [masks, setMasks] = useState<ReviewMask[]>([]);
  const [revealedMaskIds, setRevealedMaskIds] = useState<Set<number>>(new Set());
  const [allRevealed, setAllRevealed] = useState(false);
  // "Rate this card" shows the grading controls while leaving the masks blurred, so grading
  // does not force you to look at the answer. Revealing everything implies it too.
  const [ratingsRequested, setRatingsRequested] = useState(false);
  // Scratch code pad visibility, remembered across sessions. Off by default so an existing
  // review flow is unchanged until you ask for it.
  const [showCodePane, setShowCodePane] = useState(
    () => localStorage.getItem('echo.showCodePane') === '1'
  );
  useEffect(() => {
    localStorage.setItem('echo.showCodePane', showCodePane ? '1' : '0');
  }, [showCodePane]);
  const [showManualSchedule, setShowManualSchedule] = useState(false);
  const [isRating, setIsRating] = useState(false);

  // Editable manual-schedule presets (loaded from DB once).
  const [presets, setPresets] = useState<ReviewPreset[]>([]);
  const [managePresets, setManagePresets] = useState(false);
  const [newPresetDays, setNewPresetDays] = useState('');

  const loadPresets = useCallback(() => {
    window.electronAPI.reviewPresets.getAll().then(setPresets);
  }, []);
  useEffect(() => { loadPresets(); }, [loadPresets]);

  // Per-review reflective notes + optional study timer (reset on each card).
  // `note` / `missedPoints` are only the *pending* text in each box; committed notes live in
  // `draftNotes`, persisted the moment Enter is pressed so navigating away cannot lose them.
  const [note, setNote] = useState('');
  const [missedPoints, setMissedPoints] = useState('');
  const [draftNotes, setDraftNotes] = useState<ReviewNote[]>([]);
  // Inline edit of an already-logged note. null = nothing being edited.
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const [showNotePanel, setShowNotePanel] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const timerTouched = useRef(false);

  const current = items[currentIndex] ?? null;

  const goPrev = useCallback(() => setCurrentIndex(i => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => setCurrentIndex(i => Math.min(items.length - 1, i + 1)), [items.length]);

  // ── Image zoom (Cmd/Ctrl + wheel), mirroring the ImageLightbox behavior ──────────
  const imageAreaRef = useRef<HTMLDivElement>(null);
  const imageWrapRef = useRef<HTMLDivElement>(null);
  const [imgScale, setImgScale] = useState(1);
  const [imgTranslate, setImgTranslate] = useState({ x: 0, y: 0 });
  const imgScaleRef = useRef(1);
  useEffect(() => { imgScaleRef.current = imgScale; }, [imgScale]);

  // Keep the (letterboxed) image from panning past the viewport edge
  const clampImgTranslate = useCallback((t: { x: number; y: number }, s: number) => {
    const area = imageAreaRef.current;
    if (!area) return t;
    const w = area.clientWidth, h = area.clientHeight;
    const maxX = Math.max(0, (w * s - w) / 2);
    const maxY = Math.max(0, (h * s - h) / 2);
    return { x: Math.max(-maxX, Math.min(maxX, t.x)), y: Math.max(-maxY, Math.min(maxY, t.y)) };
  }, []);

  // Reset zoom whenever the card changes
  useEffect(() => { setImgScale(1); setImgTranslate({ x: 0, y: 0 }); }, [currentIndex]);

  // Cmd/Ctrl+scroll → zoom at cursor; plain scroll while zoomed → pan
  useEffect(() => {
    const area = imageAreaRef.current;
    if (!area) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const wrap = imageWrapRef.current;
        if (!wrap) return;
        const rect = wrap.getBoundingClientRect();
        const cursorX = e.clientX - (rect.left + rect.width / 2);
        const cursorY = e.clientY - (rect.top + rect.height / 2);
        const zoomFactor = 1 - e.deltaY * 0.01;
        setImgScale(prev => {
          const next = Math.min(5, Math.max(1, prev * zoomFactor));
          const ratio = next / prev;
          if (next === 1) {
            setImgTranslate({ x: 0, y: 0 });
          } else if (next !== prev) {
            setImgTranslate(t => clampImgTranslate({
              x: cursorX - ratio * (cursorX - t.x),
              y: cursorY - ratio * (cursorY - t.y),
            }, next));
          }
          return next;
        });
        return;
      }
      if (imgScaleRef.current > 1) {
        e.preventDefault();
        setImgTranslate(t => clampImgTranslate({ x: t.x - e.deltaX, y: t.y - e.deltaY }, imgScaleRef.current));
      }
    };
    area.addEventListener('wheel', onWheel, { passive: false });
    return () => area.removeEventListener('wheel', onWheel);
  }, [clampImgTranslate]);

  // Keyboard: Esc ends the session; ← / → skip between images (without rating).
  // Capture phase + stopImmediatePropagation so this full-screen session owns the keys
  // even when launched from a page with its own arrow/Esc handlers (e.g. a written note's
  // mark navigation). Ignored while typing in the note/preset fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onSessionEnd(); return; }
      if (typing) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); goPrev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopImmediatePropagation(); goNext(); }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [onSessionEnd, goPrev, goNext]);

  // Load masks + reset per-card state when the current item changes.
  useEffect(() => {
    if (!current) return;
    setRevealedMaskIds(new Set());
    setAllRevealed(false);
    setRatingsRequested(false);
    setShowManualSchedule(false);
    setNote('');
    setMissedPoints('');
    setShowNotePanel(false);
    setElapsedSeconds(0);
    setTimerRunning(false);
    setEditingNoteId(null);
    setEditingBody('');
    timerTouched.current = false;
    window.electronAPI.reviewMasks.getByItem(current.id).then(setMasks);
    // Re-hydrate any notes logged for this card but not yet tied to a rating — e.g. typed,
    // then navigated away with the arrow keys, or logged in an abandoned session.
    window.electronAPI.reviewNotes.getDraftsByItem(current.id).then(setDraftNotes);
  }, [current?.id]);

  // If no masks, consider auto-revealed
  useEffect(() => {
    if (masks.length === 0) setAllRevealed(true);
  }, [masks]);

  // Study timer ticker.
  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [timerRunning]);

  const toggleTimer = () => {
    timerTouched.current = true;
    setTimerRunning(r => !r);
  };

  const revealMask = useCallback((maskId: number) => {
    setRevealedMaskIds(prev => {
      const next = new Set(prev);
      next.add(maskId);
      if (next.size === masks.length) setAllRevealed(true);
      return next;
    });
  }, [masks.length]);

  const revealAll = () => {
    setRevealedMaskIds(new Set(masks.map(m => m.id)));
    setAllRevealed(true);
  };

  /** Grading controls are up once you've either seen the answer or explicitly asked to grade. */
  const canRate = allRevealed || ratingsRequested;

  /** Persist one note now and clear its box, ready for the next. No-op on empty text. */
  const commitNote = useCallback(async (kind: ReviewNoteKind, body: string): Promise<ReviewNote | null> => {
    if (!current || !body.trim()) return null;
    const saved = await window.electronAPI.reviewNotes.add(current.id, kind, body);
    setDraftNotes(prev => [...prev, saved]);
    return saved;
  }, [current?.id]);

  const removeNote = async (id: number) => {
    await window.electronAPI.reviewNotes.delete(id);
    setDraftNotes(prev => prev.filter(n => n.id !== id));
  };

  const beginEditNote = (n: ReviewNote) => {
    setEditingNoteId(n.id);
    setEditingBody(n.body);
  };

  const cancelEditNote = () => {
    setEditingNoteId(null);
    setEditingBody('');
  };

  /**
   * Save an edited note. An empty body is a cancel, not a delete — `ReviewNoteOperations.update`
   * rejects an empty body, and silently deleting on backspace-to-empty would be a trapdoor.
   * Deleting is the ✕ button, explicitly.
   */
  const saveEditNote = async () => {
    if (editingNoteId === null) return;
    const id = editingNoteId;
    const body = editingBody.trim();
    const original = draftNotes.find(n => n.id === id);
    if (!body || body === original?.body) return cancelEditNote();
    await window.electronAPI.reviewNotes.update(id, body);
    setDraftNotes(prev => prev.map(n => n.id === id ? { ...n, body } : n));
    cancelEditNote();
  };

  // Enter logs the note and starts a fresh one (no newline); Shift+Enter inserts a newline.
  // The accomplishment glow replays on every press: drop the class, force a reflow, re-add.
  const handleNoteKeyDown = (kind: ReviewNoteKind) => async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    const el = e.currentTarget;
    const body = el.value;
    if (!body.trim()) return;

    el.classList.remove('animate-input-glow');
    void el.offsetWidth; // force reflow so the animation replays
    el.classList.add('animate-input-glow');

    if (kind === 'note') setNote(''); else setMissedPoints('');
    await commitNote(kind, body);
  };

  // Preview the four FSRS outcomes once per card (drives the button due-labels).
  // Skipped in Peek mode — the rating buttons are hidden, and browse-opened cards may
  // lack the FSRS fields previewRatings expects.
  const previews = useMemo(
    () => (current && !readOnly ? previewRatings(current) : null),
    [current?.id, readOnly],
  );

  const noteExtras = (): ReviewNoteExtras => ({
    durationSeconds: timerTouched.current ? elapsedSeconds : null,
  });

  /**
   * Commit whatever is still sitting in the two boxes un-Entered, then return every draft
   * note id for this card. Rating with text left in a box must never silently discard it.
   * Reads the freshly-saved rows directly — `draftNotes` state has not re-rendered yet.
   */
  const flushPendingNotes = async (): Promise<number[]> => {
    const pending = await Promise.all([
      commitNote('note', note),
      commitNote('missed', missedPoints),
    ]);
    setNote('');
    setMissedPoints('');
    return [...draftNotes.map(n => n.id), ...pending.filter(Boolean).map(n => n!.id)];
  };

  const handleRate = async (rating: ReviewRating) => {
    if (!current || isRating) return;
    setIsRating(true);
    const noteIds = await flushPendingNotes();
    const applied = applyRating(current, rating);
    const event = buildRatingEvent(current, applied, rating, noteExtras());
    await window.electronAPI.review.rate(current.id, applied.fields, event, noteIds);
    advance();
  };

  const handleManualSchedule = async (days: number) => {
    if (!current || isRating) return;
    setIsRating(true);
    const noteIds = await flushPendingNotes();
    const fields = applyManual(current, days);
    const event = buildManualEvent(current, fields, noteExtras());
    await window.electronAPI.review.schedule(current.id, fields, event, noteIds);
    advance();
  };

  const handleManualDate = async (dateStr: string) => {
    if (!current || isRating || !dateStr) return;
    setIsRating(true);
    const noteIds = await flushPendingNotes();
    const fields = applyManualDate(current, new Date(dateStr + 'T00:00:00'));
    const event = buildManualEvent(current, fields, noteExtras());
    await window.electronAPI.review.schedule(current.id, fields, event, noteIds);
    advance();
  };

  const addPreset = async () => {
    const days = parseInt(newPresetDays, 10);
    if (!Number.isFinite(days) || days < 1) return;
    const label = days % 30 === 0 && days >= 30 ? `${days / 30} month${days > 30 ? 's' : ''}`
      : days % 7 === 0 ? `${days / 7} week${days > 7 ? 's' : ''}`
      : `${days} day${days > 1 ? 's' : ''}`;
    await window.electronAPI.reviewPresets.create(label, days);
    setNewPresetDays('');
    loadPresets();
  };

  const deletePreset = async (id: number) => {
    await window.electronAPI.reviewPresets.delete(id);
    loadPresets();
  };

  const advance = () => {
    setIsRating(false);
    if (currentIndex + 1 >= items.length) {
      onSessionEnd();
    } else {
      setCurrentIndex(i => i + 1);
    }
  };

  const handleNavigateToOriginal = () => {
    if (!current) return;
    if (current.recording_id) {
      navigate(`/recording/${current.recording_id}`);
    } else if (current.capture_id) {
      navigate('/capture');
    }
  };

  if (!current) return null;

  const fileSrc = window.electronAPI.paths.getFileUrl(current.file_path ?? '');
  const progress = `${currentIndex + 1} / ${items.length}`;

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col">
      {/* Top bar — titlebar-drag so empty space still moves the window; every button
          below is titlebar-no-drag so it stays clickable inside the macOS title strip
          (app-region is computed globally and ignores the overlay's z-index). */}
      <div className="titlebar-drag flex items-center justify-between px-5 py-3 border-b border-gray-800">
        {/* Traffic light spacer */}
        <div className="w-16 flex-shrink-0" />
        <button
          onClick={onSessionEnd}
          className="titlebar-no-drag text-gray-400 hover:text-white text-sm transition-colors flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          {readOnly ? 'Close' : 'End Session'}
        </button>

        <div className="flex items-center gap-4">
          {/* Study timer chip — study-only, hidden in Peek mode */}
          {!readOnly && (
          <button
            onClick={toggleTimer}
            className={`titlebar-no-drag flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium tabular-nums transition-colors ${
              timerRunning
                ? 'bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30'
                : timerTouched.current
                  ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
            }`}
            title={timerRunning ? 'Pause study timer' : 'Start study timer (optional)'}
          >
            {timerRunning ? (
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16"><rect x="4" y="3" width="3" height="10" rx="1" /><rect x="9" y="3" width="3" height="10" rx="1" /></svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16"><path d="M5 3.5v9l7-4.5-7-4.5z" /></svg>
            )}
            <span>⏱ {formatTimer(elapsedSeconds)}</span>
          </button>
          )}

          {/* Skip navigation — move between images without rating */}
          <div className="flex items-center gap-1">
            <button
              onClick={goPrev}
              disabled={currentIndex === 0}
              className="titlebar-no-drag p-1 rounded-md text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              title="Previous image (←) — no rating"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="text-gray-300 text-sm font-medium tabular-nums min-w-[3.5rem] text-center">{progress}</div>
            <button
              onClick={goNext}
              disabled={currentIndex >= items.length - 1}
              className="titlebar-no-drag p-1 rounded-md text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              title="Next image (→) — no rating"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowCodePane(v => !v)}
            title={showCodePane ? 'Hide the scratch code pad' : 'Show the scratch code pad'}
            className={`titlebar-no-drag text-sm transition-colors flex items-center gap-1.5 ${
              showCodePane ? 'text-blue-400 hover:text-blue-300' : 'text-gray-400 hover:text-blue-400'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            Code
          </button>

          {(current.recording_id || current.capture_id) && (
            <button
              onClick={handleNavigateToOriginal}
              className="titlebar-no-drag text-gray-400 hover:text-blue-400 text-sm transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Go to original
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-800">
        <div
          className="h-1 bg-blue-600 transition-all duration-300"
          style={{ width: `${((currentIndex) / items.length) * 100}%` }}
        />
      </div>

      {/* Source context */}
      {(current.topic_name || current.recording_name) && (
        <div className="flex items-center gap-2 px-5 py-2 text-xs text-gray-500">
          {current.topic_name && <span>{current.topic_name}</span>}
          {current.topic_name && current.recording_name && <span>›</span>}
          {current.recording_name && <span>{current.recording_name}</span>}
          {current.caption && <span className="text-gray-400 ml-2">— {current.caption}</span>}
        </div>
      )}

      {/* Image area — Cmd/Ctrl + wheel to zoom, scroll to pan when zoomed */}
      {/* Card + optional scratch code pad, side by side. The card keeps its own zoom/pan refs. */}
      <div className="flex-1 flex min-h-0">
        <div
          ref={imageAreaRef}
          className="flex-1 relative flex items-center justify-center px-4 py-2 overflow-hidden min-h-0"
        >
          {current.file_path && (
            <div
              ref={imageWrapRef}
              className="w-full h-full"
              style={{
                transform: `scale(${imgScale}) translate(${imgTranslate.x / imgScale}px, ${imgTranslate.y / imgScale}px)`,
                transformOrigin: 'center center',
                cursor: imgScale > 1 ? 'grab' : 'default',
              }}
            >
              <PixelatedImage
                src={fileSrc}
                masks={masks}
                revealedMaskIds={revealedMaskIds}
                onMaskClick={revealMask}
                className="w-full h-full"
              />
            </div>
          )}
          {imgScale > 1 && (
            <div className="absolute top-3 right-3 bg-black/60 text-white/80 text-xs px-2 py-1 rounded-full pointer-events-none">
              {Math.round(imgScale * 100)}%
            </div>
          )}
        </div>

        {showCodePane && (
          <div className="w-[42%] min-w-[320px] max-w-[760px] min-h-0 shrink-0">
            {/* Keyed on the card: remounting is what guarantees the pad reloads and the previous
                card's pending autosave flushes before the next one loads. */}
            <ReviewCodePane key={current.id} reviewItemId={current.id} readOnly={readOnly} />
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="px-5 py-4 border-t border-gray-800 flex flex-col gap-3">
        {/* Reveal All + "Rate this card" + hint list */}
        {!allRevealed && masks.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={revealAll}
              className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
            >
              Reveal All
            </button>
            {!readOnly && !ratingsRequested && (
              <button
                onClick={() => setRatingsRequested(true)}
                title="Grade this card without revealing the masks"
                className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700
                           text-sm rounded-lg transition-colors"
              >
                Rate this card
              </button>
            )}
            {masks.filter(m => !revealedMaskIds.has(m.id) && m.hint_text).map(m => (
              <span
                key={m.id}
                className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded cursor-pointer hover:bg-gray-700 transition-colors"
                onClick={() => revealMask(m.id)}
              >
                💡 {m.hint_text}
              </span>
            ))}
          </div>
        )}

        {/* Reflective note panel — the "what did I think / what did I miss" log.
            Study-only; hidden in Peek mode. */}
        {!readOnly && canRate && (
          <div className="flex flex-col gap-2">
            {!showNotePanel ? (
              <button
                onClick={() => setShowNotePanel(true)}
                className="self-start text-gray-500 hover:text-gray-300 text-xs transition-colors flex items-center gap-1"
              >
                ✍️ Add a review note
                {draftNotes.length > 0
                  ? ` • ${draftNotes.length}`
                  : (note || missedPoints) ? ' •' : ''}
              </button>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {NOTE_COLUMNS.map(col => {
                  const logged = draftNotes.filter(n => n.kind === col.kind);
                  const value = col.kind === 'note' ? note : missedPoints;
                  const setValue = col.kind === 'note' ? setNote : setMissedPoints;
                  return (
                    <div key={col.kind} className="flex flex-col gap-1.5">
                      {logged.map((n, i) => (
                        <div
                          key={n.id}
                          className="group flex flex-col gap-1.5 rounded-lg bg-gray-800/60 border border-gray-700 px-3 py-1.5"
                        >
                          <div className="flex items-start gap-2">
                            <span className="text-[10px] text-gray-500 tabular-nums pt-0.5 shrink-0">{i + 1}</span>
                            {editingNoteId === n.id ? (
                              <textarea
                                autoFocus
                                rows={Math.min(6, editingBody.split('\n').length)}
                                value={editingBody}
                                onChange={e => setEditingBody(e.target.value)}
                                onBlur={saveEditNote}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void saveEditNote(); }
                                  else if (e.key === 'Escape') { e.preventDefault(); cancelEditNote(); }
                                }}
                                className="flex-1 resize-none bg-gray-900/60 border border-primary-600 rounded px-2 py-1
                                           text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-500"
                              />
                            ) : (
                              <p
                                onClick={() => beginEditNote(n)}
                                title="Click to edit • Enter saves, Shift+Enter for a newline, Esc cancels"
                                className="flex-1 text-sm text-gray-300 whitespace-pre-wrap break-words cursor-text
                                           rounded px-1 -mx-1 hover:bg-gray-700/40 transition-colors"
                              >
                                {n.body}
                              </p>
                            )}
                            <button
                              onClick={() => removeNote(n.id)}
                              title="Delete this note"
                              className="shrink-0 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs leading-none pt-1"
                            >
                              ✕
                            </button>
                          </div>
                          <div className="pl-5">
                            <ReviewNoteImages
                              noteId={n.id}
                              images={n.images ?? []}
                              onChange={imgs => setDraftNotes(prev =>
                                prev.map(x => x.id === n.id ? { ...x, images: imgs } : x)
                              )}
                            />
                          </div>
                        </div>
                      ))}
                      <textarea
                        value={value}
                        onChange={e => setValue(e.target.value)}
                        onKeyDown={handleNoteKeyDown(col.kind)}
                        onAnimationEnd={e => e.currentTarget.classList.remove('animate-input-glow')}
                        placeholder={logged.length > 0 ? col.nextPlaceholder : col.placeholder}
                        rows={2}
                        className="w-full resize-none rounded-lg bg-gray-900 border border-gray-800 text-gray-200 text-sm px-3 py-2 placeholder-gray-600 focus:outline-none focus:border-gray-600"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Rating buttons — shown after Reveal All or "Rate this card". Hidden in Peek mode
            (these are the only controls that write FSRS state / a review_events row). */}
        {!readOnly && canRate && !showManualSchedule && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              {RATING_CONFIG.map(({ rating, label, color, hint }) => {
                const preview = previews?.[rating];
                return (
                  <button
                    key={rating}
                    onClick={() => handleRate(rating)}
                    disabled={isRating}
                    className={`flex-1 py-2.5 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50 flex flex-col items-center gap-0.5 ${color}`}
                  >
                    <span>{label}</span>
                    <span className="text-[11px] opacity-75">{preview ? formatDueExact(preview.nextReviewAt) : ''}</span>
                    <span className="text-[10px] opacity-50">{hint}</span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setShowManualSchedule(true)}
              className="text-gray-500 hover:text-gray-300 text-xs text-center transition-colors"
            >
              Manual schedule instead…
            </button>
          </div>
        )}

        {/* Manual schedule — study-only; hidden in Peek mode. */}
        {!readOnly && canRate && showManualSchedule && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-gray-300 text-sm">Schedule for:</span>
              <button
                onClick={() => setManagePresets(m => !m)}
                className="text-gray-500 hover:text-gray-300 text-xs"
                title="Add or remove presets"
              >
                {managePresets ? 'Done' : 'Edit presets'}
              </button>
              <button
                onClick={() => { setShowManualSchedule(false); setManagePresets(false); }}
                className="text-gray-500 hover:text-gray-300 text-xs ml-auto"
              >
                ← Use algorithm instead
              </button>
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              {presets.map(p => (
                <div key={p.id} className="relative group/preset">
                  <button
                    onClick={() => handleManualSchedule(p.days)}
                    disabled={isRating}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                  >
                    {p.label}
                  </button>
                  {managePresets && (
                    <button
                      onClick={() => deletePreset(p.id)}
                      className="absolute -top-1.5 -right-1.5 bg-red-600 text-white w-4 h-4 rounded-full text-[10px] flex items-center justify-center"
                      title="Delete preset"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}

              {managePresets && (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    value={newPresetDays}
                    onChange={e => setNewPresetDays(e.target.value)}
                    placeholder="days"
                    className="w-16 px-2 py-1.5 bg-gray-900 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-gray-500"
                  />
                  <button
                    onClick={addPreset}
                    className="px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-sm rounded-lg transition-colors"
                  >
                    ＋ Add
                  </button>
                </div>
              )}
            </div>

            {/* Arbitrary calendar date */}
            <div className="flex items-center gap-2 mt-1">
              <span className="text-gray-500 text-xs">or pick a date:</span>
              <input
                type="date"
                disabled={isRating}
                onChange={e => handleManualDate(e.target.value)}
                className="px-2 py-1 bg-gray-900 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:border-gray-500 disabled:opacity-50"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
