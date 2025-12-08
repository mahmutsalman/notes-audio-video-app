import { useState, useEffect, useCallback } from 'react';
import type { Duration, CreateDuration, UpdateDuration, DurationImage } from '../types';

export function useDurations(recordingId: number | null) {
  const [durations, setDurations] = useState<Duration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Cache of duration images, keyed by duration ID
  const [durationImagesCache, setDurationImagesCache] = useState<Record<number, DurationImage[]>>({});

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
    // Clear from cache
    setDurationImagesCache(prev => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
  };

  // Fetch images for a specific duration
  const getDurationImages = useCallback(async (durationId: number): Promise<DurationImage[]> => {
    // Return cached if available
    if (durationImagesCache[durationId]) {
      return durationImagesCache[durationId];
    }

    const images = await window.electronAPI.durationImages.getByDuration(durationId);
    setDurationImagesCache(prev => ({ ...prev, [durationId]: images }));
    return images;
  }, [durationImagesCache]);

  // Add image from clipboard to a duration
  const addDurationImageFromClipboard = async (durationId: number): Promise<DurationImage | null> => {
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

      // Update cache
      setDurationImagesCache(prev => ({
        ...prev,
        [durationId]: [...(prev[durationId] || []), newImage]
      }));

      return newImage;
    } catch (err) {
      console.error('Failed to add duration image:', err);
      return null;
    }
  };

  // Delete a duration image
  const deleteDurationImage = async (imageId: number, durationId: number): Promise<void> => {
    await window.electronAPI.durationImages.delete(imageId);
    // Update cache
    setDurationImagesCache(prev => ({
      ...prev,
      [durationId]: (prev[durationId] || []).filter(img => img.id !== imageId)
    }));
  };

  // Clear cache for a duration (useful when switching recordings)
  const clearDurationImagesCache = useCallback(() => {
    setDurationImagesCache({});
  }, []);

  // Clear cache when recording changes
  useEffect(() => {
    clearDurationImagesCache();
  }, [recordingId, clearDurationImagesCache]);

  return {
    durations,
    loading,
    error,
    fetchDurations,
    createDuration,
    updateDuration,
    deleteDuration,
    // Duration image functions
    durationImagesCache,
    getDurationImages,
    addDurationImageFromClipboard,
    deleteDurationImage,
    clearDurationImagesCache,
  };
}
