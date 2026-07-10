import { useState, useEffect, useCallback, useRef } from 'react';
import type { StudyDuration, UpdateDuration, DurationImage, DurationAudio, DurationCodeSnippet } from '../types';

export function useStudyDurations(topicIds?: number[]) {
  const [durations, setDurations] = useState<StudyDuration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [durationImagesCache, setDurationImagesCache] = useState<Record<number, DurationImage[]>>({});
  const [durationAudiosCache, setDurationAudiosCache] = useState<Record<number, DurationAudio[]>>({});
  const [durationCodeSnippetsCache, setDurationCodeSnippetsCache] = useState<Record<number, DurationCodeSnippet[]>>({});

  // Stable reference for topicIds to avoid unnecessary re-fetches
  const topicIdsRef = useRef<string | undefined>();
  const topicIdsKey = topicIds ? topicIds.sort().join(',') : undefined;

  const fetchDurations = useCallback(async () => {
    // Empty array = no topics selected, show nothing
    if (topicIds && topicIds.length === 0) {
      setDurations([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await window.electronAPI.durations.getWithAudio(topicIds);
      setDurations(data as StudyDuration[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch study durations');
      console.error('Failed to fetch study durations:', err);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicIdsKey]);

  useEffect(() => {
    if (topicIdsRef.current !== topicIdsKey) {
      topicIdsRef.current = topicIdsKey;
      fetchDurations();
    }
  }, [topicIdsKey, fetchDurations]);

  // Initial fetch
  useEffect(() => {
    fetchDurations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const addDurationImageFromClipboard = useCallback(async (durationId: number): Promise<DurationImage | null> => {
    try {
      const clipboardResult = await window.electronAPI.clipboard.readImage();
      if (!clipboardResult.success || !clipboardResult.buffer) {
        return null;
      }

      const newImage = await window.electronAPI.durationImages.addFromClipboard(
        durationId,
        clipboardResult.buffer,
        clipboardResult.extension || 'png'
      );

      setDurationImagesCache(prev => ({
        ...prev,
        [durationId]: [...(prev[durationId] || []), newImage]
      }));

      return newImage;
    } catch (err) {
      console.error('Failed to add duration image:', err);
      return null;
    }
  }, []);

  const refreshDurationAudios = useCallback(async (durationId: number) => {
    const audios = await window.electronAPI.durationAudios.getByDuration(durationId);
    setDurationAudiosCache(prev => ({ ...prev, [durationId]: audios }));
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
    addDurationImageFromClipboard,
    refreshDurationAudios,
  };
}
