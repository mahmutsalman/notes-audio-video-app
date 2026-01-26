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
  onContextMenu: (e: React.MouseEvent, image: SortableImageItem) => void;
  onDelete: (id: number) => void;
  onReorder: (orderedIds: number[]) => void;
  /** Paste placeholder rendered at the end of the grid (not draggable) */
  pastePlaceholder?: React.ReactNode;
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
  onContextMenu: (e: React.MouseEvent, image: SortableImageItem) => void;
  onDelete: (id: number) => void;
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
}: SortableImageProps) {
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
      style={style}
      className="group flex flex-col items-center"
      {...attributes}
    >
      <div
        className="relative w-full max-w-[160px] cursor-grab active:cursor-grabbing"
        {...listeners}
        onContextMenu={(e) => onContextMenu(e, image)}
      >
        {/* Top group color indicator */}
        {groupColorConfig && (
          <div
            className="absolute top-0 left-0 right-0 h-1 rounded-t-lg z-10"
            style={{ backgroundColor: groupColorConfig.color }}
          />
        )}
        {/* Number badge */}
        {showNumberBadge && (
          <div className="absolute top-1 left-1 w-6 h-6 bg-black/70 text-white
                          rounded-full flex items-center justify-center text-xs font-bold z-10">
            {index + 1}
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
      {/* Caption */}
      {image.caption && (
        <p className={`w-full text-xs ${captionColorClass} mt-1 line-clamp-2 italic font-light leading-tight text-center`}>
          {image.caption}
        </p>
      )}
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
}: SortableImageGridProps) {
  const [activeId, setActiveId] = useState<number | null>(null);

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
