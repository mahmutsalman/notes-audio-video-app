import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { DurationColor, DurationGroupColor } from '../../types';
import { DURATION_COLORS } from '../../utils/durationColors';
import { DURATION_GROUP_COLORS } from '../../utils/durationGroupColors';

/** Minimal image shape shared by Image and DurationImage */
export interface SortableImageItem {
  id: number;
  file_path: string;
  thumbnail_path: string | null;
  caption: string | null;
  caption2?: string | null;
  color: DurationColor;
  group_color: DurationGroupColor;
}

interface SortableImageGridProps {
  images: SortableImageItem[];
  /** Tailwind grid class, e.g. "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3" */
  gridClassName: string;
  /** Show 1-based index badge on each image (recording images have this) */
  showNumberBadge?: boolean;
  /** Local override map for priority colors, keyed like "image-123" */
  colorOverrides: Record<string, DurationColor>;
  /** Local override map for group colors, keyed like "image-123" */
  groupColorOverrides: Record<string, DurationGroupColor>;
  /** Prefix used in override keys, e.g. "image" or "durationImage" */
  colorKeyPrefix: string;
  /** Caption Tailwind color class, e.g. "text-violet-600 dark:text-violet-400" */
  captionColorClass: string;
  onImageClick: (index: number) => void;
  onContextMenu?: (e: React.MouseEvent, image: SortableImageItem) => void;
  onDelete: (id: number) => void;
  onReorder: (orderedIds: number[]) => void;
  /** Paste placeholder rendered at the end of the grid (not draggable) */
  pastePlaceholder?: React.ReactNode;
  /** Map of imageId → audio count for showing badge */
  audioCountMap?: Record<number, number>;
  /** Map of imageId → tag count for showing badge */
  tagCountMap?: Record<number, number>;
  /** Map of imageId → tag name array for showing above image */
  tagNamesMap?: Record<number, string[]>;
  /** Image ID to highlight (from search navigation) */
  highlightedId?: number;
  /** Disable drag-and-drop and hide the delete button (read-only display mode) */
  readOnly?: boolean;
}

/* ── Sortable wrapper for a single image cell ─────────────────── */

interface SortableImageProps {
  image: SortableImageItem;
  index: number;
  showNumberBadge: boolean;
  colorConfig: (typeof DURATION_COLORS)[keyof typeof DURATION_COLORS] | null;
  groupColorConfig: (typeof DURATION_GROUP_COLORS)[keyof typeof DURATION_GROUP_COLORS] | null;
  captionColorClass: string;
  onImageClick: (index: number) => void;
  onContextMenu?: (e: React.MouseEvent, image: SortableImageItem) => void;
  onDelete: (id: number) => void;
  audioCount?: number;
  tagCount?: number;
  tags?: string[];
  isHighlighted?: boolean;
}

function SortableImage({
  image,
  index,
  showNumberBadge,
  colorConfig,
  groupColorConfig,
  captionColorClass,
  onImageClick,
  onContextMenu,
  onDelete,
  audioCount = 0,
  tagCount = 0,
  tags = [],
  isHighlighted = false,
}: SortableImageProps) {
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: image.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      id={`img-cell-${image.id}`}
      style={style}
      className={`group flex flex-col items-center${isHighlighted ? ' ring-2 ring-blue-400 ring-offset-1 rounded-lg' : ''}`}
      {...attributes}
    >
      <div
        className="relative w-full cursor-grab active:cursor-grabbing"
        {...listeners}
        onContextMenu={(e) => onContextMenu?.(e, image)}
      >
        {/* Top group color indicator */}
        {groupColorConfig && (
          <div
            className="absolute top-0 left-0 right-0 h-1 rounded-t-lg z-10"
            style={{ backgroundColor: groupColorConfig.color }}
          />
        )}
        {/* Tag names overlay — top of image, hidden on hover so delete button shows */}
        {tags.length > 0 && (
          <div className="absolute top-0 left-0 right-0 z-10 px-1 pt-0.5 pb-1
                          bg-white/60 dark:bg-black/50 rounded-t-lg
                          group-hover:opacity-0 transition-opacity pointer-events-none">
            {tags.map(t => (
              <p key={t} className={`text-xs ${captionColorClass} italic font-light leading-tight truncate`}>
                #{t}
              </p>
            ))}
          </div>
        )}
        {/* Number badge */}
        {showNumberBadge && (
          <div className="absolute top-1 left-1 w-6 h-6 bg-black/70 text-white
                          rounded-full flex items-center justify-center text-xs font-bold z-10">
            {index + 1}
          </div>
        )}
        {/* Audio count badge */}
        {audioCount > 0 && (
          <div className="absolute top-1 right-1 bg-blue-500 text-white text-[10px]
                          rounded-full w-4 h-4 flex items-center justify-center font-bold z-10
                          group-hover:opacity-0 transition-opacity">
            {audioCount > 9 ? '9+' : audioCount}
          </div>
        )}
        {/* Tag count badge — always visible, delete button (z-20) covers it on hover */}
        {tagCount > 0 && audioCount === 0 && (
          <div className="absolute top-1 right-1 bg-orange-500 text-white text-[10px]
                          rounded-full w-4 h-4 flex items-center justify-center font-bold z-10
                          group-hover:opacity-0 transition-opacity">
            {tagCount > 9 ? '9+' : tagCount}
          </div>
        )}
        {tagCount > 0 && audioCount > 0 && (
          <div className="absolute top-6 right-1 bg-orange-500 text-white text-[10px]
                          rounded-full w-4 h-4 flex items-center justify-center font-bold z-10
                          group-hover:opacity-0 transition-opacity">
            {tagCount > 9 ? '9+' : tagCount}
          </div>
        )}
        {/* Left color indicator */}
        {colorConfig && (
          <div
            className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg z-10"
            style={{ backgroundColor: colorConfig.borderColor }}
          />
        )}
        <div
          className="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-dark-border"
          onClick={(e) => {
            // Only open lightbox if this wasn't a drag
            if (!isDragging) {
              e.stopPropagation();
              onImageClick(index);
            }
          }}
        >
          <img
            src={window.electronAPI.paths.getFileUrl(image.thumbnail_path || image.file_path)}
            alt=""
            className="w-full h-full object-cover pointer-events-none"
            draggable={false}
          />
        </div>
        {/* Right color indicator */}
        {colorConfig && (
          <div
            className="absolute right-0 top-0 bottom-0 w-1 rounded-r-lg z-10"
            style={{ backgroundColor: colorConfig.borderColor }}
          />
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(image.id);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full
                     opacity-0 group-hover:opacity-100 transition-opacity
                     flex items-center justify-center text-sm z-20"
        >
          ×
        </button>
      </div>
      {/* Caption — always rendered for consistent vertical spacing */}
      <p
        className={`w-full text-xs ${captionColorClass} mt-1 italic font-light leading-tight text-center ${image.caption ? 'cursor-pointer' : 'invisible'} ${captionExpanded ? '' : 'line-clamp-2'}`}
        onClick={image.caption ? (e) => { e.stopPropagation(); setCaptionExpanded(v => !v); } : undefined}
      >
        {image.caption || '\u00A0'}
      </p>
    </div>
  );
}

/* ── Read-only image cell (no drag, no delete) ────────────────── */

interface ReadOnlyImageProps {
  image: SortableImageItem;
  index: number;
  showNumberBadge: boolean;
  colorConfig: (typeof DURATION_COLORS)[keyof typeof DURATION_COLORS] | null;
  groupColorConfig: (typeof DURATION_GROUP_COLORS)[keyof typeof DURATION_GROUP_COLORS] | null;
  captionColorClass: string;
  onImageClick: (index: number) => void;
  onContextMenu?: (e: React.MouseEvent, image: SortableImageItem) => void;
  audioCount?: number;
  isHighlighted?: boolean;
}

function ReadOnlyImage({
  image,
  index,
  showNumberBadge,
  colorConfig,
  groupColorConfig,
  captionColorClass,
  onImageClick,
  onContextMenu,
  audioCount = 0,
  isHighlighted = false,
}: ReadOnlyImageProps) {
  const [captionExpanded, setCaptionExpanded] = useState(false);

  return (
    <div
      id={`img-cell-${image.id}`}
      className={`group flex flex-col items-center${isHighlighted ? ' ring-2 ring-blue-400 ring-offset-1 rounded-lg' : ''}`}
    >
      <div
        className="relative w-full cursor-pointer"
        onContextMenu={(e) => onContextMenu?.(e, image)}
      >
        {groupColorConfig && (
          <div
            className="absolute top-0 left-0 right-0 h-1 rounded-t-lg z-10"
            style={{ backgroundColor: groupColorConfig.color }}
          />
        )}
        {showNumberBadge && (
          <div className="absolute top-1 left-1 w-6 h-6 bg-black/70 text-white
                          rounded-full flex items-center justify-center text-xs font-bold z-10">
            {index + 1}
          </div>
        )}
        {audioCount > 0 && (
          <div className="absolute top-1 right-1 bg-blue-500 text-white text-[10px]
                          rounded-full w-4 h-4 flex items-center justify-center font-bold z-10">
            {audioCount > 9 ? '9+' : audioCount}
          </div>
        )}
        {colorConfig && (
          <div
            className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg z-10"
            style={{ backgroundColor: colorConfig.borderColor }}
          />
        )}
        <div
          className="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-dark-border"
          onClick={(e) => { e.stopPropagation(); onImageClick(index); }}
        >
          <img
            src={window.electronAPI.paths.getFileUrl(image.thumbnail_path || image.file_path)}
            alt=""
            className="w-full h-full object-cover pointer-events-none"
            draggable={false}
          />
        </div>
        {colorConfig && (
          <div
            className="absolute right-0 top-0 bottom-0 w-1 rounded-r-lg z-10"
            style={{ backgroundColor: colorConfig.borderColor }}
          />
        )}
      </div>
      <p
        className={`w-full text-xs ${captionColorClass} mt-1 italic font-light leading-tight text-center ${image.caption ? 'cursor-pointer' : 'invisible'} ${captionExpanded ? '' : 'line-clamp-2'}`}
        onClick={image.caption ? (e) => { e.stopPropagation(); setCaptionExpanded(v => !v); } : undefined}
      >
        {image.caption || '\u00A0'}
      </p>
    </div>
  );
}

/* ── Drag overlay (thumbnail shown while dragging) ────────────── */

function ImageDragOverlay({ image }: { image: SortableImageItem }) {
  return (
    <div className="w-[120px] opacity-90">
      <div className="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-dark-border shadow-lg ring-2 ring-teal-500">
        <img
          src={window.electronAPI.paths.getFileUrl(image.thumbnail_path || image.file_path)}
          alt=""
          className="w-full h-full object-cover"
          draggable={false}
        />
      </div>
    </div>
  );
}

/* ── Main grid component ──────────────────────────────────────── */

export default function SortableImageGrid({
  images,
  gridClassName,
  showNumberBadge = false,
  colorOverrides,
  groupColorOverrides,
  colorKeyPrefix,
  captionColorClass,
  onImageClick,
  onContextMenu,
  onDelete,
  onReorder,
  pastePlaceholder,
  audioCountMap,
  tagCountMap,
  tagNamesMap,
  highlightedId,
  readOnly = false,
}: SortableImageGridProps) {
  const [activeId, setActiveId] = useState<number | null>(null);

  if (readOnly) {
    return (
      <div className={gridClassName}>
        {images.map((img, index) => {
          const key = `${colorKeyPrefix}-${img.id}`;
          const effectiveColor = colorOverrides[key] ?? img.color;
          const effectiveGroupColor = key in groupColorOverrides ? groupColorOverrides[key] : img.group_color;
          const colorConfig = effectiveColor ? DURATION_COLORS[effectiveColor] : null;
          const groupColorConfig = effectiveGroupColor ? DURATION_GROUP_COLORS[effectiveGroupColor] : null;
          return (
            <ReadOnlyImage
              key={img.id}
              image={img}
              index={index}
              showNumberBadge={showNumberBadge}
              colorConfig={colorConfig}
              groupColorConfig={groupColorConfig}
              captionColorClass={captionColorClass}
              onImageClick={onImageClick}
              onContextMenu={onContextMenu}
              audioCount={audioCountMap?.[img.id] ?? 0}
              isHighlighted={highlightedId === img.id}
            />
          );
        })}
        {pastePlaceholder}
      </div>
    );
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px prevents click-vs-drag conflict (same as MarkList)
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as number);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      const oldIndex = images.findIndex(img => img.id === active.id);
      const newIndex = images.findIndex(img => img.id === over.id);
      const newOrder = arrayMove(images, oldIndex, newIndex);
      onReorder(newOrder.map(img => img.id));
    }
  };

  const draggingImage = activeId ? images.find(img => img.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={images.map(img => img.id)}
        strategy={rectSortingStrategy}
      >
        <div className={gridClassName}>
          {images.map((img, index) => {
            const key = `${colorKeyPrefix}-${img.id}`;
            const effectiveColor = colorOverrides[key] ?? img.color;
            const effectiveGroupColor = key in groupColorOverrides
              ? groupColorOverrides[key]
              : img.group_color;
            const colorConfig = effectiveColor ? DURATION_COLORS[effectiveColor] : null;
            const groupColorConfig = effectiveGroupColor ? DURATION_GROUP_COLORS[effectiveGroupColor] : null;

            return (
              <SortableImage
                key={img.id}
                image={img}
                index={index}
                showNumberBadge={showNumberBadge}
                colorConfig={colorConfig}
                groupColorConfig={groupColorConfig}
                captionColorClass={captionColorClass}
                onImageClick={onImageClick}
                onContextMenu={onContextMenu}
                onDelete={onDelete}
                audioCount={audioCountMap?.[img.id] ?? 0}
                tagCount={tagCountMap?.[img.id] ?? 0}
                tags={tagNamesMap?.[img.id] ?? []}
                isHighlighted={highlightedId === img.id}
              />
            );
          })}
          {/* Paste placeholder — inside grid layout but not a sortable item */}
          {pastePlaceholder}
        </div>
      </SortableContext>

      <DragOverlay>
        {draggingImage ? <ImageDragOverlay image={draggingImage} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
