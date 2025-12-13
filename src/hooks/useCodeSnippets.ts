import { useState, useEffect, useCallback } from 'react';
import type { CodeSnippet, CreateCodeSnippet, UpdateCodeSnippet } from '../types';

export function useCodeSnippets(recordingId: number | null) {
  const [codeSnippets, setCodeSnippets] = useState<CodeSnippet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCodeSnippets = useCallback(async () => {
    if (recordingId === null) {
      setCodeSnippets([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await window.electronAPI.codeSnippets.getByRecording(recordingId);
      setCodeSnippets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch code snippets');
      console.error('Failed to fetch code snippets:', err);
    } finally {
      setLoading(false);
    }
  }, [recordingId]);

  useEffect(() => {
    fetchCodeSnippets();
  }, [fetchCodeSnippets]);

  const addCodeSnippet = async (data: Omit<CreateCodeSnippet, 'recording_id' | 'sort_order'>): Promise<CodeSnippet> => {
    if (recordingId === null) {
      throw new Error('No recording selected');
    }

    const newSnippet = await window.electronAPI.codeSnippets.create({
      recording_id: recordingId,
      title: data.title,
      language: data.language,
      code: data.code,
      caption: data.caption,
      sort_order: codeSnippets.length,
    });

    setCodeSnippets(prev => [...prev, newSnippet]);
    return newSnippet;
  };

  const updateCodeSnippet = async (id: number, updates: UpdateCodeSnippet): Promise<CodeSnippet> => {
    const updatedSnippet = await window.electronAPI.codeSnippets.update(id, updates);
    setCodeSnippets(prev => prev.map(snippet => snippet.id === id ? updatedSnippet : snippet));
    return updatedSnippet;
  };

  const deleteCodeSnippet = async (id: number): Promise<void> => {
    await window.electronAPI.codeSnippets.delete(id);
    setCodeSnippets(prev => prev.filter(snippet => snippet.id !== id));
  };

  return {
    codeSnippets,
    loading,
    error,
    fetchCodeSnippets,
    addCodeSnippet,
    updateCodeSnippet,
    deleteCodeSnippet,
  };
}
