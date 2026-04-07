import { useMemo } from 'react';
import type { RecordingPlan, DurationPlan, CalendarTodo } from '../../types';

type AnyPlan = RecordingPlan | DurationPlan;

interface Props {
  year: number;
  month: number; // 0-indexed
  selectedDate: string | null; // 'YYYY-MM-DD'
  plans: AnyPlan[];
  todos?: CalendarTodo[];
  onSelectDate: (date: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES = ['Mo','Tu','We','Th','Fr','Sa','Su'];

function toYMD(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

export function CalendarGrid({ year, month, selectedDate, plans, todos = [], onSelectDate, onPrevMonth, onNextMonth }: Props) {
  const today = useMemo(() => {
    const d = new Date();
    return toYMD(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);

  // Build date → plan summary map
  const planMap = useMemo(() => {
    const map: Record<string, { total: number; completed: number }> = {};
    for (const p of plans) {
      if (!map[p.plan_date]) map[p.plan_date] = { total: 0, completed: 0 };
      map[p.plan_date].total++;
      if (p.completed) map[p.plan_date].completed++;
    }
    return map;
  }, [plans]);

  // Build date → todo summary map
  const todoMap = useMemo(() => {
    const map: Record<string, { total: number; completed: number }> = {};
    for (const t of todos) {
      if (!map[t.plan_date]) map[t.plan_date] = { total: 0, completed: 0 };
      map[t.plan_date].total++;
      if (t.completed) map[t.plan_date].completed++;
    }
    return map;
  }, [todos]);

  // Build calendar grid cells
  const cells = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Convert Sunday=0 to Monday=0
    const startOffset = (firstDay + 6) % 7;
    const result: (number | null)[] = [];
    for (let i = 0; i < startOffset; i++) result.push(null);
    for (let d = 1; d <= daysInMonth; d++) result.push(d);
    // Pad to complete last row
    while (result.length % 7 !== 0) result.push(null);
    return result;
  }, [year, month]);

  return (
    <div className="select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={onPrevMonth}
          className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
          title="Previous month"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          {MONTH_NAMES[month]} {year}
        </span>
        <button
          onClick={onNextMonth}
          className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
          title="Next month"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map(d => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 dark:text-gray-500 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} />;
          }
          const dateStr = toYMD(year, month, day);
          const summary = planMap[dateStr];
          const todoSummary = todoMap[dateStr];
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDate;
          const allDone = summary && summary.total > 0 && summary.completed === summary.total;
          const allTodosDone = todoSummary && todoSummary.total > 0 && todoSummary.completed === todoSummary.total;
          const hasDots = (summary && summary.total > 0) || (todoSummary && todoSummary.total > 0);

          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(dateStr)}
              className={[
                'relative flex flex-col items-center justify-center rounded-lg py-1.5 mx-0.5 transition-all duration-150 text-xs font-medium',
                isSelected
                  ? 'bg-indigo-500 text-white shadow-sm'
                  : isToday
                  ? 'ring-2 ring-indigo-400 ring-offset-1 dark:ring-offset-gray-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
              ].join(' ')}
            >
              <span>{day}</span>
              {hasDots && (
                <div className="mt-0.5 flex items-center gap-0.5">
                  {summary && summary.total > 0 && (
                    <span className={[
                      'w-1.5 h-1.5 rounded-full',
                      isSelected ? 'bg-indigo-200' : allDone ? 'bg-emerald-400' : 'bg-indigo-400',
                    ].join(' ')} />
                  )}
                  {todoSummary && todoSummary.total > 0 && (
                    <span className={[
                      'w-1.5 h-1.5 rounded-full',
                      isSelected ? 'bg-amber-200' : allTodosDone ? 'bg-emerald-400' : 'bg-amber-400',
                    ].join(' ')} />
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
