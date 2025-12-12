import { useState, useEffect, useCallback } from 'react';
import type { Audio } from '../types';

export function useAudios(recordingId: number | null) {
  const [audios, setAudios] = useState<Audio[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAudios = useCallback(async () => {
    if (!recordingId) {
      setAudios([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await window.electronAPI.audios.getByRecording(recordingId);
      setAudios(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch audios');
      console.error('Failed to fetch audios:', err);
    } finally {
      setLoading(false);
    }
  }, [recordingId]);

  useEffect(() => {
    fetchAudios();
  }, [fetchAudios]);

  const addAudioFromBuffer = async (audioBuffer: ArrayBuffer, extension: string = 'webm'): Promise<Audio | null> => {
    if (!recordingId) return null;

    try {
      const newAudio = await window.electronAPI.audios.addFromBuffer(
        recordingId,
        audioBuffer,
        extension
      );
      setAudios(prev => [...prev, newAudio]);
      return newAudio;
    } catch (err) {
      console.error('Failed to add audio:', err);
      return null;
    }
  };

  const deleteAudio = async (audioId: number): Promise<void> => {
    try {
      await window.electronAPI.audios.delete(audioId);
      setAudios(prev => prev.filter(a => a.id !== audioId));
    } catch (err) {
      console.error('Failed to delete audio:', err);
    }
  };

  const updateCaption = async (audioId: number, caption: string | null): Promise<Audio | null> => {
    try {
      const updated = await window.electronAPI.audios.updateCaption(audioId, caption);
      setAudios(prev => prev.map(a => a.id === audioId ? updated : a));
      return updated;
    } catch (err) {
      console.error('Failed to update audio caption:', err);
      return null;
    }
  };

  return {
    audios,
    loading,
    error,
    fetchAudios,
    addAudioFromBuffer,
    deleteAudio,
    updateCaption,
  };
}
