// Custom events for cross-component state synchronization

export const RECORDING_UPDATED_EVENT = 'recording-updated';

export function emitRecordingUpdated(recordingId: number) {
  window.dispatchEvent(
    new CustomEvent(RECORDING_UPDATED_EVENT, { detail: { id: recordingId } })
  );
}

export const SYNC_COMPLETED_EVENT = 'sync-completed';

export function emitSyncCompleted() {
  window.dispatchEvent(new CustomEvent(SYNC_COMPLETED_EVENT));
}

// Echo review queue changed (enroll / rate / delete). Window-scoped so every open
// tab's Echo page in this renderer refreshes without polling.
export const REVIEW_CHANGED_EVENT = 'review-changed';

export function emitReviewChanged() {
  window.dispatchEvent(new CustomEvent(REVIEW_CHANGED_EVENT));
}
