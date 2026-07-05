import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ReviewItem, ReviewMask, ReviewRating, ReviewPreset } from '../../types';
import { formatDueLabel } from '../../utils/srsAlgorithm';
import {
  previewRatings, applyRating, applyManual, applyManualDate,
  buildRatingEvent, buildManualEvent, type ReviewNoteExtras,
} from '../../utils/fsrs';
import PixelatedImage from './PixelatedImage';

interface ReviewSessionProps {
  items: ReviewItem[];
  onSessionEnd: () => void;
}

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

export default function ReviewSession({ items, onSessionEnd }: ReviewSessionProps) {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [masks, setMasks] = useState<ReviewMask[]>([]);
  const [revealedMaskIds, setRevealedMaskIds] = useState<Set<number>>(new Set());
  const [allRevealed, setAllRevealed] = useState(false);
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

  // Per-review reflective note + optional study timer (reset on each card).
  const [note, setNote] = useState('');
  const [missedPoints, setMissedPoints] = useState('');
  const [showNotePanel, setShowNotePanel] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const timerTouched = useRef(false);

  const current = items[currentIndex] ?? null;

  // Esc to end session
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onSessionEnd(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSessionEnd]);

  // Load masks + reset per-card state when the current item changes.
  useEffect(() => {
    if (!current) return;
    setRevealedMaskIds(new Set());
    setAllRevealed(false);
    setShowManualSchedule(false);
    setNote('');
    setMissedPoints('');
    setShowNotePanel(false);
    setElapsedSeconds(0);
    setTimerRunning(false);
    timerTouched.current = false;
    window.electronAPI.reviewMasks.getByItem(current.id).then(setMasks);
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

  // Preview the four FSRS outcomes once per card (drives the button due-labels).
  const previews = useMemo(() => (current ? previewRatings(current) : null), [current?.id]);

  const noteExtras = (): ReviewNoteExtras => ({
    note: note.trim() || null,
    missedPoints: missedPoints.trim() || null,
    durationSeconds: timerTouched.current ? elapsedSeconds : null,
  });

  const handleRate = async (rating: ReviewRating) => {
    if (!current || isRating) return;
    setIsRating(true);
    const applied = applyRating(current, rating);
    const event = buildRatingEvent(current, applied, rating, noteExtras());
    await window.electronAPI.review.rate(current.id, applied.fields, event);
    advance();
  };

  const handleManualSchedule = async (days: number) => {
    if (!current || isRating) return;
    setIsRating(true);
    const fields = applyManual(current, days);
    const event = buildManualEvent(current, fields, noteExtras());
    await window.electronAPI.review.schedule(current.id, fields, event);
    advance();
  };

  const handleManualDate = async (dateStr: string) => {
    if (!current || isRating || !dateStr) return;
    setIsRating(true);
    const fields = applyManualDate(current, new Date(dateStr + 'T00:00:00'));
    const event = buildManualEvent(current, fields, noteExtras());
    await window.electronAPI.review.schedule(current.id, fields, event);
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
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
        {/* Traffic light spacer */}
        <div className="w-16 flex-shrink-0" />
        <button
          onClick={onSessionEnd}
          className="text-gray-400 hover:text-white text-sm transition-colors flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          End Session
        </button>

        <div className="flex items-center gap-4">
          {/* Study timer chip */}
          <button
            onClick={toggleTimer}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium tabular-nums transition-colors ${
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

          <div className="text-gray-300 text-sm font-medium tabular-nums">{progress}</div>
        </div>

        {(current.recording_id || current.capture_id) && (
          <button
            onClick={handleNavigateToOriginal}
            className="text-gray-400 hover:text-blue-400 text-sm transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Go to original
          </button>
        )}
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

      {/* Image area */}
      <div className="flex-1 relative flex items-center justify-center px-4 py-2 overflow-hidden min-h-0">
        {current.file_path && (
          <PixelatedImage
            src={fileSrc}
            masks={masks}
            revealedMaskIds={revealedMaskIds}
            onMaskClick={revealMask}
            className="w-full h-full"
          />
        )}
      </div>

      {/* Bottom controls */}
      <div className="px-5 py-4 border-t border-gray-800 flex flex-col gap-3">
        {/* Reveal All + hint list */}
        {!allRevealed && masks.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={revealAll}
              className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
            >
              Reveal All
            </button>
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

        {/* Reflective note panel — the "what did I think / what did I miss" log */}
        {allRevealed && (
          <div className="flex flex-col gap-2">
            {!showNotePanel ? (
              <button
                onClick={() => setShowNotePanel(true)}
                className="self-start text-gray-500 hover:text-gray-300 text-xs transition-colors flex items-center gap-1"
              >
                ✍️ Add a review note{(note || missedPoints) ? ' •' : ''}
              </button>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="What did you think? How did it feel?"
                  rows={2}
                  className="w-full resize-none rounded-lg bg-gray-900 border border-gray-800 text-gray-200 text-sm px-3 py-2 placeholder-gray-600 focus:outline-none focus:border-gray-600"
                />
                <textarea
                  value={missedPoints}
                  onChange={e => setMissedPoints(e.target.value)}
                  placeholder="What did you miss / keep forgetting?"
                  rows={2}
                  className="w-full resize-none rounded-lg bg-gray-900 border border-gray-800 text-gray-200 text-sm px-3 py-2 placeholder-gray-600 focus:outline-none focus:border-gray-600"
                />
              </div>
            )}
          </div>
        )}

        {/* Rating buttons — shown only after revealing */}
        {allRevealed && !showManualSchedule && (
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
                    <span className="text-[11px] opacity-75">{preview ? formatDueLabel(preview.nextReviewAt) : ''}</span>
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

        {/* Manual schedule */}
        {allRevealed && showManualSchedule && (
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
