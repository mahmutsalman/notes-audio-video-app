import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStudyDurations } from '../hooks/useStudyDurations';
import ThemedAudioPlayer from '../components/audio/ThemedAudioPlayer';
import type { StudyDuration, DurationImage, DurationAudio } from '../types';
import { DURATION_COLORS } from '../utils/durationColors';
import { getGroupColorConfig } from '../utils/durationGroupColors';

function StudyCard({
  duration,
  images,
  audios,
  onNavigate,
}: {
  duration: StudyDuration;
  images: DurationImage[];
  audios: DurationAudio[];
  onNavigate: (recordingId: number) => void;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const colorConfig = duration.color ? DURATION_COLORS[duration.color] : null;
  const groupColorConfig = getGroupColorConfig(duration.group_color);

  const goNext = useCallback(() => {
    if (lightboxIndex === null || images.length === 0) return;
    setLightboxIndex((lightboxIndex + 1) % images.length);
  }, [lightboxIndex, images.length]);

  const goPrev = useCallback(() => {
    if (lightboxIndex === null || images.length === 0) return;
    setLightboxIndex((lightboxIndex - 1 + images.length) % images.length);
  }, [lightboxIndex, images.length]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'Escape') setLightboxIndex(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightboxIndex, goNext, goPrev]);

  return (
    <div
      className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden"
      style={colorConfig ? { borderLeftWidth: 4, borderLeftColor: colorConfig.borderColor } : undefined}
    >
      {/* Group color top bar */}
      {groupColorConfig && (
        <div className="h-1.5" style={{ backgroundColor: groupColorConfig.color }} />
      )}

      {/* Context header */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <button
          onClick={() => onNavigate(duration.recording_id)}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate"
        >
          <span className="font-medium">{duration.topic_name}</span>
          <span className="mx-1.5 text-gray-400 dark:text-gray-500">&rsaquo;</span>
          <span>{duration.recording_name || 'Untitled'}</span>
        </button>
        <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-2 flex-shrink-0">
          {duration.recording_type}
        </span>
      </div>

      <div className="px-4 pb-4 space-y-3">
        {/* Note */}
        {duration.note && (
          <div
            className="notes-content text-sm text-gray-700 dark:text-gray-300"
            dangerouslySetInnerHTML={{ __html: duration.note }}
          />
        )}

        {/* Images */}
        {images.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.map((img, idx) => (
              <img
                key={img.id}
                src={window.electronAPI.paths.getFileUrl(img.thumbnail_path || img.file_path)}
                alt={img.caption || ''}
                className="h-20 rounded-lg object-cover cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
                onClick={() => setLightboxIndex(idx)}
              />
            ))}
          </div>
        )}

        {/* Audio players */}
        {audios.map(audio => (
          <ThemedAudioPlayer
            key={audio.id}
            src={window.electronAPI.paths.getFileUrl(audio.file_path)}
            theme="violet"
          />
        ))}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && images[lightboxIndex] && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
          onClick={() => setLightboxIndex(null)}
        >
          {/* Prev button */}
          {images.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); goPrev(); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          <div className="flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={window.electronAPI.paths.getFileUrl(images[lightboxIndex].file_path)}
              alt={images[lightboxIndex].caption || ''}
              className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg"
            />
            {images[lightboxIndex].caption && (
              <p className="mt-2 text-white/80 text-sm max-w-[80vw] text-center">
                {images[lightboxIndex].caption}
              </p>
            )}
          </div>

          {/* Next button */}
          {images.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); goNext(); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}

          {/* Counter */}
          {images.length > 1 && (
            <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">
              {lightboxIndex + 1} / {images.length}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function StudyPage() {
  const navigate = useNavigate();
  const {
    durations,
    loading,
    error,
    refetch,
    durationImagesCache,
    getDurationImages,
    durationAudiosCache,
    getDurationAudios,
  } = useStudyDurations();

  // Load media for all durations on mount
  useEffect(() => {
    durations.forEach(d => {
      getDurationImages(d.id);
      getDurationAudios(d.id);
    });
  }, [durations, getDurationImages, getDurationAudios]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-rose-600 dark:text-rose-400">
        {error}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Study View
          <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
            {durations.length} marks with audio
          </span>
        </h1>
        <button
          onClick={refetch}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
          title="Refresh"
        >
          <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {durations.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          No marks with audio recordings found.
        </div>
      ) : (
        <div className="space-y-4">
          {durations.map(duration => (
            <StudyCard
              key={duration.id}
              duration={duration}
              images={durationImagesCache[duration.id] || []}
              audios={durationAudiosCache[duration.id] || []}
              onNavigate={(recordingId) => navigate(`/recording/${recordingId}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
