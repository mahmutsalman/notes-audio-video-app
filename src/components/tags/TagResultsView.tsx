import { useState, useEffect, useCallback } from 'react';
import { useImageAudioPlayer } from '../../context/ImageAudioPlayerContext';
import { useDurationAudioPlayer } from '../../context/DurationAudioPlayerContext';
import { useRecordingAudioPlayer } from '../../context/RecordingAudioPlayerContext';
import { useAudioRecording, AUDIO_SAVED_EVENT } from '../../context/AudioRecordingContext';
import ImageLightbox from '../common/ImageLightbox';
import SortableImageGrid from '../common/SortableImageGrid';
import type { TaggedItems, AnyImageAudio } from '../../types';

function fmtDuration(secs: number | null): string {
  if (!secs) return '';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return ` (${m}:${s.toString().padStart(2, '0')})`;
}

type TagRow = {
  id: number;
  file_path: string;
  thumbnail_path?: string | null;
  caption: string | null;
  recording_id: number;
  recording_name: string | null;
  topic_name: string;
  duration_id?: number; // present for duration_images
  extra?: string;
};

function dedupeById<T extends { id: number }>(items: T[]): T[] {
  const seen = new Set<number>();
  return items.filter(item => { if (seen.has(item.id)) return false; seen.add(item.id); return true; });
}

export function TagResultsView({ tagNames, onNavigate }: { tagNames: string[]; onNavigate: (recordingId: number) => void }) {
  const [items, setItems] = useState<TaggedItems | null>(null);
  const [loading, setLoading] = useState(true);

  // Image lightbox
  const [lightboxRows, setLightboxRows] = useState<TagRow[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxIsRecordingLevel, setLightboxIsRecordingLevel] = useState(false);
  const [imageAudiosMap, setImageAudiosMap] = useState<Record<number, AnyImageAudio[]>>({});

  // Caption modal
  const [captionModal, setCaptionModal] = useState(false);
  const [captionText, setCaptionText] = useState('');

  const imageAudioPlayer = useImageAudioPlayer();
  const durationAudioPlayer = useDurationAudioPlayer();
  const recordingAudioPlayer = useRecordingAudioPlayer();
  const audioRecording = useAudioRecording();

  useEffect(() => {
    setLoading(true);
    Promise.all(tagNames.map(t => window.electronAPI.tags.getItemsByTag(t))).then((results) => {
      setItems({
        images:          dedupeById(results.flatMap(r => r.images)),
        duration_images: dedupeById(results.flatMap(r => r.duration_images)),
        audios:          dedupeById(results.flatMap(r => r.audios)),
        duration_audios: dedupeById(results.flatMap(r => r.duration_audios)),
      });
      setLoading(false);
    });
  }, [tagNames.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchImageAudios = useCallback(async (rows: TagRow[], isRecordingLevel: boolean) => {
    const map: Record<number, AnyImageAudio[]> = {};
    await Promise.all(rows.map(async (row) => {
      map[row.id] = isRecordingLevel
        ? await window.electronAPI.imageAudios.getByImage(row.id)
        : await window.electronAPI.durationImageAudios.getByDurationImage(row.id);
    }));
    setImageAudiosMap(map);
  }, []);

  const openImageLightbox = async (rows: TagRow[], index: number, isRecordingLevel: boolean) => {
    setLightboxRows(rows);
    setLightboxIndex(index);
    setLightboxIsRecordingLevel(isRecordingLevel);
    await fetchImageAudios(rows, isRecordingLevel);
  };

  // Refresh audios after recording
  useEffect(() => {
    if (!lightboxRows) return;
    const refresh = () => fetchImageAudios(lightboxRows, lightboxIsRecordingLevel);
    window.addEventListener(AUDIO_SAVED_EVENT, refresh);
    return () => window.removeEventListener(AUDIO_SAVED_EVENT, refresh);
  }, [lightboxRows, lightboxIsRecordingLevel, fetchImageAudios]);

  const currentRow = lightboxRows ? lightboxRows[lightboxIndex] : null;

  const handlePlayImageAudio = async (audio: AnyImageAudio, label: string) => {
    const contextType = lightboxIsRecordingLevel ? 'recording_image' : 'duration_image';
    const markers = await window.electronAPI.audioMarkers.getByAudio(audio.id, contextType);
    imageAudioPlayer.play(
      audio,
      label,
      markers,
      (id, cap) => lightboxIsRecordingLevel
        ? window.electronAPI.imageAudios.updateCaption(id, cap)
        : window.electronAPI.durationImageAudios.updateCaption(id, cap),
    );
  };

  const handleRecordForImage = useCallback((imageId: number) => {
    if (!currentRow) return;
    const label = currentRow.caption || currentRow.recording_name || 'Image';
    if (lightboxIsRecordingLevel) {
      audioRecording.startRecording({
        type: 'recording_image',
        imageId,
        recordingId: currentRow.recording_id,
        label,
      });
    } else {
      audioRecording.startRecording({
        type: 'duration_image',
        durationImageId: imageId,
        durationId: currentRow.duration_id!,
        recordingId: currentRow.recording_id,
        label,
      });
    }
  }, [currentRow, lightboxIsRecordingLevel, audioRecording]);

  const handleDeleteImageAudio = useCallback(async (audioId: number, imageId: number) => {
    if (lightboxIsRecordingLevel) {
      await window.electronAPI.imageAudios.delete(audioId);
    } else {
      await window.electronAPI.durationImageAudios.delete(audioId);
    }
    setImageAudiosMap(prev => ({
      ...prev,
      [imageId]: (prev[imageId] ?? []).filter(a => a.id !== audioId),
    }));
  }, [lightboxIsRecordingLevel]);

  const handleUpdateImageAudioCaption = useCallback(async (audioId: number, imageId: number, cap: string | null) => {
    if (lightboxIsRecordingLevel) {
      await window.electronAPI.imageAudios.updateCaption(audioId, cap);
    } else {
      await window.electronAPI.durationImageAudios.updateCaption(audioId, cap);
    }
    setImageAudiosMap(prev => ({
      ...prev,
      [imageId]: (prev[imageId] ?? []).map(a => a.id === audioId ? { ...a, caption: cap } : a),
    }));
  }, [lightboxIsRecordingLevel]);

  const handleEditCaption = useCallback(() => {
    if (!currentRow) return;
    setCaptionText(currentRow.caption ?? '');
    setCaptionModal(true);
  }, [currentRow]);

  const handleSaveCaption = useCallback(async () => {
    if (!currentRow) return;
    const cap = captionText.trim() || null;
    try {
      if (lightboxIsRecordingLevel) {
        await window.electronAPI.media.updateImageCaption(currentRow.id, cap);
      } else {
        await window.electronAPI.durationImages.updateCaption(currentRow.id, cap);
      }
      setLightboxRows(rows => rows
        ? rows.map((r, i) => i === lightboxIndex ? { ...r, caption: cap } : r)
        : rows
      );
    } finally {
      setCaptionModal(false);
    }
  }, [currentRow, captionText, lightboxIsRecordingLevel, lightboxIndex]);

  const handleDeleteImage = useCallback(async () => {
    if (!currentRow || !lightboxRows) return;
    if (!window.confirm('Delete this image?')) return;
    if (lightboxIsRecordingLevel) {
      await window.electronAPI.media.deleteImage(currentRow.id);
    } else {
      await window.electronAPI.durationImages.delete(currentRow.id);
    }
    const remaining = lightboxRows.filter((_, i) => i !== lightboxIndex);
    if (remaining.length === 0) {
      setLightboxRows(null);
      setImageAudiosMap({});
      // Also remove from items state
      setItems(prev => {
        if (!prev) return prev;
        return lightboxIsRecordingLevel
          ? { ...prev, images: prev.images.filter(img => img.id !== currentRow.id) }
          : { ...prev, duration_images: prev.duration_images.filter(img => img.id !== currentRow.id) };
      });
    } else {
      setLightboxRows(remaining);
      setLightboxIndex(Math.min(lightboxIndex, remaining.length - 1));
      setItems(prev => {
        if (!prev) return prev;
        return lightboxIsRecordingLevel
          ? { ...prev, images: prev.images.filter(img => img.id !== currentRow.id) }
          : { ...prev, duration_images: prev.duration_images.filter(img => img.id !== currentRow.id) };
      });
    }
  }, [currentRow, lightboxRows, lightboxIndex, lightboxIsRecordingLevel]);

  if (loading) return <p className="text-sm text-gray-400 py-4">Loading…</p>;
  if (!items) return null;

  const total = items.images.length + items.duration_images.length + items.audios.length + items.duration_audios.length;

  if (total === 0) {
    return <p className="text-sm text-gray-400 dark:text-gray-500 py-4">No items tagged with {tagNames.map((t, i) => <span key={t}>{i > 0 && ' or '}<span className="font-mono text-blue-500">#{t}</span></span>)}</p>;
  }

  const imageSections: { label: string; isRecordingLevel: boolean; rows: TagRow[] }[] = [];
  const audioSections: { label: string; icon: string; isRecordingLevel: boolean; rows: TagRow[] }[] = [];

  if (items.images.length > 0) {
    imageSections.push({ label: 'Recording-Level Images', isRecordingLevel: true, rows: items.images.map(i => ({ ...i })) });
  }
  if (items.duration_images.length > 0) {
    imageSections.push({ label: 'Mark-Level Images', isRecordingLevel: false, rows: items.duration_images.map(i => ({ ...i })) });
  }
  if (items.audios.length > 0) {
    audioSections.push({ label: 'Recording-Level Audios', icon: '🔊', isRecordingLevel: true, rows: items.audios.map(a => ({ ...a, thumbnail_path: null, extra: fmtDuration(a.duration) })) });
  }
  if (items.duration_audios.length > 0) {
    audioSections.push({ label: 'Mark-Level Audios', icon: '🔊', isRecordingLevel: false, rows: items.duration_audios.map(a => ({ ...a, thumbnail_path: null, extra: fmtDuration(a.duration) })) });
  }

  return (
    <div>
      {lightboxRows && (
        <ImageLightbox
          images={lightboxRows.map(r => ({ file_path: r.file_path, caption: r.caption, id: r.id }))}
          selectedIndex={lightboxIndex}
          onClose={() => { setLightboxRows(null); setImageAudiosMap({}); }}
          onNavigate={setLightboxIndex}
          imageAudiosMap={imageAudiosMap}
          onPlayImageAudio={handlePlayImageAudio}
          onRecordForImage={handleRecordForImage}
          onDeleteImageAudio={handleDeleteImageAudio}
          onUpdateImageAudioCaption={handleUpdateImageAudioCaption}
          onEditCaption={handleEditCaption}
          onDelete={handleDeleteImage}
          mediaType={lightboxIsRecordingLevel ? 'image' : 'duration_image'}
        />
      )}

      {/* Caption modal */}
      {captionModal && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50"
          onClick={() => setCaptionModal(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-[360px] max-w-[90vw] p-5"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">✏️ Caption</p>
            <input
              type="text"
              autoFocus
              value={captionText}
              onChange={e => setCaptionText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveCaption(); if (e.key === 'Escape') setCaptionModal(false); }}
              placeholder="Add a caption…"
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 outline-none focus:border-blue-400 dark:focus:border-blue-500"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setCaptionModal(false)}
                className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-dark-hover rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCaption}
                className="px-3 py-1.5 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {total} item{total !== 1 ? 's' : ''} tagged{' '}
        {tagNames.map((t, i) => (
          <span key={t}>{i > 0 && <span className="text-gray-400 mx-1">or</span>}<span className="font-mono text-blue-500">#{t}</span></span>
        ))}
      </p>

      {/* Image sections — square grid */}
      {imageSections.map(({ label, isRecordingLevel, rows }) => (
        <div key={label} className="mb-6">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <span>🖼️</span>{label} <span className="font-normal normal-case text-gray-400">({rows.length})</span>
          </h3>
          <SortableImageGrid
            images={rows.map(r => ({
              id: r.id,
              file_path: r.file_path,
              thumbnail_path: r.thumbnail_path ?? null,
              caption: r.caption,
              color: null,
              group_color: null,
            }))}
            gridClassName="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2"
            readOnly
            showNumberBadge={false}
            colorKeyPrefix="tagResult"
            captionColorClass="text-gray-600 dark:text-gray-400"
            colorOverrides={{}}
            groupColorOverrides={{}}
            onImageClick={(index) => openImageLightbox(rows, index, isRecordingLevel)}
            onDelete={() => {}}
            onReorder={() => {}}
          />
          {/* Navigate buttons below grid */}
          <div className="mt-2 flex flex-wrap gap-1">
            {rows.map((row) => (
              <button
                key={row.id}
                onClick={() => onNavigate(row.recording_id)}
                className="text-[10px] text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors truncate max-w-[160px]"
                title={`${row.topic_name} › ${row.recording_name || 'Recording'}`}
              >
                {row.recording_name || 'Recording'}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Audio sections — list */}
      {audioSections.map(({ label, icon, isRecordingLevel, rows }) => (
        <div key={label} className="mb-6">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <span>{icon}</span>{label} <span className="font-normal normal-case text-gray-400">({rows.length})</span>
          </h3>
          <div className="space-y-2">
            {rows.map((row) => (
              <div
                key={row.id}
                className="group rounded-lg border border-gray-100 dark:border-dark-border bg-white dark:bg-dark-surface overflow-hidden"
              >
                <div
                  className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-dark-hover cursor-pointer transition-colors"
                  onClick={async () => {
                    const contextType = isRecordingLevel ? 'recording' : 'duration';
                    const player = isRecordingLevel ? recordingAudioPlayer : durationAudioPlayer;
                    const markers = await window.electronAPI.audioMarkers.getByAudio(row.id, contextType);
                    const audioLabel = row.caption || `${row.recording_name || 'Recording'} — Audio`;
                    player.play({ id: row.id, file_path: row.file_path, duration: null, caption: row.caption, created_at: '' } as any, audioLabel, markers);
                  }}
                >
                  <div className="w-10 h-10 rounded flex-shrink-0 bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-lg">
                    {icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-700 dark:text-gray-300 truncate">
                      {row.caption || <span className="italic text-gray-400">no caption</span>}
                      {row.extra && <span className="text-gray-400 ml-1">{row.extra}</span>}
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                      {row.topic_name} › {row.recording_name || 'Recording'}
                    </p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); onNavigate(row.recording_id); }}
                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity self-center p-1.5 rounded hover:bg-gray-200 dark:hover:bg-dark-border text-gray-500 dark:text-gray-400"
                    title="Open recording"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
