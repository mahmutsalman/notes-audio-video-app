import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ReviewItem, ReviewMask, ReviewRating } from '../../types';
import { computeNextReview, presetToNextReview, formatDueLabel } from '../../utils/srsAlgorithm';
import PixelatedImage from './PixelatedImage';

interface ReviewSessionProps {
  items: ReviewItem[];
  onSessionEnd: () => void;
}

const MANUAL_PRESETS: { label: string; key: string }[] = [
  { label: '1 day', key: '1d' },
  { label: '3 days', key: '3d' },
  { label: '5 days', key: '5d' },
  { label: '1 week', key: '1w' },
  { label: '2 weeks', key: '2w' },
  { label: '1 month', key: '1m' },
  { label: '3 months', key: '3m' },
];

const RATING_CONFIG: { rating: ReviewRating; label: string; color: string; hint: string }[] = [
  { rating: 'again', label: 'Again', color: 'bg-red-600 hover:bg-red-500', hint: 'Blackout — reset' },
  { rating: 'hard', label: 'Hard', color: 'bg-orange-600 hover:bg-orange-500', hint: 'Difficult' },
  { rating: 'good', label: 'Good', color: 'bg-blue-600 hover:bg-blue-500', hint: 'Normal recall' },
  { rating: 'easy', label: 'Easy', color: 'bg-emerald-600 hover:bg-emerald-500', hint: 'Perfect recall' },
];

export default function ReviewSession({ items, onSessionEnd }: ReviewSessionProps) {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [masks, setMasks] = useState<ReviewMask[]>([]);
  const [revealedMaskIds, setRevealedMaskIds] = useState<Set<number>>(new Set());
  const [allRevealed, setAllRevealed] = useState(false);
  const [showManualSchedule, setShowManualSchedule] = useState(false);
  const [isRating, setIsRating] = useState(false);

  const current = items[currentIndex] ?? null;

  // Esc to end session
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onSessionEnd(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSessionEnd]);

  // Load masks for the current item
  useEffect(() => {
    if (!current) return;
    setRevealedMaskIds(new Set());
    setAllRevealed(false);
    setShowManualSchedule(false);
    window.electronAPI.reviewMasks.getByItem(current.id).then(setMasks);
  }, [current?.id]);

  // If no masks, consider auto-revealed
  useEffect(() => {
    if (masks.length === 0) setAllRevealed(true);
  }, [masks]);

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

  const handleRate = async (rating: ReviewRating) => {
    if (!current || isRating) return;
    setIsRating(true);
    const result = computeNextReview(current.interval_days, current.ease_factor, current.repetitions, rating);
    await window.electronAPI.review.rate(
      current.id, rating, result.intervalDays, result.easeFactor, result.repetitions, result.nextReviewAt
    );
    advance();
  };

  const handleManualSchedule = async (preset: string) => {
    if (!current || isRating) return;
    setIsRating(true);
    const { nextReviewAt, intervalDays } = presetToNextReview(preset);
    await window.electronAPI.review.schedule(current.id, nextReviewAt, intervalDays);
    advance();
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

        <div className="text-gray-300 text-sm font-medium tabular-nums">{progress}</div>

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

        {/* Rating buttons — shown only after revealing */}
        {allRevealed && !showManualSchedule && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              {RATING_CONFIG.map(({ rating, label, color, hint }) => {
                const result = computeNextReview(current.interval_days, current.ease_factor, current.repetitions, rating);
                return (
                  <button
                    key={rating}
                    onClick={() => handleRate(rating)}
                    disabled={isRating}
                    className={`flex-1 py-2.5 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50 flex flex-col items-center gap-0.5 ${color}`}
                  >
                    <span>{label}</span>
                    <span className="text-[11px] opacity-75">{formatDueLabel(result.nextReviewAt)}</span>
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
                onClick={() => setShowManualSchedule(false)}
                className="text-gray-500 hover:text-gray-300 text-xs ml-auto"
              >
                ← Use algorithm instead
              </button>
            </div>
            <div className="flex gap-2 flex-wrap">
              {MANUAL_PRESETS.map(({ label, key }) => (
                <button
                  key={key}
                  onClick={() => handleManualSchedule(key)}
                  disabled={isRating}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
