import { useState, useEffect, useCallback } from 'react';
import type { Recording, CreateRecording, UpdateRecording, Image, Video } from '../types';
import { RECORDING_UPDATED_EVENT } from '../utils/events';

export function useRecordings(topicId: number | null) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRecordings = useCallback(async () => {
    if (topicId === null) {
      setRecordings([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await window.electronAPI.recordings.getByTopic(topicId);
      setRecordings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch recordings');
      console.error('Failed to fetch recordings:', err);
    } finally {
      setLoading(false);
    }
  }, [topicId]);

  useEffect(() => {
    fetchRecordings();
  }, [fetchRecordings]);

  // Listen for recording updates from other components
  useEffect(() => {
    const handleRecordingUpdated = async (event: Event) => {
      const customEvent = event as CustomEvent<{ id: number }>;
      const updatedId = customEvent.detail.id;

      // Fetch the updated recording and merge into local state
      const updated = await window.electronAPI.recordings.getById(updatedId);
      if (updated) {
        setRecordings(prev => prev.map(r => r.id === updatedId ? updated : r));
      }
    };

    window.addEventListener(RECORDING_UPDATED_EVENT, handleRecordingUpdated);
    return () => {
      window.removeEventListener(RECORDING_UPDATED_EVENT, handleRecordingUpdated);
    };
  }, []);

  const createRecording = async (recording: CreateRecording): Promise<Recording> => {
    const newRecording = await window.electronAPI.recordings.create(recording);
    setRecordings(prev => [newRecording, ...prev]);
    return newRecording;
  };

  const updateRecording = async (id: number, updates: UpdateRecording): Promise<Recording> => {
    const updatedRecording = await window.electronAPI.recordings.update(id, updates);
    setRecordings(prev => prev.map(r => r.id === id ? updatedRecording : r));
    return updatedRecording;
  };

  const deleteRecording = async (id: number): Promise<void> => {
    await window.electronAPI.recordings.delete(id);
    setRecordings(prev => prev.filter(r => r.id !== id));
  };

  const addImageToRecording = async (recordingId: number, filePath: string): Promise<Image> => {
    const image = await window.electronAPI.media.addImage(recordingId, filePath);
    // Refresh the recording to get updated images
    const updated = await window.electronAPI.recordings.getById(recordingId);
    if (updated) {
      setRecordings(prev => prev.map(r => r.id === recordingId ? updated : r));
    }
    return image;
  };

  const addVideoToRecording = async (recordingId: number, filePath: string): Promise<Video> => {
    const video = await window.electronAPI.media.addVideo(recordingId, filePath);
    // Refresh the recording to get updated videos
    const updated = await window.electronAPI.recordings.getById(recordingId);
    if (updated) {
      setRecordings(prev => prev.map(r => r.id === recordingId ? updated : r));
    }
    return video;
  };

  return {
    recordings,
    loading,
    error,
    fetchRecordings,
    createRecording,
    updateRecording,
    deleteRecording,
    addImageToRecording,
    addVideoToRecording,
  };
}

export function useRecording(id: number | null) {
  const [recording, setRecording] = useState<Recording | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRecording = useCallback(async () => {
    if (id === null) {
      setRecording(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await window.electronAPI.recordings.getById(id);
      setRecording(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch recording');
      console.error('Failed to fetch recording:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchRecording();
  }, [fetchRecording]);

  return { recording, loading, error, refetch: fetchRecording, setRecording };
}
