import { useMemo } from 'react';
import type { ReviewHeatmapDay } from '../../types';

export type HeatmapWindow = '7d' | '30d' | '3mo' | '6mo' | '1yr' | '2yr';

export const HEATMAP_WINDOWS: { key: HeatmapWindow; label: string; days: number }[] = [
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: '3mo', label: '3 months', days: 91 },
  { key: '6mo', label: '6 months', days: 182 },
  { key: '1yr', label: '1 year', days: 365 },
  { key: '2yr', label: '2 years', days: 730 },
];

interface HeatmapCalendarProps {
  data: ReviewHeatmapDay[];
  windowKey: HeatmapWindow;
  onDayClick?: (day: string) => void;
  selectedDay?: string | null;
}

interface Cell {
  key: string;      // 'YYYY-MM-DD' local
  count: number;
  avg: number | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Local 'YYYY-MM-DD' key for a Date (matches SQLite date(..,'localtime')). */
function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function intensityClass(count: number): string {
  if (count <= 0) return 'bg-gray-100 dark:bg-dark-surface';
  if (count === 1) return 'bg-emerald-200 dark:bg-emerald-900/60';
  if (count === 2) return 'bg-emerald-300 dark:bg-emerald-700/70';
  if (count <= 4) return 'bg-emerald-400 dark:bg-emerald-600';
  return 'bg-emerald-500 dark:bg-emerald-500';
}

export default function HeatmapCalendar({ data, windowKey, onDayClick, selectedDay }: HeatmapCalendarProps) {
  const days = HEATMAP_WINDOWS.find(w => w.key === windowKey)?.days ?? 365;

  const { weeks, monthLabels } = useMemo(() => {
    const byDay = new Map<string, ReviewHeatmapDay>();
    for (const d of data) byDay.set(d.day, d);

    // Build the inclusive [from, today] range of local days.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cells: (Cell | null)[] = [];

    // Leading padding so the first column starts on Sunday.
    const from = new Date(today);
    from.setDate(from.getDate() - (days - 1));
    const startPad = from.getDay(); // 0=Sun
    for (let i = 0; i < startPad; i++) cells.push(null);

    for (let i = 0; i < days; i++) {
      const d = new Date(from);
      d.setDate(from.getDate() + i);
      const key = toKey(d);
      const hit = byDay.get(key);
      cells.push({ key, count: hit?.count ?? 0, avg: hit?.avg_rating ?? null });
    }
    // Trailing padding to complete the last week.
    while (cells.length % 7 !== 0) cells.push(null);

    const weeks: (Cell | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    // Month label per column (shown when the column's first real day starts a new month).
    const monthLabels: (string | null)[] = weeks.map(week => {
      const first = week.find(Boolean) as Cell | undefined;
      if (!first) return null;
      const d = new Date(first.key + 'T00:00:00');
      return d.getDate() <= 7 ? MONTHS[d.getMonth()] : null;
    });

    return { weeks, monthLabels };
  }, [data, days]);

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex flex-col gap-1 min-w-min">
        {/* Month labels */}
        <div className="flex gap-[3px] pl-0">
          {monthLabels.map((m, i) => (
            <div key={i} className="w-3 text-[9px] text-gray-400 leading-none">{m ?? ''}</div>
          ))}
        </div>
        {/* Week columns */}
        <div className="flex gap-[3px]">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((cell, di) => {
                if (!cell) return <div key={di} className="w-3 h-3" />;
                const isSelected = selectedDay === cell.key;
                const title = cell.count > 0
                  ? `${cell.count} review${cell.count !== 1 ? 's' : ''} on ${cell.key}${cell.avg != null ? ` · avg ${cell.avg.toFixed(1)}` : ''}`
                  : `No reviews on ${cell.key}`;
                return (
                  <button
                    key={di}
                    title={title}
                    onClick={() => onDayClick?.(cell.key)}
                    className={`w-3 h-3 rounded-sm transition-all ${intensityClass(cell.count)} ${
                      isSelected ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-dark-bg' : ''
                    } ${cell.count > 0 || onDayClick ? 'cursor-pointer hover:ring-1 hover:ring-gray-400' : ''}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
        {/* Legend */}
        <div className="flex items-center gap-1.5 mt-1 text-[10px] text-gray-400">
          <span>Less</span>
          <span className="w-3 h-3 rounded-sm bg-gray-100 dark:bg-dark-surface" />
          <span className="w-3 h-3 rounded-sm bg-emerald-200 dark:bg-emerald-900/60" />
          <span className="w-3 h-3 rounded-sm bg-emerald-300 dark:bg-emerald-700/70" />
          <span className="w-3 h-3 rounded-sm bg-emerald-400 dark:bg-emerald-600" />
          <span className="w-3 h-3 rounded-sm bg-emerald-500 dark:bg-emerald-500" />
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
