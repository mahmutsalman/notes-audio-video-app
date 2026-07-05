import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { ReviewItem, ReviewEvent, ReviewItemStats, ReviewHeatmapDay } from '../types';
import { formatDueLabel } from '../utils/srsAlgorithm';
import { currentRetrievability, stateLabel } from '../utils/fsrs';
import HeatmapCalendar, { HEATMAP_WINDOWS, type HeatmapWindow } from '../components/echo/HeatmapCalendar';

/** Local 'YYYY-MM-DD' key for an ISO timestamp (matches the heatmap + SQLite localtime). */
function localDayKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const RATING_META: Record<number, { label: string; cls: string }> = {
  1: { label: 'Again', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  2: { label: 'Hard', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  3: { label: 'Good', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  4: { label: 'Easy', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
};

function ratingBadge(e: ReviewEvent) {
  if (e.rating == null) {
    return { label: e.scheduling_mode === 'manual' ? 'Manual' : '—', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' };
  }
  return RATING_META[e.rating] ?? { label: String(e.rating), cls: 'bg-gray-100 text-gray-600' };
}

function fmtDuration(sec: number | null): string | null {
  if (sec == null) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function EchoImageDetailPage() {
  const { reviewItemId } = useParams<{ reviewItemId: string }>();
  const navigate = useNavigate();
  const id = Number(reviewItemId);

  const [item, setItem] = useState<ReviewItem | null>(null);
  const [stats, setStats] = useState<ReviewItemStats | null>(null);
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const [windowKey, setWindowKey] = useState<HeatmapWindow>('1yr');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

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

  const src = item.file_path ? window.electronAPI.paths.getFileUrl(item.file_path) : null;
  const avg = stats?.avg_rating != null ? stats.avg_rating.toFixed(2) : '—';

  return (
    <div className="flex flex-col h-full bg-white dark:bg-dark-bg overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 border-b border-gray-200 dark:border-dark-border flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => navigate(-1)}
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
        </div>
        {item.recording_id && (
          <button
            onClick={() => navigate(`/recording/${item.recording_id}`)}
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
                <img src={src} alt="" className="w-full object-contain max-h-80" />
              ) : (
                <div className="aspect-video flex items-center justify-center text-gray-400 text-3xl">🖼️</div>
              )}
            </div>

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

function EventRow({ event, onSaved }: { event: ReviewEvent; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(event.note ?? '');
  const [missed, setMissed] = useState(event.missed_points ?? '');
  const [saving, setSaving] = useState(false);
  const badge = ratingBadge(event);
  const when = new Date(event.reviewed_at);
  const duration = fmtDuration(event.duration_seconds);

  const save = async () => {
    setSaving(true);
    await window.electronAPI.reviewEvents.updateNote(event.id, note.trim() || null, missed.trim() || null);
    setSaving(false);
    setEditing(false);
    onSaved();
  };

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
          {editing ? 'Cancel' : (event.note || event.missed_points ? 'Edit note' : 'Add note')}
        </button>
      </div>

      {!editing ? (
        (event.note || event.missed_points) && (
          <div className="mt-2 flex flex-col gap-1.5">
            {event.note && (
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{event.note}</p>
            )}
            {event.missed_points && (
              <p className="text-sm text-amber-700 dark:text-amber-400 whitespace-pre-wrap">
                <span className="text-[11px] uppercase tracking-wide text-amber-500/70 mr-1">Missed</span>
                {event.missed_points}
              </p>
            )}
          </div>
        )
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="What did you think?"
            rows={2}
            className="w-full resize-none rounded-lg bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border text-gray-800 dark:text-gray-200 text-sm px-3 py-2 focus:outline-none focus:border-blue-400"
          />
          <textarea
            value={missed}
            onChange={e => setMissed(e.target.value)}
            placeholder="What did you miss?"
            rows={2}
            className="w-full resize-none rounded-lg bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border text-gray-800 dark:text-gray-200 text-sm px-3 py-2 focus:outline-none focus:border-blue-400"
          />
          <button
            onClick={save}
            disabled={saving}
            className="self-start px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </li>
  );
}
