import { useState, useEffect, useCallback } from 'react';
import type { RecordingPlan, DurationPlan, UpdateRecordingPlan, UpdateDurationPlan } from '../types';

export function useRecordingPlans(recordingId: number | null) {
  const [plans, setPlans] = useState<RecordingPlan[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPlans = useCallback(async () => {
    if (recordingId === null) { setPlans([]); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await window.electronAPI.recordingPlans.getByRecording(recordingId);
      setPlans(data);
    } finally {
      setLoading(false);
    }
  }, [recordingId]);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const addPlan = async (partial: { plan_date: string; text: string }): Promise<RecordingPlan> => {
    const newPlan = await window.electronAPI.recordingPlans.create({
      recording_id: recordingId!,
      sort_order: plans.filter(p => p.plan_date === partial.plan_date).length,
      completed: 0,
      ...partial,
    });
    setPlans(prev => [...prev, newPlan]);
    return newPlan;
  };

  const updatePlan = async (id: number, updates: UpdateRecordingPlan): Promise<RecordingPlan> => {
    const updated = await window.electronAPI.recordingPlans.update(id, updates);
    setPlans(prev => prev.map(p => p.id === id ? updated : p));
    return updated;
  };

  const deletePlan = async (id: number): Promise<void> => {
    await window.electronAPI.recordingPlans.delete(id);
    setPlans(prev => prev.filter(p => p.id !== id));
  };

  const toggleComplete = async (id: number): Promise<void> => {
    const plan = plans.find(p => p.id === id);
    if (!plan) return;
    await updatePlan(id, { completed: plan.completed ? 0 : 1 });
  };

  return { plans, loading, fetchPlans, addPlan, updatePlan, deletePlan, toggleComplete };
}

export function useDurationPlans(durationId: number | null) {
  const [plans, setPlans] = useState<DurationPlan[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPlans = useCallback(async () => {
    if (durationId === null) { setPlans([]); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await window.electronAPI.durationPlans.getByDuration(durationId);
      setPlans(data);
    } finally {
      setLoading(false);
    }
  }, [durationId]);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const addPlan = async (partial: { plan_date: string; text: string }): Promise<DurationPlan> => {
    const newPlan = await window.electronAPI.durationPlans.create({
      duration_id: durationId!,
      sort_order: plans.filter(p => p.plan_date === partial.plan_date).length,
      completed: 0,
      ...partial,
    });
    setPlans(prev => [...prev, newPlan]);
    return newPlan;
  };

  const updatePlan = async (id: number, updates: UpdateDurationPlan): Promise<DurationPlan> => {
    const updated = await window.electronAPI.durationPlans.update(id, updates);
    setPlans(prev => prev.map(p => p.id === id ? updated : p));
    return updated;
  };

  const deletePlan = async (id: number): Promise<void> => {
    await window.electronAPI.durationPlans.delete(id);
    setPlans(prev => prev.filter(p => p.id !== id));
  };

  const toggleComplete = async (id: number): Promise<void> => {
    const plan = plans.find(p => p.id === id);
    if (!plan) return;
    await updatePlan(id, { completed: plan.completed ? 0 : 1 });
  };

  return { plans, loading, fetchPlans, addPlan, updatePlan, deletePlan, toggleComplete };
}
