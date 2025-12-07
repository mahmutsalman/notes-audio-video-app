import { useState, useEffect, useCallback } from 'react';
import type { Topic, CreateTopic, UpdateTopic } from '../types';

export function useTopics() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTopics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await window.electronAPI.topics.getAll();
      setTopics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch topics');
      console.error('Failed to fetch topics:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

  const createTopic = async (topic: CreateTopic): Promise<Topic> => {
    const newTopic = await window.electronAPI.topics.create(topic);
    setTopics(prev => [newTopic, ...prev]);
    return newTopic;
  };

  const updateTopic = async (id: number, updates: UpdateTopic): Promise<Topic> => {
    const updatedTopic = await window.electronAPI.topics.update(id, updates);
    setTopics(prev => prev.map(t => t.id === id ? updatedTopic : t));
    return updatedTopic;
  };

  const deleteTopic = async (id: number): Promise<void> => {
    await window.electronAPI.topics.delete(id);
    setTopics(prev => prev.filter(t => t.id !== id));
  };

  const getTopicById = async (id: number): Promise<Topic | null> => {
    return window.electronAPI.topics.getById(id);
  };

  return {
    topics,
    loading,
    error,
    fetchTopics,
    createTopic,
    updateTopic,
    deleteTopic,
    getTopicById,
  };
}

export function useTopic(id: number | null) {
  const [topic, setTopic] = useState<Topic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTopic = useCallback(async () => {
    if (id === null) {
      setTopic(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await window.electronAPI.topics.getById(id);
      setTopic(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch topic');
      console.error('Failed to fetch topic:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTopic();
  }, [fetchTopic]);

  return { topic, loading, error, refetch: fetchTopic };
}
