import { useState, useEffect, useCallback } from 'react';
import type { Duration, CreateDuration, UpdateDuration } from '../types';

export function useDurations(recordingId: number | null) {
  const [durations, setDurations] = useState<Duration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDurations = useCallback(async () => {
    if (recordingId === null) {
      setDurations([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await window.electronAPI.durations.getByRecording(recordingId);
      setDurations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch durations');
      console.error('Failed to fetch durations:', err);
    } finally {
      setLoading(false);
    }
  }, [recordingId]);

  useEffect(() => {
    fetchDurations();
  }, [fetchDurations]);

  const createDuration = async (duration: CreateDuration): Promise<Duration> => {
    const newDuration = await window.electronAPI.durations.create(duration);
    setDurations(prev => [...prev, newDuration].sort((a, b) => a.start_time - b.start_time));
    return newDuration;
  };

  const updateDuration = async (id: number, updates: UpdateDuration): Promise<Duration> => {
    const updatedDuration = await window.electronAPI.durations.update(id, updates);
    setDurations(prev => prev.map(d => d.id === id ? updatedDuration : d));
    return updatedDuration;
  };

  const deleteDuration = async (id: number): Promise<void> => {
    await window.electronAPI.durations.delete(id);
    setDurations(prev => prev.filter(d => d.id !== id));
  };

  return {
    durations,
    loading,
    error,
    fetchDurations,
    createDuration,
    updateDuration,
    deleteDuration,
  };
}
