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

export interface PendingImage {
  uid: number;
  buffer: ArrayBuffer;
  extension: string;
  previewUrl: string;
}

interface PendingImageGridProps {
  images: PendingImage[];
  onReorder: (newImages: PendingImage[]) => void;
  onDelete: (uid: number) => void;
  pastePlaceholder?: React.ReactNode;
}

/* ── Sortable single pending image ──────────────────────────────── */

function SortablePendingImage({
  image,
  onDelete,
}: {
  image: PendingImage;
  onDelete: (uid: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: image.uid });

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
      >
        <div className="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-dark-border">
          <img
            src={image.previewUrl}
            alt=""
            className="w-full h-full object-cover pointer-events-none"
            draggable={false}
          />
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(image.uid);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full
                     opacity-0 group-hover:opacity-100 transition-opacity
                     flex items-center justify-center text-sm z-20"
        >
          ×
        </button>
      </div>
    </div>
  );
}

/* ── Drag overlay ────────────────────────────────────────────────── */

function PendingDragOverlay({ image }: { image: PendingImage }) {
  return (
    <div className="w-[120px] opacity-90">
      <div className="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-dark-border shadow-lg ring-2 ring-violet-500">
        <img
          src={image.previewUrl}
          alt=""
          className="w-full h-full object-cover"
          draggable={false}
        />
      </div>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────── */

export default function PendingImageGrid({
  images,
  onReorder,
  onDelete,
  pastePlaceholder,
}: PendingImageGridProps) {
  const [activeUid, setActiveUid] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveUid(event.active.id as number);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveUid(null);
    if (over && active.id !== over.id) {
      const oldIndex = images.findIndex(img => img.uid === active.id);
      const newIndex = images.findIndex(img => img.uid === over.id);
      onReorder(arrayMove(images, oldIndex, newIndex));
    }
  };

  const draggingImage = activeUid ? images.find(img => img.uid === activeUid) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={images.map(img => img.uid)}
        strategy={rectSortingStrategy}
      >
        <div className="flex flex-wrap gap-2">
          {images.map(img => (
            <SortablePendingImage
              key={img.uid}
              image={img}
              onDelete={onDelete}
            />
          ))}
          {pastePlaceholder}
        </div>
      </SortableContext>

      <DragOverlay>
        {draggingImage ? <PendingDragOverlay image={draggingImage} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
