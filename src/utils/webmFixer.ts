import { fixWebmDuration } from '@fix-webm-duration/fix';

/**
 * Fix WebM blob metadata for seekability.
 * MediaRecorder creates WebM files without proper Duration header,
 * which makes seeking fail for long recordings. This function adds
 * the duration metadata to enable random access seeking.
 *
 * @param blob - Raw WebM blob from MediaRecorder
 * @param durationMs - Duration in milliseconds
 * @returns Fixed WebM blob with proper duration metadata
 */
export async function fixWebmMetadata(blob: Blob, durationMs: number): Promise<Blob> {
  return await fixWebmDuration(blob, durationMs);
}
