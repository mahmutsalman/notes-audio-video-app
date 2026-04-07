import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIsActiveTab } from '../context/TabsContext';
import { CalendarGrid } from '../components/plans/CalendarGrid';
import type { RecordingPlanWithContext, DurationPlanWithContext, UpdateRecordingPlan, UpdateDurationPlan } from '../types';

type AnyPlanCtx = (RecordingPlanWithContext & { _type: 'recording' }) | (DurationPlanWithContext & { _type: 'duration' });

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function PlansPage() {
  const navigate = useNavigate();
  const isActiveTab = useIsActiveTab();
  const today = toYMD(new Date());

  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState(today);
  const [recPlans, setRecPlans] = useState<RecordingPlanWithContext[]>([]);
  const [durPlans, setDurPlans] = useState<DurationPlanWithContext[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [rp, dp] = await Promise.all([
        window.electronAPI.recordingPlans.getAll(),
        window.electronAPI.durationPlans.getAll(),
      ]);
      setRecPlans(rp as RecordingPlanWithContext[]);
      setDurPlans(dp as DurationPlanWithContext[]);
    } catch (err) {
      console.error('[PlansPage] fetchAll error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch on mount (fresh navigation)
  useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Also refetch when this tab becomes active (multi-tab: switching back)
  useEffect(() => { if (isActiveTab) fetchAll(); }, [isActiveTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Merge all plans for calendar dot display
  const allPlans = useMemo(() => [
    ...recPlans.map(p => ({ ...p, plan_date: p.plan_date, completed: p.completed })),
    ...durPlans.map(p => ({ ...p, plan_date: p.plan_date, completed: p.completed })),
  ], [recPlans, durPlans]);

  // Plans for selected day, tagged with type
  const plansForDay = useMemo<AnyPlanCtx[]>(() => {
    const rp = recPlans
      .filter(p => p.plan_date === selectedDate)
      .map(p => ({ ...p, _type: 'recording' as const }));
    const dp = durPlans
      .filter(p => p.plan_date === selectedDate)
      .map(p => ({ ...p, _type: 'duration' as const }));
    return [...rp, ...dp].sort((a, b) => a.created_at.localeCompare(b.created_at));
  }, [recPlans, durPlans, selectedDate]);

  // Group plans by topic + recording
  const grouped = useMemo(() => {
    const groups: Record<string, { label: string; topicName: string; recordingId: number | null; plans: AnyPlanCtx[] }> = {};
    for (const plan of plansForDay) {
      const key = `${plan.topic_id}::${plan.recording_id ?? 'x'}`;
      if (!groups[key]) {
        const recordingId = plan._type === 'recording' ? plan.recording_id : (plan as DurationPlanWithContext).recording_id;
        groups[key] = {
          label: `${plan.topic_name} › ${plan.recording_name ?? 'Recording'}`,
          topicName: plan.topic_name,
          recordingId: recordingId ?? null,
          plans: [],
        };
      }
      groups[key].plans.push(plan);
    }
    return Object.values(groups);
  }, [plansForDay]);

  const handleToggle = async (plan: AnyPlanCtx) => {
    if (plan._type === 'recording') {
      const updated = await window.electronAPI.recordingPlans.update(plan.id, { completed: plan.completed ? 0 : 1 } as UpdateRecordingPlan);
      setRecPlans(prev => prev.map(p => p.id === plan.id ? { ...p, ...updated } : p));
    } else {
      const updated = await window.electronAPI.durationPlans.update(plan.id, { completed: plan.completed ? 0 : 1 } as UpdateDurationPlan);
      setDurPlans(prev => prev.map(p => p.id === plan.id ? { ...p, ...updated } : p));
    }
  };

  const handleDelete = async (plan: AnyPlanCtx) => {
    if (plan._type === 'recording') {
      await window.electronAPI.recordingPlans.delete(plan.id);
      setRecPlans(prev => prev.filter(p => p.id !== plan.id));
    } else {
      await window.electronAPI.durationPlans.delete(plan.id);
      setDurPlans(prev => prev.filter(p => p.id !== plan.id));
    }
  };

  const prevMonth = () => setMonth(m => { if (m === 0) { setYear(y => y - 1); return 11; } return m - 1; });
  const nextMonth = () => setMonth(m => { if (m === 11) { setYear(y => y + 1); return 0; } return m + 1; });

  const totalForDay = plansForDay.length;
  const doneForDay = plansForDay.filter(p => p.completed).length;

  return (
    <div className="max-w-4xl mx-auto px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Plans</h1>
        <button
          onClick={() => fetchAll()}
          disabled={loading}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-40 transition-colors"
          title="Refresh plans"
        >
          <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      <div className="flex gap-8 items-start">
        {/* Calendar */}
        <div className="w-72 flex-shrink-0 p-4 rounded-xl bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border shadow-sm">
          <CalendarGrid
            year={year}
            month={month}
            selectedDate={selectedDate}
            plans={allPlans}
            onSelectDate={setSelectedDate}
            onPrevMonth={prevMonth}
            onNextMonth={nextMonth}
          />
        </div>

        {/* Day detail */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-700 dark:text-gray-200">
              {formatDate(selectedDate)}
            </h2>
            {totalForDay > 0 && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {doneForDay}/{totalForDay} done
              </span>
            )}
          </div>

          {!loading && plansForDay.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500 italic">No plans for this day.</p>
          )}

          {grouped.map((group, gi) => (
            <div key={gi} className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <button
                  onClick={() => group.recordingId && navigate(`/recording/${group.recordingId}`)}
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline disabled:cursor-default disabled:no-underline disabled:text-gray-400"
                  disabled={!group.recordingId}
                >
                  {group.label}
                </button>
              </div>
              <div className="space-y-1 pl-2 border-l-2 border-indigo-200 dark:border-indigo-800">
                {group.plans.map(plan => (
                  <div key={`${plan._type}-${plan.id}`} className="group flex items-start gap-2 py-1 px-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    {/* Checkbox */}
                    <button
                      onClick={() => handleToggle(plan)}
                      className={[
                        'mt-0.5 flex-shrink-0 w-4 h-4 rounded border transition-all duration-150',
                        plan.completed
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'border-gray-300 dark:border-gray-600 hover:border-indigo-400',
                      ].join(' ')}
                    >
                      {plan.completed !== 0 && (
                        <svg className="w-3 h-3 m-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>

                    {/* Text */}
                    <span className={[
                      'flex-1 text-sm leading-snug',
                      plan.completed ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-200',
                    ].join(' ')}>
                      {plan.text}
                      {plan._type === 'duration' && (plan as DurationPlanWithContext).duration_caption && (
                        <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">
                          ({(plan as DurationPlanWithContext).duration_caption})
                        </span>
                      )}
                    </span>

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(plan)}
                      className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-all"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
