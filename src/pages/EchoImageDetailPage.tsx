import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { ReviewItem, ReviewEvent, ReviewItemStats, ReviewHeatmapDay, ReviewNote, ReviewNoteKind, ReviewNoteImage, ReviewNoteAudio } from '../types';
import { formatDueLabel } from '../utils/srsAlgorithm';
import { formatMarkSource, parseQuestionImages } from '../utils/marks';
import { currentRetrievability, stateLabel } from '../utils/fsrs';
import HeatmapCalendar, { HEATMAP_WINDOWS, type HeatmapWindow } from '../components/echo/HeatmapCalendar';
import ReviewNoteImages from '../components/review/ReviewNoteImages';
import ReviewNoteAudios from '../components/review/ReviewNoteAudios';
import { NoteThumbs, NoteVoicePlayback, ratingBadge, fmtDuration } from '../components/review/ReviewNotePreview';
import ReviewSession from '../components/review/ReviewSession';

/** Local 'YYYY-MM-DD' key for an ISO timestamp (matches the heatmap + SQLite localtime). */
function localDayKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface EchoImageDetailPageProps {
  /** When embedded (e.g. inside a note), the id + navigation come from props instead of the route. */
  reviewItemId?: number;
  onBack?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}

export default function EchoImageDetailPage({ reviewItemId: idProp, onBack, onPrev, onNext }: EchoImageDetailPageProps = {}) {
  const params = useParams<{ reviewItemId: string }>();
  const navigate = useNavigate();
  const id = idProp ?? Number(params.reviewItemId);
  const back = onBack ?? (() => navigate(-1));

  const [item, setItem] = useState<ReviewItem | null>(null);
  const [stats, setStats] = useState<ReviewItemStats | null>(null);
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const [windowKey, setWindowKey] = useState<HeatmapWindow>('1yr');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  // Peek at the card FRONT — the masked image with its hints, exactly as a review shows it.
  // Rendered via ReviewSession readOnly, so nothing is graded or logged.
  const [peek, setPeek] = useState(false);
  // Full-screen viewer. The 320px column is too small to read a code screenshot in.
  // null = closed. `img` is WHICH image (the card, or the mark's question), `zoom` is 'fit'
  // (scaled to the window) vs 'actual' (1:1 pixels, scrollable). The two are independent —
  // clicking to zoom must not swap the image being viewed out from under you.
  const [viewer, setViewer] = useState<
    null | { img: 'card' | 'question'; zoom: 'fit' | 'actual'; questionIndex?: number }
  >(null);

  // ← / → navigate to prev/next echo when shown as an embedded overlay (onBack set).
  // Runs in the CAPTURE phase and stops propagation so it beats the host page's own
  // arrow-key handlers (e.g. a written note's mark navigation) — the overlay owns the
  // arrows while it's open. Ignored while typing in a note field.
  useEffect(() => {
    if (!onBack) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === 'ArrowLeft') onPrev?.();
      else onNext?.();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [onBack, onPrev, onNext]);

  // Escape closes the full-screen viewer — and only the viewer. Capture + stopImmediatePropagation
  // so it never reaches the host page underneath (which would close the whole overlay behind it).
  useEffect(() => {
    if (!viewer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setViewer(null);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [viewer]);

  // Derive heatmap buckets from the already-loaded events (grouped by local day).
  const heatmapData = useMemo<ReviewHeatmapDay[]>(() => {
    const byDay = new Map<string, { count: number; sum: number; rated: number }>();
    for (const e of events) {
      const key = localDayKey(e.reviewed_at);
      const cur = byDay.get(key) ?? { count: 0, sum: 0, rated: 0 };
      cur.count += 1;
      if (e.rating != null) { cur.sum += e.rating; cur.rated += 1; }
      byDay.set(key, cur);
    }
    return [...byDay.entries()].map(([day, v]) => ({
      day, count: v.count, avg_rating: v.rated > 0 ? v.sum / v.rated : null,
    }));
  }, [events]);

  const shownEvents = useMemo(
    () => (selectedDay ? events.filter(e => localDayKey(e.reviewed_at) === selectedDay) : events),
    [events, selectedDay]
  );

  const load = useCallback(async () => {
    if (!id) return;
    setSelectedDay(null); // reset day filter when switching between echoes
    setPeek(false);
    const [it, st, ev] = await Promise.all([
      window.electronAPI.review.getById(id),
      window.electronAPI.reviewEvents.getItemStats(id),
      window.electronAPI.reviewEvents.getByItem(id),
    ]);
    setItem(it);
    setStats(st);
    setEvents(ev);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (!item) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
        <p className="text-sm">Loading Echo history…</p>
      </div>
    );
  }

  if (peek) {
    return <ReviewSession items={[item]} readOnly onSessionEnd={() => setPeek(false)} />;
  }

  const src = item.file_path ? window.electronAPI.paths.getFileUrl(item.file_path) : null;
  const avg = stats?.avg_rating != null ? stats.avg_rating.toFixed(2) : '—';

  // Which question this card is an answer to. Resolved through the mark on every read, so changing
  // the mark's question image updates this card (and every other one from that mark) with no resync.
  const markSource = formatMarkSource(item.mark_number, item.duration_note);
  const questions = parseQuestionImages(item.question_images_json);
  const viewerSrc = viewer?.img === 'question'
    ? (questions[viewer.questionIndex ?? 0]
        ? window.electronAPI.paths.getFileUrl(questions[viewer.questionIndex ?? 0].file_path)
        : null)
    : src;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-dark-bg overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 border-b border-gray-200 dark:border-dark-border flex items-center gap-3 flex-shrink-0">
        {(onPrev || onNext) && (
          <div className="flex items-center gap-1 mr-1">
            <button
              onClick={onPrev}
              disabled={!onPrev}
              className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-dark-hover disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              title="Previous echo (←)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={onNext}
              disabled={!onNext}
              className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-dark-hover disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              title="Next echo (→)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
        <button
          onClick={back}
          className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 text-sm flex items-center gap-1 transition-colors"
          title="Back"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
            {item.caption || 'Untitled image'}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
            {[item.topic_name, item.recording_name].filter(Boolean).join(' › ') || 'No source'}
          </p>
          {markSource && (
            <p className="text-xs text-amber-600 dark:text-amber-300/90 mt-0.5 truncate" title={markSource}>
              📌 {markSource}
            </p>
          )}
        </div>
        <button
          onClick={() => setPeek(true)}
          title="See the card front as it appears in review — masks, blur, hints, notes. Read-only: nothing is graded or logged."
          className="px-3 py-1.5 text-sm rounded-lg bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 hover:bg-sky-200 dark:hover:bg-sky-900/70 transition-colors"
        >
          👁 Card front
        </button>
        {item.recording_id && (
          <button
            onClick={() => navigate(`/recording/${item.recording_id}`, {
              // Land on the MARK, not the top of a 50-mark recording.
              state: item.duration_id ? { echoNav: { durationId: item.duration_id } } : undefined,
            })}
            className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 dark:bg-dark-surface text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-hover transition-colors"
          >
            Go to original
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-5 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          {/* Left: image + stat cards */}
          <div className="flex flex-col gap-4">
            <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-dark-border bg-gray-100 dark:bg-dark-surface">
              {src ? (
                <button
                  onClick={() => setViewer({ img: 'card', zoom: 'fit' })}
                  className="relative block w-full group cursor-zoom-in"
                  title="Open full screen (Esc to close)"
                >
                  <img src={src} alt="" className="w-full object-contain max-h-80" />
                  <span className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-medium px-2 py-1 rounded-md bg-black/60">
                      Click to enlarge
                    </span>
                  </span>
                </button>
              ) : (
                <div className="aspect-video flex items-center justify-center text-gray-400 text-3xl">🖼️</div>
              )}
            </div>

            {/* The mark's question image — the prompt this card is an answer to. Resolved through
                the mark, so re-designating it on the mark updates this automatically. */}
            {questions.length > 0 && (
              <div className="rounded-xl overflow-hidden border border-amber-400/40 bg-gray-100 dark:bg-dark-surface">
                <p className="px-3 py-1.5 text-[11px] text-amber-600 dark:text-amber-300/90 border-b border-amber-400/20">
                  ★ Question{questions.length > 1 && `s · ${questions.length}`}
                </p>
                {questions.map((q, i) => (
                  <button
                    key={q.id}
                    onClick={() => setViewer({ img: 'question', zoom: 'fit', questionIndex: i })}
                    className="relative block w-full group cursor-zoom-in border-b border-amber-400/10 last:border-b-0"
                    title="Open full screen (Esc to close)"
                  >
                    <img
                      src={window.electronAPI.paths.getFileUrl(q.file_path)}
                      alt=""
                      className="w-full object-contain max-h-60"
                    />
                    <span className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors" />
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Total reviews" value={String(stats?.total_reviews ?? 0)} />
              <StatCard label="Days studied" value={String(stats?.distinct_days ?? 0)} />
              <StatCard label="Avg rating" value={avg} hint="1 Again → 4 Easy" />
              <StatCard label="Blackouts" value={String(stats?.again_count ?? 0)} hint="times rated Again" />
              <StatCard label="Next due" value={formatDueLabel(item.next_review_at)} />
              <StatCard
                label="Last reviewed"
                value={stats?.last_reviewed_at ? new Date(stats.last_reviewed_at).toLocaleDateString() : 'never'}
              />
            </div>

            {/* FSRS memory model — the raw scheduler state */}
            <div className="rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-surface p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] uppercase tracking-wide text-gray-400">Memory model (FSRS)</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-dark-hover text-gray-600 dark:text-gray-300">
                  {stateLabel(item.state)}
                </span>
              </div>
              {item.stability == null ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Not modelled yet — review this card once and FSRS starts tracking its difficulty, stability, and retrievability.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  <ModelStat
                    label="Difficulty"
                    value={`${item.difficulty?.toFixed(1)}`}
                    sub="/ 10"
                    hint="how hard this card is (1 easy → 10 hard)"
                  />
                  <ModelStat
                    label="Stability"
                    value={item.stability >= 1 ? `${Math.round(item.stability)}` : item.stability.toFixed(1)}
                    sub="days"
                    hint="days until recall falls to ~90%"
                  />
                  <ModelStat
                    label="Retrievability"
                    value={(() => { const r = currentRetrievability(item); return r == null ? '—' : `${Math.round(r)}%`; })()}
                    sub="now"
                    hint="predicted chance you'd recall it right now"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right: heatmap + backlog history */}
          <div className="flex flex-col gap-4 min-w-0">
            {/* Heatmap + window selector */}
            <div className="rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-surface p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Activity</span>
                <div className="flex gap-1 flex-wrap">
                  {HEATMAP_WINDOWS.map(w => (
                    <button
                      key={w.key}
                      onClick={() => setWindowKey(w.key)}
                      className={`px-2 py-0.5 text-xs rounded-md transition-colors ${
                        windowKey === w.key
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium'
                          : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              </div>
              <HeatmapCalendar
                data={heatmapData}
                windowKey={windowKey}
                selectedDay={selectedDay}
                onDayClick={day => setSelectedDay(prev => (prev === day ? null : day))}
              />
            </div>

            {/* History list (filtered to a clicked day if any) */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">History</span>
              {selectedDay && (
                <button
                  onClick={() => setSelectedDay(null)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {new Date(selectedDay + 'T00:00:00').toLocaleDateString()} ✕ clear
                </button>
              )}
            </div>
            {shownEvents.length === 0 ? (
              <div className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center border border-dashed border-gray-200 dark:border-dark-border rounded-xl">
                {selectedDay
                  ? 'No reviews on this day.'
                  : 'No reviews logged yet. Reviews you do from now on will appear here.'}
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {shownEvents.map(ev => (
                  <EventRow key={ev.id} event={ev} onSaved={load} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Full-screen image viewer. Backdrop or × closes it; clicking the image itself toggles
          fit-to-window ⇄ 1:1 pixels, which is what makes a dense code screenshot legible. */}
      {viewer && viewerSrc && (
        <div
          onClick={() => setViewer(null)}
          className="fixed inset-0 z-[60] bg-black/90 overflow-auto cursor-zoom-out"
        >
          <button
            onClick={(e) => { e.stopPropagation(); setViewer(null); }}
            className="fixed top-4 right-5 z-10 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white/80 hover:text-white text-xl leading-none flex items-center justify-center transition-colors"
            title="Close (Esc)"
          >
            ×
          </button>
          {viewer.img === 'question' && (
            <span className="fixed top-4 left-5 z-10 text-amber-300/90 text-xs px-2 py-1 rounded-md bg-black/60 pointer-events-none">
              ★ Question
            </span>
          )}
          <span className="fixed bottom-4 left-1/2 -translate-x-1/2 z-10 text-white/50 text-xs pointer-events-none">
            {viewer.zoom === 'fit' ? 'Click the image for actual size · Esc to close' : 'Click the image to fit · Esc to close'}
          </span>
          <div className={`min-h-full flex ${viewer.zoom === 'fit' ? 'items-center justify-center p-6' : 'items-start justify-start p-6'}`}>
            <img
              src={viewerSrc}
              alt=""
              onClick={(e) => {
                e.stopPropagation();
                // Toggle the ZOOM only — the image being viewed must not change underfoot.
                setViewer(v => (v ? { ...v, zoom: v.zoom === 'fit' ? 'actual' : 'fit' } : v));
              }}
              className={viewer.zoom === 'fit'
                ? 'max-w-full max-h-[calc(100vh-3rem)] object-contain cursor-zoom-in'
                : 'max-w-none cursor-zoom-out'}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-surface px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-0.5 truncate" title={value}>{value}</p>
      {hint && <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function ModelStat({ label, value, sub, hint }: { label: string; value: string; sub: string; hint: string }) {
  return (
    <div title={hint}>
      <p className="text-[10px] text-gray-400">{label}</p>
      <p className="text-base font-semibold text-gray-900 dark:text-gray-100 leading-tight">
        {value} <span className="text-[10px] font-normal text-gray-400">{sub}</span>
      </p>
    </div>
  );
}

const NOTE_KINDS: { kind: ReviewNoteKind; placeholder: string }[] = [
  { kind: 'note', placeholder: 'What did you think? (Enter to log)' },
  { kind: 'missed', placeholder: 'What did you miss? (Enter to log)' },
];

function EventRow({ event, onSaved }: { event: ReviewEvent; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState<ReviewNote[]>(event.notes ?? []);
  const [drafts, setDrafts] = useState<Record<ReviewNoteKind, string>>({ note: '', missed: '' });
  const badge = ratingBadge(event);
  const when = new Date(event.reviewed_at);
  const duration = fmtDuration(event.duration_seconds);

  // The event already exists here, so a note added from this page is attached to it directly.
  const addNote = async (kind: ReviewNoteKind, body: string) => {
    if (!body.trim()) return;
    const saved = await window.electronAPI.reviewNotes.add(event.review_item_id, kind, body, event.id);
    setNotes(prev => [...prev, saved]);
    setDrafts(d => ({ ...d, [kind]: '' }));
    onSaved();
  };

  const deleteNote = async (id: number) => {
    await window.electronAPI.reviewNotes.delete(id);
    setNotes(prev => prev.filter(n => n.id !== id));
    onSaved();
  };

  const setNoteImages = (noteId: number, images: ReviewNoteImage[]) =>
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, images } : n));

  const setNoteAudios = (noteId: number, audios: ReviewNoteAudio[]) =>
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, audios } : n));

  const onKeyDown = (kind: ReviewNoteKind) => (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    void addNote(kind, e.currentTarget.value);
  };

  const byKind = (k: ReviewNoteKind) => notes.filter(n => n.kind === k);

  return (
    <li className="rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface px-4 py-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {when.toLocaleDateString()} · {when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        {event.interval_after != null && (
          <span className="text-[11px] text-gray-400">→ next in {event.interval_after}d</span>
        )}
        {event.stability_after != null && (
          <span
            className="text-[11px] text-gray-400"
            title="FSRS stability (days) and difficulty (/10) after this review"
          >
            · S {event.stability_after >= 1 ? Math.round(event.stability_after) : event.stability_after.toFixed(1)}
            {event.difficulty_after != null && ` · D ${event.difficulty_after.toFixed(1)}`}
          </span>
        )}
        {duration && <span className="text-[11px] text-gray-400">· ⏱ {duration}</span>}
        <button
          onClick={() => setEditing(e => !e)}
          className="ml-auto text-[11px] text-gray-400 hover:text-blue-500 transition-colors"
        >
          {editing ? 'Done' : (notes.length > 0 ? `Notes · ${notes.length}` : 'Add note')}
        </button>
      </div>

      {/* Read-only list of every note logged for this review. */}
      {!editing && notes.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {byKind('note').map(n => (
            <div key={n.id} className="flex flex-col gap-1">
              {n.body && <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{n.body}</p>}
              <NoteThumbs images={n.images ?? []} />
              <NoteVoicePlayback audios={n.audios ?? []} />
            </div>
          ))}
          {byKind('missed').map(n => (
            <div key={n.id} className="flex flex-col gap-1">
              {n.body && (
                <p className="text-sm text-amber-700 dark:text-amber-400 whitespace-pre-wrap">
                  <span className="text-[11px] uppercase tracking-wide text-amber-500/70 mr-1">Missed</span>
                  {n.body}
                </p>
              )}
              <NoteThumbs images={n.images ?? []} />
              <NoteVoicePlayback audios={n.audios ?? []} />
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="mt-2 flex flex-col gap-3">
          {NOTE_KINDS.map(({ kind, placeholder }) => (
            <div key={kind} className="flex flex-col gap-1.5">
              {byKind(kind).map(n => (
                <div
                  key={n.id}
                  className="group flex flex-col gap-1.5 rounded-lg bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border px-3 py-1.5"
                >
                  <div className="flex items-start gap-2">
                    <p className={`flex-1 text-sm whitespace-pre-wrap break-words ${
                      kind === 'missed'
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-gray-800 dark:text-gray-200'
                    }`}>
                      {n.body}
                    </p>
                    <button
                      onClick={() => deleteNote(n.id)}
                      title="Delete this note"
                      className="shrink-0 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-xs leading-none pt-1"
                    >
                      ✕
                    </button>
                  </div>
                  <ReviewNoteImages
                    noteId={n.id}
                    images={n.images ?? []}
                    onChange={imgs => { setNoteImages(n.id, imgs); onSaved(); }}
                    variant="light"
                  />
                  <ReviewNoteAudios
                    noteId={n.id}
                    audios={n.audios ?? []}
                    onChange={auds => { setNoteAudios(n.id, auds); onSaved(); }}
                    variant="light"
                  />
                </div>
              ))}
              <textarea
                value={drafts[kind]}
                onChange={e => setDrafts(d => ({ ...d, [kind]: e.target.value }))}
                onKeyDown={onKeyDown(kind)}
                onBlur={e => void addNote(kind, e.currentTarget.value)}
                placeholder={placeholder}
                rows={2}
                className="w-full resize-none rounded-lg bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border text-gray-800 dark:text-gray-200 text-sm px-3 py-2 focus:outline-none focus:border-blue-400"
              />
            </div>
          ))}
        </div>
      )}
    </li>
  );
}
