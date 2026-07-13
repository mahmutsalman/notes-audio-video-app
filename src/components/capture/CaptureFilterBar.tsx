import { useCallback, useEffect, useState } from 'react';
import type { CaptureFilters } from '../../types';
import { IMAGE_COLORS, type ImageColorKey } from '../../utils/imageColors';
import TagFilterBox from '../common/TagFilterBox';

interface CaptureFilterBarProps {
  filters: CaptureFilters;
  onChange: (next: CaptureFilters) => void;
  /** How many rows the current filters matched — shown so an empty result is never a mystery. */
  resultCount: number;
  /**
   * Which grain is being filtered. The tag and colour OPTION lists must match it: an "images"
   * count and a "sessions" count are different numbers over the same tag, and offering a tag that
   * exists on no row at this grain is a dead end.
   */
  grain: 'images' | 'sessions';
}

/** Local 'YYYY-MM-DD' — the same space the backend filters in and the list groups by. */
function localDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDay(d);
}

const DATE_PRESETS: { label: string; from: string | null }[] = [
  { label: 'All time', from: null },
  { label: 'Today', from: localDay(new Date()) },
  { label: 'Last 7 days', from: daysAgo(6) },
  { label: 'Last 30 days', from: daysAgo(29) },
];

const SCOPES: { value: NonNullable<CaptureFilters['scope']>; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'board', label: 'On board' },
  { value: 'archived', label: 'Cleared' },
];

export default function CaptureFilterBar({ filters, onChange, resultCount, grain }: CaptureFilterBarProps) {
  // Only offer colours that are actually ON captures — a swatch that can never match anything is
  // just a dead end.
  const [colorOptions, setColorOptions] = useState<{ color_key: string; count: number }[]>([]);
  useEffect(() => {
    const load = grain === 'images'
      ? window.electronAPI.quickCaptures.getCaptureImageColors()
      : window.electronAPI.quickCaptures.getCaptureColors();
    load.then(setColorOptions);
  }, [grain]);

  const loadScopedTags = useCallback(
    () => (grain === 'images'
      ? window.electronAPI.quickCaptures.getCaptureImageTags()
      : window.electronAPI.quickCaptures.getCaptureTags()),
    [grain]
  );

  const activeColors = filters.colorKeys ?? [];
  const toggleColor = (key: string) => {
    onChange({
      ...filters,
      colorKeys: activeColors.includes(key)
        ? activeColors.filter(k => k !== key)
        : [...activeColors, key],
    });
  };

  // A preset is "custom" once `to` is set or `from` matches nothing we offer.
  const activePreset = filters.to
    ? null
    : DATE_PRESETS.find(p => p.from === (filters.from ?? null)) ?? null;

  const hasAnyFilter =
    (filters.tagNames?.length ?? 0) > 0 ||
    activeColors.length > 0 ||
    !!filters.from ||
    !!filters.to ||
    (filters.scope ?? 'all') !== 'all';

  return (
    <div className="rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-surface p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Scope */}
        <div className="flex items-center gap-1">
          {SCOPES.map(s => (
            <button
              key={s.value}
              onClick={() => onChange({ ...filters, scope: s.value })}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                (filters.scope ?? 'all') === s.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-dark-hover text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <span className="w-px h-5 bg-gray-200 dark:bg-dark-border" />

        {/* Date presets */}
        <div className="flex items-center gap-1 flex-wrap">
          {DATE_PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => onChange({ ...filters, from: p.from, to: null })}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                activePreset?.label === p.label
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-dark-hover text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <span className="flex-1" />

        <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
          {resultCount} {grain === 'images'
            ? `image${resultCount !== 1 ? 's' : ''}`
            : `session${resultCount !== 1 ? 's' : ''}`}
        </span>

        {hasAnyFilter && (
          <button
            onClick={() => onChange({ scope: 'all' })}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline"
          >
            Reset filters
          </button>
        )}
      </div>

      {/* Custom date range — an explicit from/to for when the presets don't cover it. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500 dark:text-gray-400">From</span>
        <input
          type="date"
          value={filters.from ?? ''}
          max={filters.to ?? undefined}
          onChange={(e) => onChange({ ...filters, from: e.target.value || null })}
          className="px-2 py-1 rounded-lg text-xs border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-800 dark:text-gray-100"
        />
        <span className="text-xs text-gray-500 dark:text-gray-400">to</span>
        <input
          type="date"
          value={filters.to ?? ''}
          min={filters.from ?? undefined}
          onChange={(e) => onChange({ ...filters, to: e.target.value || null })}
          className="px-2 py-1 rounded-lg text-xs border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-800 dark:text-gray-100"
        />
      </div>

      {/* Tags. A capture has no tags of its own — these match its images/audios (and the legacy
          capture-level tag list), which is where tagging actually happens. */}
      <TagFilterBox
        activeTags={filters.tagNames ?? []}
        onChange={(tagNames) => onChange({ ...filters, tagNames })}
        loadScopedTags={loadScopedTags}
        scopedLabel={grain === 'images' ? 'On images' : 'On captures'}
        scopedEmptyText="No tags on any capture yet — tag a capture's image or audio, or switch to “All tags”."
      />

      {/* Colours — same roll-up: a colour on any of the capture's images or audios. */}
      {colorOptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">🎨</span>
          {colorOptions.map(({ color_key, count }) => {
            const def = IMAGE_COLORS[color_key as ImageColorKey];
            const active = activeColors.includes(color_key);
            return (
              <button
                key={color_key}
                onClick={() => toggleColor(color_key)}
                title={`${def?.label ?? color_key} · ${count} capture${count !== 1 ? 's' : ''}`}
                style={{ backgroundColor: def?.hex ?? '#888' }}
                className={`w-5 h-5 rounded-full transition-all ${
                  active
                    ? 'ring-2 ring-offset-2 ring-offset-gray-50 dark:ring-offset-dark-surface ring-blue-500 scale-110'
                    : 'opacity-40 hover:opacity-80'
                }`}
              />
            );
          })}
          {activeColors.length > 0 && (
            <button
              onClick={() => onChange({ ...filters, colorKeys: [] })}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline"
            >
              clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
