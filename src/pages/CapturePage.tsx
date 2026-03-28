import { useState, useEffect, useMemo } from 'react';
import CaptureInput from '../components/capture/CaptureInput';
import CaptureItem from '../components/capture/CaptureItem';
import TagSearchSection from '../components/capture/TagSearchSection';
import type { QuickCapture } from '../types';

export default function CapturePage() {
  const [captures, setCaptures] = useState<QuickCapture[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const load = async () => {
    await window.electronAPI.quickCaptures.cleanup();
    const recent = await window.electronAPI.quickCaptures.getRecent();
    setCaptures(recent);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSaved = (capture: QuickCapture) => {
    setCaptures(prev => {
      const exists = prev.some(c => c.id === capture.id);
      if (exists) return prev.map(c => c.id === capture.id ? capture : c);
      return [capture, ...prev];
    });
  };

  const handleDelete = async (id: number) => {
    await window.electronAPI.quickCaptures.delete(id);
    setCaptures(prev => prev.filter(c => c.id !== id));
    if (activeTag && !filtered.some(c => c.id !== id && c.tags.includes(activeTag))) {
      setActiveTag(null);
    }
  };

  // All unique tags in the current captures
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of captures) c.tags.forEach(t => set.add(t));
    return Array.from(set).sort();
  }, [captures]);

  const filtered = useMemo(() => {
    if (!activeTag) return captures;
    return captures.filter(c => c.tags.includes(activeTag));
  }, [captures, activeTag]);

  // Days left helper (shows how much time before expiry)
  const expiresIn = (dateStr: string) => {
    const iso = dateStr.replace(' ', 'T') + (dateStr.includes('Z') ? '' : 'Z');
    const created = new Date(iso).getTime();
    const expiresAt = created + 7 * 24 * 60 * 60 * 1000;
    const daysLeft = Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000));
    return daysLeft;
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      {/* Page header */}
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Quick Capture</h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
            Paste images or record audio instantly. Items expire after 7 days.
          </p>
        </div>
        {captures.length > 0 && (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {captures.length} item{captures.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Tag search */}
      <TagSearchSection />

      {/* Capture input */}
      <CaptureInput onSaved={handleSaved} />

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTag(null)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              activeTag === null
                ? 'bg-primary-600 border-primary-600 text-white'
                : 'border-gray-200 dark:border-dark-border text-gray-600 dark:text-gray-400 hover:border-primary-400'
            }`}
          >
            All
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => setActiveTag(tag === activeTag ? null : tag)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                activeTag === tag
                  ? 'bg-primary-600 border-primary-600 text-white'
                  : 'border-gray-200 dark:border-dark-border text-gray-600 dark:text-gray-400 hover:border-primary-400'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Timeline */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <p className="text-sm">{activeTag ? `No captures tagged "${activeTag}"` : 'Nothing captured yet'}</p>
          <p className="text-xs mt-1 opacity-60">Paste an image with ⌘V or record a voice note above</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(capture => (
            <CaptureItem
              key={capture.id}
              capture={capture}
              onDelete={handleDelete}
              expiresInDays={expiresIn(capture.created_at)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
