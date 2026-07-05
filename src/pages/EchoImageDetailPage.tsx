import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { ReviewItem, ReviewEvent, ReviewItemStats } from '../types';
import { formatDueLabel } from '../utils/srsAlgorithm';

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
          onClick={() => navigate('/echo')}
          className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 text-sm flex items-center gap-1 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Echo
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
          </div>

          {/* Right: backlog history */}
          <div className="flex flex-col gap-3 min-w-0">
            {/* Heatmap slot — filled in Phase 4 */}
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">History</div>
            {events.length === 0 ? (
              <div className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center border border-dashed border-gray-200 dark:border-dark-border rounded-xl">
                No reviews logged yet. Reviews you do from now on will appear here.
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {events.map(ev => (
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
