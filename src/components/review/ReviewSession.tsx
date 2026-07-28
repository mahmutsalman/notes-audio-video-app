import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ReviewItem, ReviewMask, ReviewRating, ReviewPreset, ReviewNote, ReviewNoteKind, ReviewItemNote, ReviewItemAudio, ReviewItemImage, AudioMarker, MediaTagType } from '../../types';
import { formatDueExact } from '../../utils/srsAlgorithm';
import {
  previewRatings, applyRating, applyManual, applyManualDate,
  buildRatingEvent, buildManualEvent, type ReviewNoteExtras,
} from '../../utils/fsrs';
import { formatMarkSource, parseQuestionImages } from '../../utils/marks';
import PixelatedImage from './PixelatedImage';
import MaskEditor from './MaskEditor';
import ReviewNoteAudios from './ReviewNoteAudios';
import ReviewNoteAttachments from './ReviewNoteAttachments';
import ReviewCodePane from './ReviewCodePane';
import ReviewHistoryPanel from './ReviewHistoryPanel';
import ZoomableImageOverlay from './ZoomableImageOverlay';
import ThemedAudioPlayer from '../audio/ThemedAudioPlayer';

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
  // Side content authored on the echo itself in "Add to Echo" — extra prompts beyond the masks.
  const [itemNotes, setItemNotes] = useState<ReviewItemNote[]>([]);
  const [itemAudios, setItemAudios] = useState<(ReviewItemAudio & { markers: AudioMarker[] })[]>([]);
  const [itemImages, setItemImages] = useState<ReviewItemImage[]>([]);
  // Enlarged side image (media:// url), or null when none is open.
  const [enlargedItemImage, setEnlargedItemImage] = useState<string | null>(null);
  // The read/update editor for the CURRENT card — the same MaskEditor the lightbox's ≋ chip
  // opens. Live autosave; the session's masks stay in sync via onMasksChanged.
  const [showEditor, setShowEditor] = useState(false);
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
  // Past reviews of the CURRENT card, in a drawer beside it. Off by default and remembered like
  // the code pad — an existing review flow is unchanged until you ask for the history.
  const [showHistory, setShowHistory] = useState(
    () => localStorage.getItem('echo.showHistory') === '1'
  );
  useEffect(() => {
    localStorage.setItem('echo.showHistory', showHistory ? '1' : '0');
  }, [showHistory]);
  // True while the history drawer has its own full-screen image open — see ReviewHistoryPanel.
  const [historyOverlay, setHistoryOverlay] = useState(false);
  // How many past reviews the current card has, shown on the History button. null = not loaded yet.
  //
  // This exists because an empty drawer is ambiguous: seven freshly-enrolled cards in a row each
  // correctly said "no reviews logged yet", which is indistinguishable from a panel that stopped
  // refreshing. The count on the button disambiguates it, and answers "is there anything here?"
  // WITHOUT opening the drawer.
  //
  // Deliberately `getItemStats` (a COUNT aggregate) rather than the full `getByItem` tree: this
  // runs for every card whether or not the drawer is open. It counts the same rows the drawer
  // renders — manual reschedules included, which is why both say "reviews" and not "ratings" —
  // so the button and the panel header cannot disagree.
  const [historyCount, setHistoryCount] = useState<number | null>(null);
  // Focus mode — strips every chrome row (top bar, progress, source context, bottom controls)
  // so only the card image remains. Built for screen recording, where the surrounding metadata
  // reads as clutter on video. Remembered across sessions like the code pad: you turn it on for
  // a recording, not for one card.
  const [focusMode, setFocusMode] = useState(
    () => localStorage.getItem('echo.focusMode') === '1'
  );
  useEffect(() => {
    localStorage.setItem('echo.focusMode', focusMode ? '1' : '0');
  }, [focusMode]);
  // The question popup. Closed by default: the source LINE is always visible (it tells you WHAT the
  // card is about), but the question IMAGE is a hint — opening it is a deliberate choice, and it
  // closes again on every card so a peek at one never carries into the next.
  const [showQuestion, setShowQuestion] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
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

  // The mark's question images. Computed here (not after the early return below) so the popup's
  // keyboard effect can size its ←/→ wrap-around from it.
  const questions = useMemo(
    () => parseQuestionImages(current?.question_images_json),
    [current]
  );

  const goPrev = useCallback(() => setCurrentIndex(i => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => setCurrentIndex(i => Math.min(items.length - 1, i + 1)), [items.length]);

  /**
   * R = put the masks back. Re-blurs everything revealed on this card so it can be attempted a
   * second time without leaving and re-entering the session — which would also cost the card's
   * place in the queue, the study timer, and any note typed so far.
   *
   * `ratingsRequested` is deliberately NOT cleared: "I want to grade this" is an explicit act with
   * Space as its own toggle. Only the reveal is undone, so a card opened with Reveal All re-seals
   * its grading controls, while one where Space was pressed keeps them up.
   *
   * Guarded on masks.length because with no masks `allRevealed` is forced true by an effect keyed
   * on `masks` — clearing it here would never be undone on this card, hiding the ratings for good.
   *
   * Lives up here beside goPrev/goNext rather than beside revealAll: the keydown effect below
   * lists it as a dependency, and a `const` declared further down the body is still in its
   * temporal dead zone when that deps array is built during render.
   */
  const reHideMasks = useCallback(() => {
    if (masks.length === 0) return;
    setRevealedMaskIds(new Set());
    setAllRevealed(false);
  }, [masks.length]);

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

  // The zoom readout is feedback for the gesture, not a permanent chrome element.
  // Left pinned it sat on top of the card content — on a screenshot of code that
  // means covering the very text being read. Show it while zooming, then fade.
  const [showZoomBadge, setShowZoomBadge] = useState(false);
  useEffect(() => {
    if (imgScale <= 1) { setShowZoomBadge(false); return; }
    setShowZoomBadge(true);
    const id = setTimeout(() => setShowZoomBadge(false), 1200);
    return () => clearTimeout(id);
  }, [imgScale]);

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

  // Press-and-drag to pan, alongside the wheel. Only meaningful while zoomed — at 1× the clamp
  // pins the translate to 0 anyway, so we don't start a drag and risk swallowing mask clicks.
  const [dragging, setDragging] = useState(false);
  const dragOriginRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  /** A drag ends in a click event on the canvas. Past the slop threshold that click is not a
      mask reveal — the user was panning — so the next click is swallowed in the capture phase. */
  const suppressClickRef = useRef(false);
  // The move handler lives on window, so it reads the live translate from a ref rather than
  // re-subscribing every time the pan changes.
  const imgTranslateRef = useRef(imgTranslate);
  useEffect(() => { imgTranslateRef.current = imgTranslate; }, [imgTranslate]);

  const onImagePointerDown = useCallback((e: React.PointerEvent) => {
    if (imgScaleRef.current <= 1 || e.button !== 0) return;
    dragOriginRef.current = {
      x: e.clientX, y: e.clientY,
      tx: imgTranslateRef.current.x, ty: imgTranslateRef.current.y,
    };
    suppressClickRef.current = false;
    setDragging(true);
  }, []);

  // Drag-to-pan is tracked with window listeners, deliberately NOT setPointerCapture. Capture
  // retargets the compatibility mouse events to the capture element, so `click` is dispatched at
  // this wrapper instead of the canvas inside it — which silently killed click-to-reveal at every
  // zoom above 1×: the pixelated region simply stopped responding once you zoomed. With window
  // listeners the click still lands on the canvas, and only a genuine pan (past the slop
  // threshold) is swallowed by onImageClickCapture below.
  useEffect(() => {
    if (!dragging) return;
    const endDrag = () => { dragOriginRef.current = null; setDragging(false); };
    const onMove = (e: PointerEvent) => {
      const origin = dragOriginRef.current;
      if (!origin) return;
      const dx = e.clientX - origin.x;
      const dy = e.clientY - origin.y;
      if (!suppressClickRef.current && Math.hypot(dx, dy) > 4) suppressClickRef.current = true;
      setImgTranslate(clampImgTranslate({ x: origin.tx + dx, y: origin.ty + dy }, imgScaleRef.current));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    // Releasing the button outside the app never fires pointerup here, which would leave the
    // image glued to the cursor; losing focus is the signal that the gesture is over.
    window.addEventListener('blur', endDrag);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
      window.removeEventListener('blur', endDrag);
    };
  }, [dragging, clampImgTranslate]);

  const onImageClickCapture = useCallback((e: React.MouseEvent) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    e.stopPropagation();
  }, []);

  // Keyboard: Esc ends the session; ← / → skip between images (without rating);
  // Space shows the rating buttons without revealing the masks.
  //
  // Capture phase + stopImmediatePropagation so this full-screen session owns the keys even when
  // launched from a page with its own arrow/Esc handlers (e.g. a written note's mark navigation).
  //
  // Two things this must NOT do, both learned the hard way:
  //   1. Tag-sniffing for 'TEXTAREA' does not detect Monaco. Monaco focuses a hidden <textarea>
  //      only while the caret is in the text; click the gutter, margin or scrollbar and focus is a
  //      <div>, so ← / → fell through and flipped to the next card mid-edit. Ask "is the focus
  //      inside the editor" (.monaco-editor) instead of "what tag is it".
  //   2. Handling Escape before the typing check meant this capture listener swallowed it — the
  //      note editor's own Escape-to-cancel never ran, and Escape inside Monaco ended the whole
  //      session instead of closing the autocomplete popup. Let the focused field have it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      const inMonaco = !!el?.closest?.('.monaco-editor');
      const typing =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
        !!el?.isContentEditable || inMonaco;

      // While the question popup is open it owns every key — Escape must close IT, not end the
      // session, and the arrows must page the question images, not the cards. Its own effect
      // (below) handles them; this handler stands down entirely. Same for an enlarged side
      // image, and for the edit overlay (Escape must not end the session under the editor).
      if (showQuestion || enlargedItemImage || showEditor || historyOverlay) return;

      if (e.key === 'Escape') {
        // The code editor and an in-progress note edit own their own Escape.
        if (inMonaco || editingNoteId !== null) return;
        e.stopImmediatePropagation();
        onSessionEnd();
        return;
      }
      if (typing) return;

      if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); goPrev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopImmediatePropagation(); goNext(); }
      else if (e.key === 'f' || e.key === 'F') {
        // F = strip the chrome down to just the image (and back). Deliberately keyboard-reachable:
        // in focus mode the only visible control is one dim button, and while recording you want
        // to flip it without hunting for it.
        e.preventDefault();
        e.stopImmediatePropagation();
        setFocusMode(v => !v);
      }
      else if (e.key === 'h' || e.key === 'H') {
        // H = "what did I say last time?" — the drawer of past reviews for this card.
        e.preventDefault();
        e.stopImmediatePropagation();
        setShowHistory(v => !v);
      }
      else if (e.key === 'q' || e.key === 'Q') {
        // Q = "what was the question again?" — the whole point of the card having a mark.
        e.preventDefault();
        e.stopImmediatePropagation();
        setShowQuestion(true);
      }
      else if (e.key === 'r' || e.key === 'R') {
        // R = re-blur. Revealing is one-way per card otherwise, so a second attempt meant leaving
        // the session and coming back.
        e.preventDefault();
        e.stopImmediatePropagation();
        reHideMasks();
      }
      else if (e.code === 'Space') {
        // Toggle the grading controls, masks still blurred. Peek mode grades nothing.
        if (readOnly) return;
        // A button focused BY KEYBOARD owns Space, so Tab-then-Space still activates it. A button
        // focused by a MOUSE CLICK does not: clicking Reveal All left it focused, and every later
        // Space press re-fired that dead button instead of toggling the grading controls — which
        // read as "Space stops working once the card is revealed". :focus-visible is exactly the
        // "focused via keyboard" distinction, so ask that rather than "is a button focused".
        if ((tag === 'BUTTON' || tag === 'A') && el?.matches(':focus-visible')) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        setRatingsRequested(v => !v);
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [onSessionEnd, goPrev, goNext, reHideMasks, editingNoteId, readOnly, showQuestion, enlargedItemImage, showEditor, historyOverlay]);

  // Esc closes an enlarged side image rather than ending the session.
  useEffect(() => {
    if (!enlargedItemImage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setEnlargedItemImage(null);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [enlargedItemImage]);

  // The question popup owns the keyboard while it's open: Esc (and Q again) closes it rather than
  // ending the session, and ←/→ page the mark's question images rather than the cards. Registered
  // only while open, and the session handler above stands down on `showQuestion` — belt and braces,
  // since both listen in the capture phase and order there is registration order, not z-index.
  useEffect(() => {
    if (!showQuestion) return;
    const onKey = (e: KeyboardEvent) => {
      if (!['Escape', 'ArrowLeft', 'ArrowRight', 'q', 'Q'].includes(e.key)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === 'Escape' || e.key === 'q' || e.key === 'Q') {
        setShowQuestion(false);
        return;
      }
      const n = questions.length;
      if (n <= 1) return;
      if (e.key === 'ArrowLeft') setQuestionIndex(i => (i - 1 + n) % n);
      else setQuestionIndex(i => (i + 1) % n);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [showQuestion, questions.length]);

  // Load masks + reset per-card state when the current item changes.
  useEffect(() => {
    if (!current) return;
    setRevealedMaskIds(new Set());
    setAllRevealed(false);
    setRatingsRequested(false);
    setShowManualSchedule(false);
    setShowQuestion(false);
    setQuestionIndex(0);
    setNote('');
    setMissedPoints('');
    setShowNotePanel(false);
    setElapsedSeconds(0);
    setTimerRunning(false);
    setEditingNoteId(null);
    setEditingBody('');
    setAutoRecordNoteId(null);
    timerTouched.current = false;
    setHistoryCount(null);
    window.electronAPI.reviewEvents.getItemStats(current.id)
      .then(s => setHistoryCount(s.total_reviews));
    window.electronAPI.reviewMasks.getByItem(current.id).then(setMasks);
    window.electronAPI.reviewItemNotes.getByItem(current.id).then(setItemNotes);
    setEnlargedItemImage(null);
    setShowEditor(false);
    window.electronAPI.reviewItemImages.getByItem(current.id).then(setItemImages);
    window.electronAPI.reviewItemAudios.getByItem(current.id).then(async (audios: ReviewItemAudio[]) => {
      const withMarkers = await Promise.all(audios.map(async a => ({
        ...a,
        markers: await window.electronAPI.audioMarkers.getByAudio(a.id, 'review_item'),
      })));
      setItemAudios(withMarkers);
    });
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

  /**
   * The note whose mic should start the moment it renders. Set by the "Voice note" button, which
   * creates the row first (audio hangs off a note, exactly like a picture does).
   */
  const [autoRecordNoteId, setAutoRecordNoteId] = useState<number | null>(null);

  /** Persist one note now and clear its box, ready for the next. No-op on empty text. */
  const commitNote = useCallback(async (kind: ReviewNoteKind, body: string): Promise<ReviewNote | null> => {
    if (!current || !body.trim()) return null;
    const saved = await window.electronAPI.reviewNotes.add(current.id, kind, body);
    setDraftNotes(prev => [...prev, saved]);
    return saved;
  }, [current?.id]);

  /**
   * Start a voice note. Anything already typed in the box is committed as this note's text, so a
   * half-typed thought isn't lost; with an empty box the note is created empty (allowEmpty) and is
   * voice-only. Either way the new row mounts with its mic already recording.
   */
  const startVoiceNote = async (kind: ReviewNoteKind) => {
    if (!current) return;
    const typed = kind === 'note' ? note : missedPoints;
    if (kind === 'note') setNote(''); else setMissedPoints('');
    const saved = await window.electronAPI.reviewNotes.add(current.id, kind, typed, null, true);
    setDraftNotes(prev => [...prev, saved]);
    setAutoRecordNoteId(saved.id);
  };

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
      // Land on the MARK, not just the recording. RecordingPage already knows how to activate and
      // scroll to a duration from router state (the same path SearchPage uses); without the mark
      // you arrive at a wall of "Mark 1 … Mark 50" and have to hunt for the question by hand.
      navigate(`/recording/${current.recording_id}`, {
        state: current.duration_id ? { echoNav: { durationId: current.duration_id } } : undefined,
      });
    } else if (current.capture_id) {
      navigate('/capture');
    }
  };

  if (!current) return null;

  const fileSrc = window.electronAPI.paths.getFileUrl(current.file_path ?? '');
  const progress = `${currentIndex + 1} / ${items.length}`;

  // "Mark 20 · Minimum Window Substring" — the answer to "what question is this card even about?"
  const markSource = formatMarkSource(current.mark_number, current.duration_note);

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col">
      {/* Focus mode keeps a slim strip rather than removing the top row outright: the window is
          frameless, so this bar is BOTH the drag handle and the clearance for the macOS traffic
          lights. Drop it entirely and the card slides up underneath them. */}
      {focusMode && (
        <div className="titlebar-drag flex items-center justify-end px-4 h-9 shrink-0">
          <button
            onClick={() => setFocusMode(false)}
            title="Show the session controls again (F)"
            className="titlebar-no-drag text-gray-700 hover:text-gray-300 transition-colors p-1 rounded"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2" />
            </svg>
          </button>
        </div>
      )}

      {/* Top bar — titlebar-drag so empty space still moves the window; every button
          below is titlebar-no-drag so it stays clickable inside the macOS title strip
          (app-region is computed globally and ignores the overlay's z-index). */}
      {!focusMode && (
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
          {/* Edit this card — same read/update editor the lightbox's ≋ chip opens. Live
              autosave; masks, hints, side notes, images and voice are all editable there. */}
          <button
            onClick={() => setShowEditor(true)}
            title="Edit this echo — masks, hints, notes, images, voice"
            className="titlebar-no-drag text-gray-400 hover:text-blue-400 text-sm transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit
          </button>

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

          {/* Past reviews of this card — grades, intervals, and every note/picture/voice memo
              logged against them. Read-only here; editing stays on the Echo detail page. */}
          <button
            onClick={() => setShowHistory(v => !v)}
            title={
              historyCount === 0
                ? "No past reviews — this is the first time you're seeing this card (H)"
                : showHistory
                  ? 'Hide past reviews (H)'
                  : historyCount == null
                    ? 'Show past reviews of this card (H)'
                    : `Show the ${historyCount} past review${historyCount === 1 ? '' : 's'} of this card (H)`
            }
            className={`titlebar-no-drag text-sm transition-colors flex items-center gap-1.5 ${
              showHistory
                ? 'text-blue-400 hover:text-blue-300'
                : historyCount === 0
                  // A new card is dimmed rather than hidden: the button vanishing would read as
                  // "the feature isn't there" — the same trap the Question button already fixed.
                  ? 'text-gray-600 hover:text-gray-400'
                  : 'text-gray-400 hover:text-blue-400'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            History
            {historyCount != null && historyCount > 0 && (
              <span className={`tabular-nums text-xs px-1.5 py-0.5 rounded-full ${
                showHistory ? 'bg-blue-500/20 text-blue-300' : 'bg-gray-800 text-gray-400'
              }`}>
                {historyCount}
              </span>
            )}
          </button>

          {/* Question. Rendered whenever the card HAS a mark — even if that mark has no question
              image yet. An earlier version only rendered when a question image existed, so on the
              36-of-38 cards without one the button simply vanished, which reads as "the feature
              isn't there" rather than "nothing is set". Now it opens and says so. */}
          {current.duration_id != null && (
            <button
              onClick={() => setShowQuestion(true)}
              title="Show the question this card came from (Q)"
              className={`titlebar-no-drag text-sm transition-colors flex items-center gap-1.5 ${
                questions.length > 0
                  ? 'text-amber-300/90 hover:text-amber-200'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <span aria-hidden>★</span>
              Question
              {questions.length > 1 && (
                <span className="text-amber-500/70">({questions.length})</span>
              )}
            </button>
          )}

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

          {/* Strip to just the image — for screen recording. */}
          <button
            onClick={() => setFocusMode(true)}
            title="Focus mode — hide everything but the image (F)"
            className="titlebar-no-drag text-gray-400 hover:text-blue-400 text-sm transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2" />
            </svg>
            Focus
          </button>
        </div>
      </div>
      )}

      {/* Progress bar */}
      {!focusMode && (
      <div className="h-1 bg-gray-800">
        <div
          className="h-1 bg-blue-600 transition-all duration-300"
          style={{ width: `${((currentIndex) / items.length) * 100}%` }}
        />
      </div>
      )}

      {/* Source context — topic › recording, then the MARK (the actual question) on its own line.
          Without the mark line a card like "growing the window only ever helps" is unreviewable:
          you cannot recall an answer when you can't remember the question. */}
      {!focusMode && (current.topic_name || current.recording_name || markSource) && (
        <div className="px-5 py-2 space-y-1">
          {(current.topic_name || current.recording_name) && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              {current.topic_name && <span>{current.topic_name}</span>}
              {current.topic_name && current.recording_name && <span>›</span>}
              {current.recording_name && <span>{current.recording_name}</span>}
              {current.caption && <span className="text-gray-400 ml-2">— {current.caption}</span>}
            </div>
          )}

          {markSource && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300/90 text-xs font-medium border border-amber-500/20">
                <span aria-hidden>📌</span>
                {markSource}
              </span>

              {questions.length > 0 && (
                <button
                  onClick={() => setShowQuestion(true)}
                  className="text-xs text-amber-300/70 hover:text-amber-200 transition-colors flex items-center gap-1"
                  title="Show the question (Q)"
                >
                  ★ Show question
                  {questions.length > 1 && <span className="text-amber-500/60">({questions.length})</span>}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Image area — Cmd/Ctrl + wheel to zoom; scroll or press-and-drag to pan when zoomed */}
      {/* Scratch code pad above the card. The card keeps its own zoom/pan refs.
          The history drawer is a SIBLING of this column rather than an overlay, so the card
          reflows to the remaining width instead of being covered — you read last time's note
          while still looking at the card it's about. */}
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-h-0">
          {showCodePane && (
            <div className="h-[42%] min-h-[180px] max-h-[70%] shrink-0">
              {/* Keyed on the card: remounting is what guarantees the pad reloads and the previous
                  card's pending autosave flushes before the next one loads. */}
              <ReviewCodePane key={current.id} reviewItemId={current.id} readOnly={readOnly} />
            </div>
          )}

          <div
            ref={imageAreaRef}
            className="flex-1 relative flex items-center justify-center px-4 py-2 overflow-hidden min-h-0"
          >
            {/* select-none on the wrapper: the only text in there is the hint/caption overlays, and
                a pan drag used to sweep-select them into a blue highlight. Nothing worth copying. */}
            {current.file_path && (
              <div
                ref={imageWrapRef}
                className="w-full h-full select-none"
                style={{ cursor: imgScale > 1 ? (dragging ? 'grabbing' : 'grab') : 'default' }}
                onPointerDown={onImagePointerDown}
                onClickCapture={onImageClickCapture}
              >
                {/* Zoom/pan are handed to the canvas, which re-samples the source at the zoomed
                    size — no CSS transform, so no bitmap blur. See ADR-0010. */}
                <PixelatedImage
                  src={fileSrc}
                  masks={masks}
                  revealedMaskIds={revealedMaskIds}
                  onMaskClick={revealMask}
                  className="w-full h-full"
                  zoom={imgScale}
                  pan={imgTranslate}
                />
              </div>
            )}
            {imgScale > 1 && (
              <div
                className={`absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/70 text-white/90 text-xs px-2 py-1
                            rounded-full pointer-events-none transition-opacity duration-500
                            ${showZoomBadge ? 'opacity-100' : 'opacity-0'}`}
              >
                {Math.round(imgScale * 100)}%
              </div>
            )}
          </div>
        </div>

        {/* Focus mode is "nothing but the card", so the drawer stands down there too — the toggle
            state survives, and turning focus mode off brings it straight back. */}
        {showHistory && !focusMode && (
          <ReviewHistoryPanel
            reviewItemId={current.id}
            onClose={() => setShowHistory(false)}
            onOverlayChange={setHistoryOverlay}
          />
        )}
      </div>

      {/* Bottom controls */}
      {!focusMode && (
      <div className="px-5 py-4 border-t border-gray-800 flex flex-col gap-3">
        {/* The echo's own side notes + voice — the prompts that live on the card, not on a review.
            Always visible: they exist precisely so recall doesn't depend on the masks alone. */}
        {(itemNotes.length > 0 || itemAudios.length > 0 || itemImages.length > 0) && (
          <div className="flex flex-col gap-2">
            {itemNotes.length > 0 && (
              <div className="flex items-start gap-2 flex-wrap">
                {itemNotes.map(n => (
                  <span
                    key={n.id}
                    className="text-xs text-sky-200 bg-sky-950/60 border border-sky-800/60 px-2 py-1 rounded"
                  >
                    📝 {n.body}
                  </span>
                ))}
              </div>
            )}
            {itemImages.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {itemImages.map(img => (
                  <img
                    key={img.id}
                    src={window.electronAPI.paths.getFileUrl(img.thumbnail_path ?? img.file_path)}
                    alt={img.caption ?? ''}
                    onClick={() => setEnlargedItemImage(window.electronAPI.paths.getFileUrl(img.file_path))}
                    className="h-12 w-12 object-cover rounded cursor-zoom-in border border-sky-800/60"
                    title="Click to enlarge"
                  />
                ))}
              </div>
            )}
            {itemAudios.map(a => (
              <ThemedAudioPlayer
                key={a.id}
                src={window.electronAPI.paths.getFileUrl(a.file_path)}
                theme="blue"
                markers={a.markers}
                className="max-w-xl"
              />
            ))}
          </div>
        )}

        {/* Reveal All + "Rate this card" + "Hide again" + hint list.
            The row outlives the reveal now: it used to vanish the moment `allRevealed` flipped,
            which would have left R as the only way back and nothing on screen saying so.
            The second clause is what stops it rendering as an empty div — the parent is a gapped
            flex column, so a childless row still costs a visible gap. */}
        {masks.length > 0 && (!allRevealed || revealedMaskIds.size > 0) && (
          <div className="flex items-center gap-3 flex-wrap">
            {!allRevealed && (
              <>
                <button
                  onClick={revealAll}
                  className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
                >
                  Reveal All
                </button>
                {!readOnly && !ratingsRequested && (
                  <button
                    onClick={() => setRatingsRequested(true)}
                    title="Grade this card without revealing the masks (Space)"
                    className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700
                               text-sm rounded-lg transition-colors flex items-center gap-2"
                  >
                    Rate this card
                    <kbd className="text-[10px] text-gray-500 border border-gray-700 rounded px-1 py-0.5">Space</kbd>
                  </button>
                )}
              </>
            )}
            {/* Only worth offering once something is actually showing. */}
            {revealedMaskIds.size > 0 && (
              <button
                onClick={reHideMasks}
                title="Blur the revealed areas again and re-attempt this card (R)"
                className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700
                           text-sm rounded-lg transition-colors flex items-center gap-2"
              >
                Hide again
                <kbd className="text-[10px] text-gray-500 border border-gray-700 rounded px-1 py-0.5">R</kbd>
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
            Study-only; hidden in Peek mode.

            WRITING is never gated: the panel is up from the first second of the card, because the
            moment worth logging ("I have no idea what this is") happens BEFORE the reveal, and
            making the box wait for Reveal All loses exactly that thought. READING stays gated:
            until the same threshold that shows the rating buttons (reveal or "Rate this card"),
            already-logged notes render as sealed chips — see the `!canRate` branch below — so a
            note about the answer can't leak the answer. */}
        {!readOnly && (
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
                      {/* Logged notes scroll inside a bounded box. Without the cap, each note is
                          another stacked card and the whole bottom block grows, squeezing the card
                          image above it smaller with every note. */}
                      <div className={logged.length > 0 ? 'flex flex-col gap-1.5 max-h-[24vh] overflow-y-auto pr-0.5' : 'contents'}>
                      {logged.map((n, i) => {
                        // Pre-reveal, logged notes are sealed. Storage is identical — the row was
                        // written by the exact same reviewNotes.add the post-reveal path uses —
                        // only the RENDERING is withheld: no body, no images, no voice chips, no
                        // edit (the textarea would echo the body back). The one exception is the
                        // note whose mic is live right now: composing is naturally visible, so its
                        // recorder renders until Stop saves the clip — then it seals like the rest.
                        if (!canRate) {
                          if (autoRecordNoteId === n.id) {
                            return (
                              <div
                                key={n.id}
                                className="flex items-center gap-2 rounded-lg bg-gray-800/60 border border-gray-700 px-3 py-1.5"
                              >
                                <span className="text-[10px] text-gray-500 tabular-nums shrink-0">{i + 1}</span>
                                {/* audios={[]} so the freshly-saved chip never flashes up pre-reveal */}
                                <ReviewNoteAudios
                                  noteId={n.id}
                                  audios={[]}
                                  autoStart
                                  onChange={auds => {
                                    setDraftNotes(prev => prev.map(x =>
                                      x.id === n.id ? { ...x, audios: [...(x.audios ?? []), ...auds] } : x
                                    ));
                                    setAutoRecordNoteId(null); // saved → joins the sealed pile
                                  }}
                                />
                              </div>
                            );
                          }
                          return (
                            <div
                              key={n.id}
                              className="flex items-center gap-2 rounded-lg bg-gray-800/60 border border-gray-700 border-dashed px-3 py-1.5"
                            >
                              <span className="text-[10px] text-gray-500 tabular-nums shrink-0">{i + 1}</span>
                              <span className="text-xs text-gray-500 select-none">
                                🔒 Logged — hidden until you reveal or rate
                              </span>
                            </div>
                          );
                        }
                        return (
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
                                className={`flex-1 text-sm whitespace-pre-wrap break-words cursor-text rounded px-1 -mx-1
                                           hover:bg-gray-700/40 transition-colors ${n.body ? 'text-gray-300' : 'text-gray-600 italic'}`}
                              >
                                {n.body || 'Voice note'}
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
                            <ReviewNoteAttachments
                              noteId={n.id}
                              images={n.images ?? []}
                              audios={n.audios ?? []}
                              autoStartAudio={autoRecordNoteId === n.id}
                              onImagesChange={imgs => setDraftNotes(prev =>
                                prev.map(x => x.id === n.id ? { ...x, images: imgs } : x)
                              )}
                              onAudiosChange={auds => setDraftNotes(prev =>
                                prev.map(x => x.id === n.id ? { ...x, audios: auds } : x)
                              )}
                            />
                          </div>
                        </div>
                        );
                      })}
                      </div>
                      <textarea
                        value={value}
                        onChange={e => setValue(e.target.value)}
                        onKeyDown={handleNoteKeyDown(col.kind)}
                        onAnimationEnd={e => e.currentTarget.classList.remove('animate-input-glow')}
                        placeholder={logged.length > 0 ? col.nextPlaceholder : col.placeholder}
                        rows={2}
                        className="w-full resize-none rounded-lg bg-gray-900 border border-gray-800 text-gray-200 text-sm px-3 py-2 placeholder-gray-600 focus:outline-none focus:border-gray-600"
                      />
                      <button
                        onClick={() => void startVoiceNote(col.kind)}
                        title="Say it instead of typing it — the recording is saved with this review"
                        className="self-start text-[11px] text-gray-500 hover:text-primary-400 transition-colors"
                      >
                        🎙 Voice note
                      </button>
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
      )}

      {/* ── The question popup ──────────────────────────────────────────────────────────────────
          Sits above the whole session so the problem statement is readable while the card stays
          exactly as it was — you look, you go back, nothing is graded or revealed. */}
      {showQuestion && (
        <div
          onClick={() => setShowQuestion(false)}
          className="fixed inset-0 z-[80] bg-black/92 flex items-center justify-center p-10 cursor-zoom-out"
        >
          <div className="fixed top-4 left-5 flex items-center gap-2 pointer-events-none">
            <span className="text-amber-300/90 text-xs px-2 py-1 rounded-md bg-black/60">
              ★ {markSource ?? 'Question'}
            </span>
            {questions.length > 1 && (
              <span className="text-white/50 text-xs px-2 py-1 rounded-md bg-black/60 tabular-nums">
                {questionIndex + 1} / {questions.length}
              </span>
            )}
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); setShowQuestion(false); }}
            className="fixed top-4 right-5 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white/80 hover:text-white text-xl leading-none flex items-center justify-center transition-colors"
            title="Back to the card (Esc)"
          >
            ×
          </button>

          <span className="fixed bottom-4 left-1/2 -translate-x-1/2 text-white/40 text-xs pointer-events-none">
            {questions.length > 1 ? '←/→ between questions · ' : ''}Esc or click anywhere to go back
          </span>

          {questions.length === 0 ? (
            /* No question image on this mark. Say so, and say how to fix it — an empty popup, or a
               button that silently doesn't render, is what made this feature look absent. */
            <div className="max-w-md text-center cursor-default" onClick={(e) => e.stopPropagation()}>
              <p className="text-4xl mb-3">★</p>
              <p className="text-gray-300 text-sm">
                No question image set on {markSource ?? 'this mark'}.
              </p>
              <p className="text-gray-500 text-xs mt-2 leading-relaxed">
                Open the mark, right-click the screenshot that states the problem, and choose
                <span className="text-gray-300"> “Add as question image”</span>. Every echo from
                that mark will show it here — you only set it once per question.
              </p>
              <button
                onClick={() => { setShowQuestion(false); handleNavigateToOriginal(); }}
                className="mt-4 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs transition-colors"
              >
                Go to the mark →
              </button>
            </div>
          ) : (
            <>
              {questions.length > 1 && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setQuestionIndex(i => (i - 1 + questions.length) % questions.length);
                    }}
                    className="fixed left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 text-white/80 hover:text-white text-2xl leading-none flex items-center justify-center transition-colors"
                    title="Previous question image (←)"
                  >
                    ‹
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setQuestionIndex(i => (i + 1) % questions.length);
                    }}
                    className="fixed right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 text-white/80 hover:text-white text-2xl leading-none flex items-center justify-center transition-colors"
                    title="Next question image (→)"
                  >
                    ›
                  </button>
                </>
              )}
              <img
                key={questions[questionIndex]?.id}
                src={window.electronAPI.paths.getFileUrl(
                  questions[questionIndex]?.file_path ?? questions[0].file_path
                )}
                alt="The question this card came from"
                onClick={(e) => e.stopPropagation()}
                className="max-w-full max-h-full object-contain cursor-default rounded-lg"
              />
            </>
          )}
        </div>
      )}

      {/* Edit overlay — the read/update editor for the current card. Everything autosaves;
          closing re-fetches the side content so edits show on the card front immediately.
          (Masks stay in sync live via onMasksChanged; new ones arrive unrevealed.) */}
      {showEditor && current.file_path && (
        <MaskEditor
          src={fileSrc}
          reviewItemId={current.id}
          existingMasks={masks}
          onMasksChanged={setMasks}
          mediaTagType={current.media_type as MediaTagType}
          mediaTagId={current.media_id}
          sourceLabel={markSource}
          sourceImageSrcs={questions.map(q => window.electronAPI.paths.getFileUrl(q.file_path))}
          onClose={() => {
            setShowEditor(false);
            window.electronAPI.reviewItemNotes.getByItem(current.id).then(setItemNotes);
            window.electronAPI.reviewItemImages.getByItem(current.id).then(setItemImages);
            window.electronAPI.reviewItemAudios.getByItem(current.id).then(async (audios: ReviewItemAudio[]) => {
              const withMarkers = await Promise.all(audios.map(async a => ({
                ...a,
                markers: await window.electronAPI.audioMarkers.getByAudio(a.id, 'review_item'),
              })));
              setItemAudios(withMarkers);
            });
          }}
        />
      )}

      {/* Enlarged side image (pasted onto the echo in "Add to Echo"). Esc / click outside closes;
          scroll/pinch zooms, drag pans, double-click toggles fit ↔ 2.5×. */}
      {enlargedItemImage && (
        <ZoomableImageOverlay
          src={enlargedItemImage}
          zClassName="z-[60]"
          onClose={() => setEnlargedItemImage(null)}
        />
      )}
    </div>
  );
}
