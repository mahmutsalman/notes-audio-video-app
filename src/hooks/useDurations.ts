import { useState, useEffect, useCallback } from 'react';
import type { Duration, CreateDuration, UpdateDuration, DurationImage, DurationVideo, DurationAudio, DurationCodeSnippet, CreateDurationCodeSnippet, UpdateDurationCodeSnippet } from '../types';

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
  // Cache of duration code snippets, keyed by duration ID
  const [durationCodeSnippetsCache, setDurationCodeSnippetsCache] = useState<Record<number, DurationCodeSnippet[]>>({});

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
    setDurationCodeSnippetsCache(prev => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
  };

  // Fetch images for a specific duration
  const getDurationImages = useCallback(async (durationId: number, force?: boolean): Promise<DurationImage[]> => {
    // Check cache using functional update to avoid stale closure
    let cached: DurationImage[] | undefined;
    setDurationImagesCache(prev => {
      cached = prev[durationId];
      return prev; // No update needed
    });

    // Return cached if available AND not forcing refresh
    if (!force && cached) {
      return cached;
    }

    console.log(`[useDurations] Fetching images for duration ${durationId}`);
    const images = await window.electronAPI.durationImages.getByDuration(durationId);
    console.log(`[useDurations] Fetched ${images.length} images for duration ${durationId}:`, images);
    setDurationImagesCache(prev => ({ ...prev, [durationId]: images }));
    return images;
  }, []); // Remove durationImagesCache from dependencies

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
    // Check cache using functional update to avoid stale closure
    let cached: DurationVideo[] | undefined;
    setDurationVideosCache(prev => {
      cached = prev[durationId];
      return prev; // No update needed
    });

    // Return cached if available AND not forcing refresh
    if (!force && cached) {
      return cached;
    }

    console.log(`[useDurations] Fetching videos for duration ${durationId}`);
    const videos = await window.electronAPI.durationVideos.getByDuration(durationId);
    console.log(`[useDurations] Fetched ${videos.length} videos for duration ${durationId}`);
    setDurationVideosCache(prev => ({ ...prev, [durationId]: videos }));
    return videos;
  }, []); // Remove durationVideosCache from dependencies

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
    // Check cache using functional update to avoid stale closure
    let cached: DurationAudio[] | undefined;
    setDurationAudiosCache(prev => {
      cached = prev[durationId];
      return prev; // No update needed
    });

    // Return cached if available AND not forcing refresh
    if (!force && cached) {
      return cached;
    }

    console.log(`[useDurations] Fetching audios for duration ${durationId}`);
    const audios = await window.electronAPI.durationAudios.getByDuration(durationId);
    console.log(`[useDurations] Fetched ${audios.length} audios for duration ${durationId}`);
    setDurationAudiosCache(prev => ({ ...prev, [durationId]: audios }));
    return audios;
  }, []); // Remove durationAudiosCache from dependencies

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

  // Fetch code snippets for a specific duration
  const getDurationCodeSnippets = useCallback(async (durationId: number, force?: boolean): Promise<DurationCodeSnippet[]> => {
    // Check cache using functional update to avoid stale closure
    let cached: DurationCodeSnippet[] | undefined;
    setDurationCodeSnippetsCache(prev => {
      cached = prev[durationId];
      return prev; // No update needed
    });

    // Return cached if available AND not forcing refresh
    if (!force && cached) {
      return cached;
    }

    console.log(`[useDurations] Fetching code snippets for duration ${durationId}`);
    const snippets = await window.electronAPI.durationCodeSnippets.getByDuration(durationId);
    console.log(`[useDurations] Fetched ${snippets.length} code snippets for duration ${durationId}`);
    setDurationCodeSnippetsCache(prev => ({ ...prev, [durationId]: snippets }));
    return snippets;
  }, []); // Remove durationCodeSnippetsCache from dependencies

  // Add code snippet to a duration
  const addDurationCodeSnippet = async (durationId: number, data: Omit<CreateDurationCodeSnippet, 'duration_id' | 'sort_order'>): Promise<DurationCodeSnippet> => {
    // Get current snippets count for sort_order using functional update
    let currentCount = 0;
    setDurationCodeSnippetsCache(prev => {
      currentCount = (prev[durationId] || []).length;
      return prev; // No update needed
    });

    const newSnippet = await window.electronAPI.durationCodeSnippets.create({
      duration_id: durationId,
      title: data.title,
      language: data.language,
      code: data.code,
      caption: data.caption,
      sort_order: currentCount,
    });

    // Update cache
    setDurationCodeSnippetsCache(prev => ({
      ...prev,
      [durationId]: [...(prev[durationId] || []), newSnippet]
    }));

    return newSnippet;
  };

  // Update code snippet
  const updateDurationCodeSnippet = async (snippetId: number, durationId: number, updates: UpdateDurationCodeSnippet): Promise<DurationCodeSnippet> => {
    const updatedSnippet = await window.electronAPI.durationCodeSnippets.update(snippetId, updates);

    // Update cache
    setDurationCodeSnippetsCache(prev => ({
      ...prev,
      [durationId]: (prev[durationId] || []).map(snippet => snippet.id === snippetId ? updatedSnippet : snippet)
    }));

    return updatedSnippet;
  };

  // Delete code snippet
  const deleteDurationCodeSnippet = async (snippetId: number, durationId: number): Promise<void> => {
    await window.electronAPI.durationCodeSnippets.delete(snippetId);

    // Update cache
    setDurationCodeSnippetsCache(prev => ({
      ...prev,
      [durationId]: (prev[durationId] || []).filter(snippet => snippet.id !== snippetId)
    }));
  };

  const clearDurationCodeSnippetsCache = useCallback(() => {
    setDurationCodeSnippetsCache({});
  }, []);

  // Clear cache when recording changes
  useEffect(() => {
    clearDurationImagesCache();
    clearDurationVideosCache();
    clearDurationAudiosCache();
    clearDurationCodeSnippetsCache();
  }, [recordingId, clearDurationImagesCache, clearDurationVideosCache, clearDurationAudiosCache, clearDurationCodeSnippetsCache]);

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
    // Duration code snippet functions
    durationCodeSnippetsCache,
    getDurationCodeSnippets,
    addDurationCodeSnippet,
    updateDurationCodeSnippet,
    deleteDurationCodeSnippet,
    clearDurationCodeSnippetsCache,
  };
}
