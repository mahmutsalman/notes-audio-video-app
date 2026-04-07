import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { CalendarGrid } from './CalendarGrid';
import type { RecordingPlan, DurationPlan, UpdateRecordingPlan, UpdateDurationPlan } from '../../types';

type AnyPlan = RecordingPlan | DurationPlan;
type AnyUpdate = UpdateRecordingPlan | UpdateDurationPlan;

interface Props {
  plans: AnyPlan[];
  loading: boolean;
  addPlan: (partial: { plan_date: string; text: string }) => Promise<AnyPlan>;
  updatePlan: (id: number, updates: AnyUpdate) => Promise<AnyPlan>;
  deletePlan: (id: number) => Promise<void>;
  toggleComplete: (id: number) => Promise<void>;
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatSelectedDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export function PlannerSection({ plans, loading, addPlan, updatePlan, deletePlan, toggleComplete }: Props) {
  const { resolvedTheme } = useTheme();
  const today = toYMD(new Date());

  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [fullscreen, setFullscreen] = useState(false);
  const [newText, setNewText] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement>(null);

  // Close fullscreen on Escape
  useEffect(() => {
    if (!fullscreen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fullscreen]);

  // Focus edit input when editing starts
  useEffect(() => {
    if (editingId !== null) editRef.current?.focus();
  }, [editingId]);

  const plansForDay = plans.filter(p => p.plan_date === selectedDate)
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));

  const handleAddPlan = useCallback(async () => {
    const text = newText.trim();
    if (!text || !selectedDate) return;
    setNewText('');
    await addPlan({ plan_date: selectedDate, text });
  }, [newText, selectedDate, addPlan]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAddPlan();
  };

  const handleStartEdit = (plan: AnyPlan) => {
    setEditingId(plan.id);
    setEditingText(plan.text);
  };

  const handleSaveEdit = async (id: number) => {
    const text = editingText.trim();
    if (text) await updatePlan(id, { text });
    setEditingId(null);
    setEditingText('');
  };

  const handleEditKeyDown = (e: React.KeyboardEvent, id: number) => {
    if (e.key === 'Enter') handleSaveEdit(id);
    if (e.key === 'Escape') { setEditingId(null); setEditingText(''); }
  };

  const prevMonth = () => {
    setMonth(m => {
      if (m === 0) { setYear(y => y - 1); return 11; }
      return m - 1;
    });
  };

  const nextMonth = () => {
    setMonth(m => {
      if (m === 11) { setYear(y => y + 1); return 0; }
      return m + 1;
    });
  };

  const content = (
    <div
      className={[
        'flex flex-col h-full',
        fullscreen ? 'p-6' : 'p-0',
      ].join(' ')}
    >
      {/* Fullscreen header */}
      {fullscreen && (
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-700 dark:text-gray-200">Plans</h2>
          <button
            onClick={() => setFullscreen(false)}
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
            title="Exit fullscreen (Esc)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div className={['flex gap-6 flex-1 min-h-0', fullscreen ? 'flex-row items-start' : 'flex-col'].join(' ')}>
        {/* Calendar */}
        <div className={fullscreen ? 'w-72 flex-shrink-0' : 'w-full'}>
          <CalendarGrid
            year={year}
            month={month}
            selectedDate={selectedDate}
            plans={plans}
            onSelectDate={setSelectedDate}
            onPrevMonth={prevMonth}
            onNextMonth={nextMonth}
          />
        </div>

        {/* Plans for selected day */}
        <div className={['flex flex-col min-w-0', fullscreen ? 'flex-1' : 'w-full'].join(' ')}>
          {selectedDate && (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {formatSelectedDate(selectedDate)}
                </span>
                {plansForDay.length > 0 && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {plansForDay.filter(p => p.completed).length}/{plansForDay.length} done
                  </span>
                )}
              </div>

              {/* Plan items */}
              <div className="flex flex-col gap-1 mb-2">
                {loading && plansForDay.length === 0 ? (
                  <div className="text-xs text-gray-400 dark:text-gray-500 py-1">Loading...</div>
                ) : plansForDay.length === 0 ? (
                  <div className="text-xs text-gray-400 dark:text-gray-500 py-1 italic">No plans for this day</div>
                ) : plansForDay.map(plan => (
                  <div
                    key={plan.id}
                    className="group flex items-start gap-2 py-1 px-1.5 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleComplete(plan.id)}
                      className={[
                        'mt-0.5 flex-shrink-0 w-4 h-4 rounded border transition-all duration-150',
                        plan.completed
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'border-gray-300 dark:border-gray-600 hover:border-indigo-400 dark:hover:border-indigo-500',
                      ].join(' ')}
                      title={plan.completed ? 'Mark as incomplete' : 'Mark as done'}
                    >
                      {plan.completed !== 0 && (
                        <svg className="w-3 h-3 m-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>

                    {/* Text — editable inline */}
                    {editingId === plan.id ? (
                      <input
                        ref={editRef}
                        value={editingText}
                        onChange={e => setEditingText(e.target.value)}
                        onBlur={() => handleSaveEdit(plan.id)}
                        onKeyDown={e => handleEditKeyDown(e, plan.id)}
                        className="flex-1 text-sm bg-transparent border-b border-indigo-400 outline-none text-gray-700 dark:text-gray-200 py-0"
                      />
                    ) : (
                      <span
                        onClick={() => handleStartEdit(plan)}
                        className={[
                          'flex-1 text-sm cursor-text leading-snug',
                          plan.completed
                            ? 'line-through text-gray-400 dark:text-gray-500'
                            : 'text-gray-700 dark:text-gray-200',
                        ].join(' ')}
                        title="Click to edit"
                      >
                        {plan.text}
                      </span>
                    )}

                    {/* Delete */}
                    <button
                      onClick={() => deletePlan(plan.id)}
                      className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-all duration-150"
                      title="Delete plan"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>

              {/* Add new plan input */}
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-shrink-0 w-4 h-4 rounded border border-dashed border-gray-300 dark:border-gray-600" />
                <input
                  ref={inputRef}
                  value={newText}
                  onChange={e => setNewText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Add a plan… (Enter to save)"
                  className="flex-1 text-sm bg-transparent outline-none text-gray-600 dark:text-gray-400 placeholder-gray-400 dark:placeholder-gray-600 border-b border-transparent focus:border-gray-300 dark:focus:border-gray-600 py-0.5 transition-colors"
                />
                {newText.trim() && (
                  <button
                    onClick={handleAddPlan}
                    className="flex-shrink-0 text-xs text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 font-medium transition-colors"
                  >
                    Add
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (fullscreen) {
    return (
      <div
        style={{
          position: 'fixed', top: 0, left: 0,
          width: '100vw', height: '100vh',
          zIndex: 9999,
          background: resolvedTheme === 'dark' ? '#1e1e2e' : '#ffffff',
          overflow: 'auto',
        }}
      >
        {content}
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Fullscreen button */}
      <button
        onClick={() => setFullscreen(true)}
        className="absolute top-0 right-0 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors z-10"
        title="Fullscreen"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </svg>
      </button>
      {content}
    </div>
  );
}
