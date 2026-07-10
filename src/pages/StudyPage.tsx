import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStudyDurations } from '../hooks/useStudyDurations';
import { useTopics } from '../hooks/useTopics';
import { useAudioRecording, AUDIO_SAVED_EVENT } from '../context/AudioRecordingContext';
import ThemedAudioPlayer from '../components/audio/ThemedAudioPlayer';
import type { StudyDuration, DurationImage, DurationAudio } from '../types';
import { DURATION_COLORS } from '../utils/durationColors';
import { getGroupColorConfig } from '../utils/durationGroupColors';

const STORAGE_KEY = 'study-topic-filter';

function loadSavedTopicIds(): number[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveTopicIds(ids: number[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

function StudyCard({
  duration,
  images,
  audios,
  onNavigate,
  onPasteImage,
  onRecordAudio,
  isRecording,
}: {
  duration: StudyDuration;
  images: DurationImage[];
  audios: DurationAudio[];
  onNavigate: (recordingId: number) => void;
  onPasteImage: (durationId: number) => void;
  onRecordAudio: (duration: StudyDuration) => void;
  isRecording: boolean;
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

        {/* Upload buttons */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => onPasteImage(duration.id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Paste Image
          </button>
          <button
            onClick={() => onRecordAudio(duration)}
            disabled={isRecording}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors ${isRecording ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            Record Audio
          </button>
        </div>
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
  const { topics } = useTopics();
  const [selectedTopicIds, setSelectedTopicIds] = useState<number[]>(() => loadSavedTopicIds());
  const [filterOpen, setFilterOpen] = useState(true);

  const [shuffled, setShuffled] = useState(false);
  const [shuffleSeed, setShuffleSeed] = useState(0);

  const audioRecording = useAudioRecording();

  const {
    durations,
    loading,
    error,
    refetch,
    durationImagesCache,
    getDurationImages,
    durationAudiosCache,
    getDurationAudios,
    addDurationImageFromClipboard,
    refreshDurationAudios,
  } = useStudyDurations(selectedTopicIds);

  // Persist selection
  useEffect(() => {
    saveTopicIds(selectedTopicIds);
  }, [selectedTopicIds]);

  // Load media for all durations on mount
  useEffect(() => {
    durations.forEach(d => {
      getDurationImages(d.id);
      getDurationAudios(d.id);
    });
  }, [durations, getDurationImages, getDurationAudios]);

  const displayDurations = useMemo(() => {
    if (!shuffled) return durations;
    const result = [...durations];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durations, shuffled, shuffleSeed]);

  // Refresh audio cache when a recording is saved
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.target?.type === 'duration' && detail.target.durationId) {
        refreshDurationAudios(detail.target.durationId);
      }
    };
    window.addEventListener(AUDIO_SAVED_EVENT, handler);
    return () => window.removeEventListener(AUDIO_SAVED_EVENT, handler);
  }, [refreshDurationAudios]);

  const handlePasteImage = useCallback(async (durationId: number) => {
    const image = await addDurationImageFromClipboard(durationId);
    if (!image) {
      alert('No image found in clipboard. Copy an image first, then click Paste.');
    }
  }, [addDurationImageFromClipboard]);

  const handleRecordAudio = useCallback((dur: StudyDuration) => {
    const label = dur.note
      ? dur.note.replace(/<[^>]+>/g, '').slice(0, 40)
      : `Mark ${dur.id}`;
    audioRecording.startRecording({
      type: 'duration',
      durationId: dur.id,
      recordingId: dur.recording_id,
      label,
    });
  }, [audioRecording]);

  const allSelected = topics.length > 0 && selectedTopicIds.length === topics.length;

  const toggleTopic = (id: number) => {
    if (selectedTopicIds.includes(id)) {
      setSelectedTopicIds(selectedTopicIds.filter(x => x !== id));
    } else {
      setSelectedTopicIds([...selectedTopicIds, id]);
    }
  };

  const selectAll = () => setSelectedTopicIds(topics.map(t => t.id));
  const selectNone = () => setSelectedTopicIds([]);

  const isTopicSelected = (id: number) => selectedTopicIds.includes(id);

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
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Study View
          <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
            {durations.length} marks{shuffled ? ' (shuffled)' : ''}
          </span>
        </h1>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              if (!shuffled) setShuffleSeed(s => s + 1);
              setShuffled(!shuffled);
            }}
            className={`p-2 rounded-lg transition-colors ${shuffled ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : 'hover:bg-gray-100 dark:hover:bg-dark-hover text-gray-600 dark:text-gray-400'}`}
            title={shuffled ? 'Restore original order' : 'Shuffle marks'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h4l3 8-3 8H4m16-16h-4l-3 8 3 8h4M4 12h16" />
            </svg>
          </button>
          <button
            onClick={() => setFilterOpen(!filterOpen)}
            className={`p-2 rounded-lg transition-colors ${filterOpen || selectedTopicIds.length > 0 ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'hover:bg-gray-100 dark:hover:bg-dark-hover text-gray-600 dark:text-gray-400'}`}
            title="Filter by topic"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
          </button>
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
      </div>

      {/* Topic filter bar */}
      {filterOpen && topics.length > 0 && (
        <div className="mb-4 p-3 bg-gray-50 dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border">
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={selectAll}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${allSelected ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
            >
              All
            </button>
            <button
              onClick={selectNone}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${selectedTopicIds.length === 0 ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
            >
              None
            </button>
            <span className="w-px h-5 bg-gray-300 dark:bg-gray-600 self-center mx-0.5" />
            {topics.map(topic => (
              <button
                key={topic.id}
                onClick={() => toggleTopic(topic.id)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${isTopicSelected(topic.id) ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-300 dark:ring-indigo-700' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
              >
                {topic.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {displayDurations.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          {selectedTopicIds.length === 0
            ? 'Select topics above to start studying.'
            : 'No marks with audio recordings found for selected topics.'}
        </div>
      ) : (
        <div className="space-y-4">
          {displayDurations.map(duration => (
            <StudyCard
              key={duration.id}
              duration={duration}
              images={durationImagesCache[duration.id] || []}
              audios={durationAudiosCache[duration.id] || []}
              onNavigate={(recordingId) => navigate(`/recording/${recordingId}`)}
              onPasteImage={handlePasteImage}
              onRecordAudio={handleRecordAudio}
              isRecording={audioRecording.isRecording}
            />
          ))}
        </div>
      )}
    </div>
  );
}
