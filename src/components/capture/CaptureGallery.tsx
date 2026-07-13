import { useEffect, useMemo, useState } from 'react';
import type { CaptureImageWithContext } from '../../types';
import { IMAGE_COLORS, type ImageColorKey } from '../../utils/imageColors';
import ImageLightbox from '../common/ImageLightbox';

interface CaptureGalleryProps {
  /** Already filtered + sorted newest-first by the backend. */
  images: CaptureImageWithContext[];
  /** Re-run the query — after a tag/colour/caption edit that could change what matches. */
  onChanged: () => void;
}

/** Local 'YYYY-MM-DD'. */
function localDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayHeading(dayKey: string): string {
  if (dayKey === localDay(new Date())) return 'Today';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey === localDay(yesterday)) return 'Yesterday';
  // Parse as LOCAL midnight — `new Date('2026-07-07')` is UTC and can render as the 6th.
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/**
 * Every captured image, grouped by the day it was captured.
 *
 * The lightbox navigates the FLAT filtered list, not the day bucket — so ←/→ carries you across a
 * day boundary instead of dead-ending at the last image of a day.
 */
export default function CaptureGallery({ images, onChanged }: CaptureGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [colorsMap, setColorsMap] = useState<Record<number, string[]>>({});
  const [tagCountMap, setTagCountMap] = useState<Record<number, number>>({});

  // Badges for the grid: colour rings and a tag count, batched rather than one call per image.
  useEffect(() => {
    if (images.length === 0) {
      setColorsMap({});
      setTagCountMap({});
      return;
    }
    const ids = images.map(i => i.id);
    window.electronAPI.mediaColors.getBatch('quick_capture_image', ids).then(setColorsMap);
    Promise.all(
      ids.map(async id => {
        const tags = await window.electronAPI.tags.getByMedia('quick_capture_image', id);
        return [id, tags.length] as const;
      })
    ).then(entries => setTagCountMap(Object.fromEntries(entries)));
  }, [images]);

  const grouped = useMemo(() => {
    const byDay = new Map<string, CaptureImageWithContext[]>();
    for (const img of images) {
      const key = localDay(new Date(img.created_at));
      const bucket = byDay.get(key);
      if (bucket) bucket.push(img);
      else byDay.set(key, [img]);
    }
    // The backend already returns created_at DESC, so insertion order is newest-day-first.
    return [...byDay.entries()];
  }, [images]);

  const current = lightboxIndex != null ? images[lightboxIndex] : null;

  return (
    <div className="space-y-6">
      {grouped.map(([dayKey, dayImages]) => (
        <section key={dayKey}>
          <div className="sticky top-0 z-20 -mx-4 px-4 py-1.5 bg-white/90 dark:bg-dark-bg/90 backdrop-blur-sm border-b border-gray-100 dark:border-dark-border mb-3">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{dayHeading(dayKey)}</h2>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {dayImages.length} image{dayImages.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {dayImages.map(img => {
              // Index into the FLAT list, so lightbox ←/→ crosses day boundaries.
              const flatIndex = images.indexOf(img);
              const colors = colorsMap[img.id] ?? [];
              const tagCount = tagCountMap[img.id] ?? 0;
              return (
                <button
                  key={img.id}
                  onClick={() => setLightboxIndex(flatIndex)}
                  className="group relative aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-dark-surface border border-gray-200 dark:border-dark-border hover:border-primary-400 transition-colors"
                  title={img.caption ?? undefined}
                >
                  <img
                    src={window.electronAPI.paths.getFileUrl(img.thumbnail_path ?? img.file_path)}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />

                  {/* Colour rings, as swatches — the grid can't afford the full ring stack. */}
                  {colors.length > 0 && (
                    <div className="absolute top-1 left-1 flex gap-0.5">
                      {colors.slice(0, 4).map(key => (
                        <span
                          key={key}
                          style={{ backgroundColor: IMAGE_COLORS[key as ImageColorKey]?.hex ?? '#888' }}
                          className="w-2.5 h-2.5 rounded-full ring-1 ring-black/30"
                          title={IMAGE_COLORS[key as ImageColorKey]?.label ?? key}
                        />
                      ))}
                    </div>
                  )}

                  {tagCount > 0 && (
                    <span className="absolute top-1 right-1 bg-orange-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                      {tagCount > 9 ? '9+' : tagCount}
                    </span>
                  )}

                  {/* Cleared-off-the-board marker, so the All view doesn't hide which state it's in. */}
                  {img.capture_archived_at && (
                    <span className="absolute bottom-1 left-1 bg-black/60 text-white/80 text-[9px] px-1 py-0.5 rounded">
                      cleared
                    </span>
                  )}

                  {img.caption && (
                    <span className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[10px] px-1.5 py-1 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                      {img.caption}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {lightboxIndex != null && current && (
        <ImageLightbox
          images={images}
          selectedIndex={lightboxIndex}
          onClose={() => { setLightboxIndex(null); onChanged(); }}
          onNavigate={setLightboxIndex}
          mediaType="quick_capture_image"
          imageType="quick_capture_image"
          onExtractOcr={async () => {
            await window.electronAPI.ocr.extractCaption2('quick_capture_image', current.id, current.file_path);
          }}
          onEnrollInReview={async () =>
            window.electronAPI.review.enroll(
              'quick_capture_image', current.id, current.file_path, current.thumbnail_path ?? null,
              current.caption ?? null, null, current.capture_id
            )
          }
          imageColors={colorsMap[current.id] ?? []}
          onToggleColor={async (key) => {
            const updated = await window.electronAPI.mediaColors.toggle('quick_capture_image', current.id, key);
            setColorsMap(prev => ({ ...prev, [current.id]: updated }));
          }}
          onTagsChanged={(imageId, tagNames) => {
            setTagCountMap(prev => ({ ...prev, [imageId]: tagNames.length }));
          }}
        />
      )}
    </div>
  );
}
