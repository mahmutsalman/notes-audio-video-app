import { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useGlobalSearch } from '../hooks/useGlobalSearch';
import { useTabTitle } from '../hooks/useTabTitle';
import ThemedAudioPlayer from '../components/audio/ThemedAudioPlayer';
import type {
  GlobalSearchResult,
  SearchNavState,
  DurationImage,
  DurationAudio,
  Audio,
  Duration,
  Recording,
} from '../types';

// ─── Section config ───────────────────────────────────────────────────────────
const SECTION_ORDER: Array<{
  key: keyof ReturnType<typeof useGlobalSearch>['grouped'];
  label: string;
  icon: string;
}> = [
  { key: 'duration_image',       label: 'Mark-Level Images',    icon: '🖼️' },
  { key: 'image',                label: 'Recording-Level Images', icon: '🖼️' },
  { key: 'duration_audio',       label: 'Mark-Level Audios',    icon: '🔊' },
  { key: 'audio',                label: 'Recording-Level Audios', icon: '🔊' },
  { key: 'duration',             label: 'Mark Notes',           icon: '🔖' },
  { key: 'recording',            label: 'Recording Notes',      icon: '🎙️' },
  { key: 'topic',                label: 'Topics',               icon: '📁' },
  { key: 'duration_video',       label: 'Mark Videos',          icon: '🎬' },
  { key: 'video',                label: 'Recording Videos',     icon: '🎬' },
  { key: 'duration_code_snippet',label: 'Mark Code',            icon: '💻' },
  { key: 'code_snippet',         label: 'Recording Code',       icon: '💻' },
  { key: 'audio_marker',        label: 'Audio Markers',         icon: '📌' },
  { key: 'duration_image_audio', label: 'Image Audios (Mark)',  icon: '🔊' },
  { key: 'image_audio',          label: 'Image Audios',         icon: '🔊' },
];

const MARKER_COLORS: Record<string, string> = {
  important: 'bg-rose-500 text-white',
  question: 'bg-amber-500 text-white',
  similar_question: 'bg-sky-500 text-white',
};

const MARKER_LABELS: Record<string, string> = {
  important: 'Important',
  question: 'Question',
  similar_question: 'Similar Q',
};

// ─── Preview helpers ──────────────────────────────────────────────────────────

type PreviewKind =
  | 'duration_image'
  | 'duration_audio'
  | 'audio'
  | 'duration_note'
  | 'recording_note';

type PreviewData =
  | { kind: 'duration_image'; images: DurationImage[] }
  | { kind: 'duration_audio'; audios: DurationAudio[] }
  | { kind: 'audio'; audios: Audio[] }
  | { kind: 'duration_note'; html: string }
  | { kind: 'recording_note'; html: string };

function getPreviewKind(result: GlobalSearchResult): PreviewKind | null {
  switch (result.content_type) {
    case 'duration_image':
      return result.duration_id !== null ? 'duration_image' : null;
    case 'duration_audio':
      return result.duration_id !== null ? 'duration_audio' : null;
    case 'audio':
      return result.recording_id !== null ? 'audio' : null;
    case 'duration':
      return result.duration_id !== null ? 'duration_note' : null;
    case 'recording':
      return result.recording_id !== null ? 'recording_note' : null;
    default:
      return null;
  }
}

async function fetchPreviewData(
  result: GlobalSearchResult,
  kind: PreviewKind,
): Promise<PreviewData> {
  switch (kind) {
    case 'duration_image': {
      const all = await window.electronAPI.durationImages.getByDuration(result.duration_id!);
      const images = all.filter(img => img.id === result.source_id);
      return { kind: 'duration_image', images };
    }
    case 'duration_audio': {
      const all = await window.electronAPI.durationAudios.getByDuration(result.duration_id!);
      const audios = all.filter(a => a.id === result.source_id);
      return { kind: 'duration_audio', audios };
    }
    case 'audio': {
      const all = await window.electronAPI.audios.getByRecording(result.recording_id!);
      const audios = all.filter(a => a.id === result.source_id);
      return { kind: 'audio', audios };
    }
    case 'duration_note': {
      const durations = await window.electronAPI.durations.getByRecording(result.recording_id!) as Duration[];
      const duration = durations.find(d => d.id === result.duration_id);
      return { kind: 'duration_note', html: duration?.note ?? '' };
    }
    case 'recording_note': {
      const recording = await window.electronAPI.recordings.getById(result.recording_id!) as Recording;
      return { kind: 'recording_note', html: recording.notes_content ?? '' };
    }
  }
}

function formatAudioDuration(seconds: number | null): string {
  if (seconds === null) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Expanded preview sub-component ──────────────────────────────────────────

interface ExpandedPreviewProps {
  data: PreviewData | null;
  loading: boolean;
  error: boolean;
}

function ExpandedPreview({ data, loading, error }: ExpandedPreviewProps) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [noteExpanded, setNoteExpanded] = useState(false);
  const noteRef = useRef<HTMLDivElement>(null);
  const [noteOverflows, setNoteOverflows] = useState(false);

  useEffect(() => {
    if (noteRef.current) {
      setNoteOverflows(noteRef.current.scrollHeight > noteRef.current.clientHeight + 4);
    }
  }, [data]);

  const panelBase =
    'border-t border-gray-100 dark:border-dark-border bg-gray-50 dark:bg-dark-surface px-3 py-3';

  if (loading) {
    return (
      <div className={`${panelBase} flex justify-center`}>
        <svg className="w-5 h-5 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (error || data === null) {
    return (
      <div className={panelBase}>
        <p className="text-xs text-gray-400 dark:text-gray-500">Failed to load preview</p>
      </div>
    );
  }

  if (data.kind === 'duration_image') {
    if (data.images.length === 0) {
      return (
        <div className={panelBase}>
          <p className="text-xs text-gray-400 dark:text-gray-500">No images</p>
        </div>
      );
    }
    return (
      <div className={panelBase}>
        {lightboxSrc && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
            onClick={() => setLightboxSrc(null)}
          >
            <img
              src={lightboxSrc}
              className="max-w-[90vw] max-h-[90vh] object-contain rounded shadow-xl"
              onClick={e => e.stopPropagation()}
            />
            <button
              className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl leading-none"
              onClick={() => setLightboxSrc(null)}
            >
              ✕
            </button>
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {data.images.map(img => {
            const thumbSrc = window.electronAPI.paths.getFileUrl(img.thumbnail_path ?? img.file_path);
            const fullSrc = window.electronAPI.paths.getFileUrl(img.file_path);
            return (
              <div key={img.id} className="flex flex-col gap-1">
                <div
                  className="aspect-square rounded overflow-hidden cursor-pointer bg-gray-100 dark:bg-dark-hover"
                  onClick={() => setLightboxSrc(fullSrc)}
                >
                  <img
                    src={thumbSrc}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-150"
                    loading="lazy"
                  />
                </div>
                {img.caption && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{img.caption}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (data.kind === 'duration_audio' || data.kind === 'audio') {
    const audios = data.audios;
    if (audios.length === 0) {
      return (
        <div className={panelBase}>
          <p className="text-xs text-gray-400 dark:text-gray-500">No audio files</p>
        </div>
      );
    }
    return (
      <div className={`${panelBase} space-y-3`}>
        {audios.map(a => (
          <div key={a.id} className="space-y-1">
            {(a.caption || a.duration !== null) && (
              <div className="flex items-center gap-2">
                {a.caption && (
                  <span className="text-xs text-gray-600 dark:text-gray-300 truncate">{a.caption}</span>
                )}
                {a.duration !== null && (
                  <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                    {formatAudioDuration(a.duration)}
                  </span>
                )}
              </div>
            )}
            <ThemedAudioPlayer
              src={window.electronAPI.paths.getFileUrl(a.file_path)}
              theme={data.kind === 'duration_audio' ? 'blue' : 'violet'}
            />
          </div>
        ))}
      </div>
    );
  }

  if (data.kind === 'duration_note' || data.kind === 'recording_note') {
    const html = data.html;
    if (!html) {
      return (
        <div className={panelBase}>
          <p className="text-xs text-gray-400 dark:text-gray-500">No note</p>
        </div>
      );
    }
    return (
      <div className={panelBase}>
        <div className="bg-amber-50 dark:bg-amber-900/10 rounded-lg p-3">
          <div
            ref={noteRef}
            className={`notes-content text-sm text-gray-700 dark:text-gray-300 transition-all overflow-hidden ${noteExpanded ? '' : 'max-h-24'}`}
            dangerouslySetInnerHTML={{ __html: html }}
          />
          {(noteOverflows || noteExpanded) && (
            <button
              onClick={() => setNoteExpanded(e => !e)}
              className="mt-1.5 text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
            >
              {noteExpanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}

// ─── Result card ──────────────────────────────────────────────────────────────
function Breadcrumb({ result }: { result: GlobalSearchResult }) {
  const parts: string[] = [];
  if (result.topic_name) parts.push(result.topic_name);
  if (result.recording_name) parts.push(result.recording_name);
  if (!parts.length) return null;
  return (
    <div className="text-xs text-gray-400 dark:text-gray-500 mb-1 truncate">
      {parts.join(' › ')}
    </div>
  );
}

function Snippet({ html }: { html: string }) {
  return (
    <p
      className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed [&_mark]:bg-yellow-200 [&_mark]:dark:bg-yellow-700 [&_mark]:rounded-sm [&_mark]:px-0.5"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

interface ResultCardProps {
  result: GlobalSearchResult;
  onNavigate: (result: GlobalSearchResult) => void;
}

function ResultCard({ result, onNavigate }: ResultCardProps) {
  const hasNav = result.recording_id !== null;
  const previewKind = getPreviewKind(result);

  const [isExpanded, setIsExpanded] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const hasFetched = useRef(false);

  const handleToggle = useCallback(() => {
    if (!previewKind) return;
    setIsExpanded(prev => {
      const next = !prev;
      if (next && !hasFetched.current) {
        hasFetched.current = true;
        setPreviewLoading(true);
        setPreviewError(false);
        fetchPreviewData(result, previewKind)
          .then(data => setPreviewData(data))
          .catch(() => setPreviewError(true))
          .finally(() => setPreviewLoading(false));
      }
      return next;
    });
  }, [previewKind, result]);

  return (
    <div className="group">
      {/* Clickable card body */}
      <div
        className={`flex gap-3 p-3 hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors${previewKind ? ' cursor-pointer' : ''}`}
        onClick={previewKind ? handleToggle : undefined}
      >
        {/* Thumbnail for image types */}
        {result.thumbnail_path && (
          <img
            src={window.electronAPI.paths.getFileUrl(result.thumbnail_path)}
            className="w-16 h-16 object-cover rounded flex-shrink-0"
            loading="lazy"
          />
        )}
        {/* File icon for non-thumbnail media */}
        {!result.thumbnail_path && result.file_path && (
          <div className="w-10 h-10 rounded bg-gray-100 dark:bg-dark-surface flex items-center justify-center flex-shrink-0 text-lg">
            {result.content_type.includes('audio') ? '🔊' : '📄'}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <Breadcrumb result={result} />

          {/* Marker type badge */}
          {result.marker_type && (
            <span className={`inline-block text-xs px-1.5 py-0.5 rounded mr-2 mb-1 font-medium ${MARKER_COLORS[result.marker_type] ?? 'bg-gray-200 text-gray-700'}`}>
              {MARKER_LABELS[result.marker_type] ?? result.marker_type}
            </span>
          )}

          <Snippet html={result.snippet} />

          {/* Code preview */}
          {result.code && (
            <pre className="mt-1 text-xs bg-gray-100 dark:bg-dark-surface rounded p-2 overflow-x-auto max-h-24 text-gray-600 dark:text-gray-300 font-mono">
              {result.code.slice(0, 400)}{result.code.length > 400 ? '…' : ''}
            </pre>
          )}
        </div>

        {/* Chevron indicator */}
        {previewKind && (
          <svg
            className={`w-4 h-4 flex-shrink-0 text-gray-400 dark:text-gray-500 self-center transition-transform duration-150${isExpanded ? ' rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}

        {/* Navigate link */}
        {hasNav && (
          <button
            onClick={e => { e.stopPropagation(); onNavigate(result); }}
            className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity self-center p-1.5 rounded hover:bg-gray-200 dark:hover:bg-dark-border text-gray-500 dark:text-gray-400"
            title="Open recording"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
        )}
      </div>

      {/* Expansion panel */}
      {isExpanded && (
        <ExpandedPreview
          data={previewData}
          loading={previewLoading}
          error={previewError}
        />
      )}
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────
const INITIAL_SHOW = 5;

function ResultSection({
  label,
  icon,
  items,
  onNavigate,
}: {
  label: string;
  icon: string;
  items: GlobalSearchResult[];
  onNavigate: (result: GlobalSearchResult) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, INITIAL_SHOW);

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">{icon}</span>
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{label}</h3>
        <span className="text-xs text-gray-400 dark:text-gray-500">({items.length})</span>
      </div>
      <div className="border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-dark-border">
        {visible.map((r, i) => (
          <ResultCard key={`${r.content_type}-${r.source_id}-${i}`} result={r} onNavigate={onNavigate} />
        ))}
      </div>
      {items.length > INITIAL_SHOW && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="mt-2 text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
        >
          {expanded ? 'Show less' : `Show all ${items.length} results`}
        </button>
      )}
    </section>
  );
}

// ─── SearchPage ───────────────────────────────────────────────────────────────
export default function SearchPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    query, setQuery,
    results,
    grouped,
    loading, isTyping, hasQuery,
    activeQuery,
    totalCount, categoriesWithResults,
  } = useGlobalSearch();
  useTabTitle(query ? `Search: ${query}` : 'Search');

  // Pre-populate from ?q= URL param on mount
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) setQuery(q);
    // Autofocus
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const navigableResults = useMemo(
    () => results.filter(r => r.recording_id !== null),
    [results],
  );

  const handleNavigate = useCallback((result: GlobalSearchResult) => {
    if (!result.recording_id) return;
    const navIndex = navigableResults.findIndex(
      r => r.source_id === result.source_id && r.content_type === result.content_type,
    );
    const navState: SearchNavState = {
      results: navigableResults,
      currentIndex: navIndex >= 0 ? navIndex : 0,
      query: activeQuery,
    };
    navigate(`/recording/${result.recording_id}`, { state: { searchNav: navState } });
  }, [navigate, navigableResults, activeQuery]);

  const sectionsWithResults = SECTION_ORDER.filter(s => grouped[s.key].length > 0);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Search input */}
      <div className="relative mb-6">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search marks, images, audios, code, notes…"
          className="w-full pl-12 pr-4 py-3 text-base rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 shadow-sm"
          autoComplete="off"
          spellCheck={false}
        />
        {(loading || isTyping) && (
          <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
      </div>

      {/* Summary bar */}
      {hasQuery && !loading && !isTyping && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          {totalCount === 0
            ? 'No results found'
            : `${totalCount} result${totalCount !== 1 ? 's' : ''} across ${categoriesWithResults} categor${categoriesWithResults !== 1 ? 'ies' : 'y'}`}
        </p>
      )}

      {/* Empty state */}
      {!hasQuery && (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p className="text-sm">Search across all marks, images, audios, videos, code and notes</p>
          <p className="text-xs mt-1 opacity-70">Prefix matching enabled — type partial words</p>
        </div>
      )}

      {/* Results */}
      {sectionsWithResults.map(({ key, label, icon }) => (
        <ResultSection
          key={key}
          label={label}
          icon={icon}
          items={grouped[key]}
          onNavigate={handleNavigate}
        />
      ))}
    </div>
  );
}
