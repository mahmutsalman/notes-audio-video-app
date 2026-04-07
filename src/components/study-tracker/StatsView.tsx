import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { StudyStats, StudySessionWithEvents } from '../../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtDate(iso: string): string {
  const [y, mo, d] = iso.split('-').map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

type RangePreset = 'today' | 'week' | 'month' | 'year' | 'custom';

function rangeFromPreset(preset: RangePreset, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date();
  const today = toYMD(now);
  switch (preset) {
    case 'today': return { from: today, to: today };
    case 'week': {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      return { from: toYMD(d), to: today };
    }
    case 'month': {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toYMD(d), to: today };
    }
    case 'year': {
      return { from: `${now.getFullYear()}-01-01`, to: today };
    }
    case 'custom': return { from: customFrom, to: customTo };
  }
}

// ─── Heatmap ──────────────────────────────────────────────────────────────────

function HeatmapCalendar({
  heatmap,
  from,
  to,
  selectedDate,
  onSelect,
}: {
  heatmap: { date: string; total_seconds: number }[];
  from: string;
  to: string;
  selectedDate: string | null;
  onSelect: (date: string) => void;
}) {
  const heatmapMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const h of heatmap) m[h.date] = h.total_seconds;
    return m;
  }, [heatmap]);

  const maxSecs = useMemo(() => Math.max(...heatmap.map(h => h.total_seconds), 1), [heatmap]);

  // Build all days in range
  const days = useMemo(() => {
    const result: string[] = [];
    const start = new Date(from + 'T00:00:00');
    const end = new Date(to + 'T00:00:00');
    const cur = new Date(start);
    while (cur <= end) {
      result.push(toYMD(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  }, [from, to]);

  function intensity(secs: number): string {
    if (secs === 0) return 'bg-gray-100 dark:bg-gray-700/40';
    const ratio = secs / maxSecs;
    if (ratio < 0.25) return 'bg-emerald-200 dark:bg-emerald-900/50';
    if (ratio < 0.5) return 'bg-emerald-300 dark:bg-emerald-700/70';
    if (ratio < 0.75) return 'bg-emerald-400 dark:bg-emerald-600';
    return 'bg-emerald-500 dark:bg-emerald-500';
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {days.map(date => {
          const secs = heatmapMap[date] ?? 0;
          const isSelected = date === selectedDate;
          return (
            <button
              key={date}
              onClick={() => onSelect(date)}
              title={`${fmtDate(date)}: ${secs > 0 ? fmtTime(secs) : 'no study'}`}
              className={[
                'w-5 h-5 rounded-sm transition-all',
                intensity(secs),
                isSelected ? 'ring-2 ring-emerald-500 ring-offset-1 dark:ring-offset-gray-800' : 'hover:opacity-80',
              ].join(' ')}
            />
          );
        })}
      </div>
      {heatmap.length > 0 && (
        <div className="flex items-center gap-1 mt-2 text-xs text-gray-400 dark:text-gray-500">
          <span>Less</span>
          <div className="w-3 h-3 rounded-sm bg-gray-100 dark:bg-gray-700/40" />
          <div className="w-3 h-3 rounded-sm bg-emerald-200 dark:bg-emerald-900/50" />
          <div className="w-3 h-3 rounded-sm bg-emerald-300 dark:bg-emerald-700/70" />
          <div className="w-3 h-3 rounded-sm bg-emerald-400 dark:bg-emerald-600" />
          <div className="w-3 h-3 rounded-sm bg-emerald-500 dark:bg-emerald-500" />
          <span>More</span>
        </div>
      )}
    </div>
  );
}

// ─── Bar list ─────────────────────────────────────────────────────────────────

function BarList<T extends { total_seconds: number }>({
  items,
  getLabel,
  getSub,
  onClickItem,
  maxItems = 10,
}: {
  items: T[];
  getLabel: (item: T) => string;
  getSub?: (item: T) => string;
  onClickItem?: (item: T) => void;
  maxItems?: number;
}) {
  const max = Math.max(...items.map(i => i.total_seconds), 1);
  return (
    <div className="space-y-1.5">
      {items.slice(0, maxItems).map((item, idx) => (
        <div
          key={idx}
          className={[
            'group',
            onClickItem ? 'cursor-pointer' : '',
          ].join(' ')}
          onClick={() => onClickItem?.(item)}
        >
          <div className="flex items-center justify-between mb-0.5">
            <span
              className={[
                'text-xs truncate max-w-[70%]',
                onClickItem ? 'group-hover:text-indigo-600 dark:group-hover:text-indigo-400' : '',
                'text-gray-700 dark:text-gray-300',
              ].join(' ')}
              title={getLabel(item)}
            >
              {getLabel(item)}
            </span>
            <div className="flex items-center gap-2 flex-shrink-0">
              {getSub && (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {getSub(item)}
                </span>
              )}
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300 tabular-nums">
                {fmtTime(item.total_seconds)}
              </span>
            </div>
          </div>
          <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-400 dark:bg-emerald-500 rounded-full transition-all"
              style={{ width: `${(item.total_seconds / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Day sessions panel ───────────────────────────────────────────────────────

function DaySessionsPanel({
  date,
  sessions,
}: {
  date: string;
  sessions: StudySessionWithEvents[];
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const navigate = useNavigate();

  if (sessions.length === 0) {
    return (
      <p className="text-xs text-gray-400 dark:text-gray-500 italic">No study sessions on {fmtDate(date)}.</p>
    );
  }

  return (
    <div className="space-y-2">
      {sessions.map(s => {
        const isOpen = expanded === s.id;
        // Group events by recording
        const byRecording: Record<string, { name: string; recId: number; secs: number; markCount: number; imageOpens: number }> = {};
        for (const ev of s.events) {
          if (!ev.recording_id) continue;
          const key = String(ev.recording_id);
          if (!byRecording[key]) {
            byRecording[key] = {
              name: ev.recording_name ?? 'Unknown',
              recId: ev.recording_id,
              secs: 0,
              markCount: 0,
              imageOpens: 0,
            };
          }
          byRecording[key].secs += ev.seconds ?? 0;
          if (ev.event_type === 'view_mark') byRecording[key].markCount++;
          if (ev.event_type === 'view_image') byRecording[key].imageOpens++;
        }

        return (
          <div
            key={s.id}
            className="rounded-lg border border-gray-200 dark:border-dark-border overflow-hidden"
          >
            <button
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors text-left"
              onClick={() => setExpanded(isOpen ? null : s.id)}
            >
              <div className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                  <circle cx="12" cy="13" r="8" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4l2.5 2.5" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 3h5M12 3v2" />
                </svg>
                <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">
                  {fmtDateTime(s.started_at)}
                  {s.ended_at && ` – ${fmtDateTime(s.ended_at)}`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {fmtTime(s.total_seconds)}
                </span>
                <svg
                  className={`w-3 h-3 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {isOpen && (
              <div className="px-3 pb-2 border-t border-gray-100 dark:border-dark-border pt-2 space-y-1.5">
                {Object.values(byRecording).length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No recording activity logged.</p>
                ) : Object.values(byRecording).map(r => (
                  <div key={r.recId} className="flex items-center justify-between">
                    <button
                      onClick={() => navigate(`/recording/${r.recId}`)}
                      className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline truncate max-w-[60%] text-left"
                    >
                      {r.name}
                    </button>
                    <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                      {r.imageOpens > 0 && <span>{r.imageOpens} img</span>}
                      {r.markCount > 0 && <span>{r.markCount} marks</span>}
                      <span className="font-medium text-gray-600 dark:text-gray-300 tabular-nums">{fmtTime(r.secs)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── StatsView ────────────────────────────────────────────────────────────────

export default function StatsView() {
  const navigate = useNavigate();
  const [preset, setPreset] = useState<RangePreset>('week');
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return toYMD(d);
  });
  const [customTo, setCustomTo] = useState(() => toYMD(new Date()));
  const [heatmap, setHeatmap] = useState<{ date: string; total_seconds: number }[]>([]);
  const [stats, setStats] = useState<StudyStats | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [daySessions, setDaySessions] = useState<StudySessionWithEvents[]>([]);
  const [activeTab, setActiveTab] = useState<'topics' | 'recordings' | 'marks'>('topics');
  const [loading, setLoading] = useState(false);

  const { from, to } = rangeFromPreset(preset, customFrom, customTo);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [h, s] = await Promise.all([
        window.electronAPI.studyTracker.getHeatmap(from, to),
        window.electronAPI.studyTracker.getStats(from, to),
      ]);
      setHeatmap(h);
      setStats(s);
    } catch (e) {
      console.error('[StatsView] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchDay = useCallback(async (date: string) => {
    setSelectedDate(date);
    try {
      const sessions = await window.electronAPI.studyTracker.getSessionsForDay(date);
      setDaySessions(sessions as StudySessionWithEvents[]);
    } catch (e) {
      console.error('[StatsView] fetchDay error:', e);
    }
  }, []);

  const totalSeconds = useMemo(
    () => heatmap.reduce((sum, h) => sum + h.total_seconds, 0),
    [heatmap],
  );

  const PRESETS: { key: RangePreset; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: '7 days' },
    { key: 'month', label: 'This month' },
    { key: 'year', label: 'This year' },
    { key: 'custom', label: 'Custom' },
  ];

  return (
    <div className="space-y-4">
      {/* Header + range */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1">
          {PRESETS.map(p => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={[
                'text-xs px-2.5 py-1 rounded-full transition-colors',
                preset === p.key
                  ? 'bg-emerald-500 text-white'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-hover',
              ].join(' ')}
            >
              {p.label}
            </button>
          ))}
        </div>
        {totalSeconds > 0 && (
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            {fmtTime(totalSeconds)} studied
          </span>
        )}
      </div>

      {/* Custom range inputs */}
      {preset === 'custom' && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={customFrom}
            onChange={e => setCustomFrom(e.target.value)}
            className="text-xs border border-gray-200 dark:border-dark-border rounded-md px-2 py-1 bg-transparent text-gray-700 dark:text-gray-300"
          />
          <span className="text-xs text-gray-400">to</span>
          <input
            type="date"
            value={customTo}
            onChange={e => setCustomTo(e.target.value)}
            className="text-xs border border-gray-200 dark:border-dark-border rounded-md px-2 py-1 bg-transparent text-gray-700 dark:text-gray-300"
          />
        </div>
      )}

      {/* Heatmap */}
      {loading ? (
        <div className="text-xs text-gray-400 dark:text-gray-500 py-2">Loading...</div>
      ) : (
        <HeatmapCalendar
          heatmap={heatmap}
          from={from}
          to={to}
          selectedDate={selectedDate}
          onSelect={fetchDay}
        />
      )}

      {/* Day sessions */}
      {selectedDate && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            {fmtDate(selectedDate)}
          </p>
          <DaySessionsPanel date={selectedDate} sessions={daySessions} />
        </div>
      )}

      {/* Stats tabs */}
      {stats && (
        <div>
          {/* Tab switcher */}
          <div className="flex gap-1 mb-3 border-b border-gray-100 dark:border-dark-border">
            {(['topics', 'recordings', 'marks'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={[
                  'text-xs px-3 py-1.5 capitalize transition-colors',
                  activeTab === tab
                    ? 'border-b-2 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-medium'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
                ].join(' ')}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === 'topics' && (
            stats.byTopic.length === 0
              ? <p className="text-xs text-gray-400 italic">No topic data for this period.</p>
              : <BarList
                  items={stats.byTopic}
                  getLabel={i => i.topic_name}
                  getSub={i => `${i.session_count} session${i.session_count !== 1 ? 's' : ''}`}
                />
          )}

          {activeTab === 'recordings' && (
            stats.byRecording.length === 0
              ? <p className="text-xs text-gray-400 italic">No recording data for this period.</p>
              : <BarList
                  items={stats.byRecording}
                  getLabel={i => i.recording_name}
                  getSub={i => i.topic_name}
                  onClickItem={i => navigate(`/recording/${i.recording_id}`)}
                />
          )}

          {activeTab === 'marks' && (
            stats.byMark.length === 0
              ? <p className="text-xs text-gray-400 italic">No mark data for this period.</p>
              : <BarList
                  items={stats.byMark}
                  getLabel={i => i.duration_caption || '(untitled mark)'}
                  getSub={i => {
                    const parts = [];
                    if (i.image_opens > 0) parts.push(`${i.image_opens} img`);
                    return parts.join(' · ') || i.recording_name;
                  }}
                />
          )}
        </div>
      )}
    </div>
  );
}
