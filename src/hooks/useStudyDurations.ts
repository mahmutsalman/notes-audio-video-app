import { useState, useEffect, useCallback } from 'react';
import type { StudyDuration, UpdateDuration, DurationImage, DurationAudio, DurationCodeSnippet } from '../types';

export function useStudyDurations() {
  const [durations, setDurations] = useState<StudyDuration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [durationImagesCache, setDurationImagesCache] = useState<Record<number, DurationImage[]>>({});
  const [durationAudiosCache, setDurationAudiosCache] = useState<Record<number, DurationAudio[]>>({});
  const [durationCodeSnippetsCache, setDurationCodeSnippetsCache] = useState<Record<number, DurationCodeSnippet[]>>({});

  const fetchDurations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await window.electronAPI.durations.getWithAudio();
      setDurations(data as StudyDuration[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch study durations');
      console.error('Failed to fetch study durations:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDurations();
  }, [fetchDurations]);

  const updateDuration = async (id: number, updates: UpdateDuration): Promise<void> => {
    await window.electronAPI.durations.update(id, updates);
    setDurations(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  };

  const getDurationImages = useCallback(async (durationId: number): Promise<DurationImage[]> => {
    let cached: DurationImage[] | undefined;
    setDurationImagesCache(prev => {
      cached = prev[durationId];
      return prev;
    });
    if (cached) return cached;

    const images = await window.electronAPI.durationImages.getByDuration(durationId);
    setDurationImagesCache(prev => ({ ...prev, [durationId]: images }));
    return images;
  }, []);

  const getDurationAudios = useCallback(async (durationId: number): Promise<DurationAudio[]> => {
    let cached: DurationAudio[] | undefined;
    setDurationAudiosCache(prev => {
      cached = prev[durationId];
      return prev;
    });
    if (cached) return cached;

    const audios = await window.electronAPI.durationAudios.getByDuration(durationId);
    setDurationAudiosCache(prev => ({ ...prev, [durationId]: audios }));
    return audios;
  }, []);

  const getDurationCodeSnippets = useCallback(async (durationId: number): Promise<DurationCodeSnippet[]> => {
    let cached: DurationCodeSnippet[] | undefined;
    setDurationCodeSnippetsCache(prev => {
      cached = prev[durationId];
      return prev;
    });
    if (cached) return cached;

    const snippets = await window.electronAPI.durationCodeSnippets.getByDuration(durationId);
    setDurationCodeSnippetsCache(prev => ({ ...prev, [durationId]: snippets }));
    return snippets;
  }, []);

  return {
    durations,
    loading,
    error,
    refetch: fetchDurations,
    updateDuration,
    durationImagesCache,
    getDurationImages,
    durationAudiosCache,
    getDurationAudios,
    durationCodeSnippetsCache,
    getDurationCodeSnippets,
  };
}
