import type { ReviewNoteAudio, ReviewNoteImage } from '../../types';
import ReviewNoteImages from './ReviewNoteImages';
import ReviewNoteAudios from './ReviewNoteAudios';

interface ReviewNoteAttachmentsProps {
  /** The note these attachments hang off. Must already exist in the DB. */
  noteId: number;
  images: ReviewNoteImage[];
  audios: ReviewNoteAudio[];
  onImagesChange: (images: ReviewNoteImage[]) => void;
  onAudiosChange: (audios: ReviewNoteAudio[]) => void;
  /** Dark study-session palette vs. the light Echo detail page. */
  variant?: 'dark' | 'light';
  /** Start the mic the moment this mounts — used when the note was created BY the mic button. */
  autoStartAudio?: boolean;
}

/**
 * Single-row attachment controls for one reflective review note.
 *
 * The voice-note recorder (left) and the image thumbnails + paste dropzone (right) used to render
 * as two stacked rows, costing every note card roughly a full thumbnail row of height. Sharing one
 * row keeps the card compact: `justify-between` pushes the paste square to the right edge, and
 * `flex-wrap` lets a long run of chips/thumbnails fall back to stacking instead of overflowing.
 * Behavior is untouched — this only composes the two existing components.
 */
export default function ReviewNoteAttachments({
  noteId,
  images,
  audios,
  onImagesChange,
  onAudiosChange,
  variant = 'dark',
  autoStartAudio = false,
}: ReviewNoteAttachmentsProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
      <ReviewNoteAudios
        noteId={noteId}
        audios={audios}
        onChange={onAudiosChange}
        variant={variant}
        autoStart={autoStartAudio}
      />
      <ReviewNoteImages
        noteId={noteId}
        images={images}
        onChange={onImagesChange}
        variant={variant}
      />
    </div>
  );
}
