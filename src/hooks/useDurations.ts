import { useState, useEffect, useCallback } from 'react';
import type { Duration, CreateDuration, UpdateDuration, DurationImage, DurationVideo, DurationAudio } from '../types';

export function useDurations(recordingId: number | null) {
  const [durations, setDurations] = useState<Duration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Cache of duration images, keyed by duration ID
  const [durationImagesCache, setDurationImagesCache] = useState<Record<number, DurationImage[]>>({});
  // Cache of duration videos, keyed by duration ID
  const [durationVideosCache, setDurationVideosCache] = useState<Record<number, DurationVideo[]>>({});
  // Cache of duration audios, keyed by duration ID
  const [durationAudiosCache, setDurationAudiosCache] = useState<Record<number, DurationAudio[]>>({});

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
    setDurationVideosCache(prev => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
    setDurationAudiosCache(prev => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
  };

  // Fetch images for a specific duration
  const getDurationImages = useCallback(async (durationId: number, force?: boolean): Promise<DurationImage[]> => {
    // Return cached if available AND not forcing refresh
    if (!force && durationImagesCache[durationId]) {
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

  // Fetch videos for a specific duration
  const getDurationVideos = useCallback(async (durationId: number, force?: boolean): Promise<DurationVideo[]> => {
    // Return cached if available AND not forcing refresh
    if (!force && durationVideosCache[durationId]) {
      return durationVideosCache[durationId];
    }

    const videos = await window.electronAPI.durationVideos.getByDuration(durationId);
    setDurationVideosCache(prev => ({ ...prev, [durationId]: videos }));
    return videos;
  }, [durationVideosCache]);

  // Add video from clipboard to a duration (reads file path from clipboard)
  const addDurationVideoFromClipboard = async (durationId: number): Promise<DurationVideo | null> => {
    try {
      // Try to read file URL from clipboard (works with CleanShot, Finder, etc.)
      const fileResult = await window.electronAPI.clipboard.readFileUrl();

      if (fileResult.success && fileResult.filePath) {
        // Check if the file is a video by extension
        const videoExtensions = ['.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v'];
        const ext = fileResult.filePath.toLowerCase().slice(fileResult.filePath.lastIndexOf('.'));

        if (!videoExtensions.includes(ext)) {
          return null; // Not a video file
        }

        // Add the video using file path (main process will handle file reading)
        const newVideo = await window.electronAPI.durationVideos.addFromFile(
          durationId,
          fileResult.filePath
        );

        // Update cache
        setDurationVideosCache(prev => ({
          ...prev,
          [durationId]: [...(prev[durationId] || []), newVideo]
        }));

        return newVideo;
      }

      return null;
    } catch (err) {
      console.error('Failed to add duration video:', err);
      return null;
    }
  };

  // Delete a duration video
  const deleteDurationVideo = async (videoId: number, durationId: number): Promise<void> => {
    await window.electronAPI.durationVideos.delete(videoId);
    // Update cache
    setDurationVideosCache(prev => ({
      ...prev,
      [durationId]: (prev[durationId] || []).filter(vid => vid.id !== videoId)
    }));
  };

  // Fetch audios for a specific duration
  const getDurationAudios = useCallback(async (durationId: number, force?: boolean): Promise<DurationAudio[]> => {
    // Return cached if available AND not forcing refresh
    if (!force && durationAudiosCache[durationId]) {
      return durationAudiosCache[durationId];
    }

    const audios = await window.electronAPI.durationAudios.getByDuration(durationId);
    setDurationAudiosCache(prev => ({ ...prev, [durationId]: audios }));
    return audios;
  }, [durationAudiosCache]);

  // Add audio from buffer to a duration
  const addDurationAudioFromBuffer = async (durationId: number, audioBuffer: ArrayBuffer, extension: string = 'webm'): Promise<DurationAudio> => {
    const newAudio = await window.electronAPI.durationAudios.addFromBuffer(
      durationId,
      audioBuffer,
      extension
    );

    // Update cache
    setDurationAudiosCache(prev => ({
      ...prev,
      [durationId]: [...(prev[durationId] || []), newAudio]
    }));

    return newAudio;
  };

  // Delete a duration audio
  const deleteDurationAudio = async (audioId: number, durationId: number): Promise<void> => {
    await window.electronAPI.durationAudios.delete(audioId);
    // Update cache
    setDurationAudiosCache(prev => ({
      ...prev,
      [durationId]: (prev[durationId] || []).filter(aud => aud.id !== audioId)
    }));
  };

  // Clear cache for a duration (useful when switching recordings)
  const clearDurationImagesCache = useCallback(() => {
    setDurationImagesCache({});
  }, []);

  const clearDurationVideosCache = useCallback(() => {
    setDurationVideosCache({});
  }, []);

  const clearDurationAudiosCache = useCallback(() => {
    setDurationAudiosCache({});
  }, []);

  // Clear cache when recording changes
  useEffect(() => {
    clearDurationImagesCache();
    clearDurationVideosCache();
    clearDurationAudiosCache();
  }, [recordingId, clearDurationImagesCache, clearDurationVideosCache, clearDurationAudiosCache]);

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
    // Duration video functions
    durationVideosCache,
    getDurationVideos,
    addDurationVideoFromClipboard,
    deleteDurationVideo,
    clearDurationVideosCache,
    // Duration audio functions
    durationAudiosCache,
    getDurationAudios,
    addDurationAudioFromBuffer,
    deleteDurationAudio,
    clearDurationAudiosCache,
  };
}
