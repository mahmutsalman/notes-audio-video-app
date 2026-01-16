// Custom events for cross-component state synchronization

export const RECORDING_UPDATED_EVENT = 'recording-updated';

export function emitRecordingUpdated(recordingId: number) {
  window.dispatchEvent(
    new CustomEvent(RECORDING_UPDATED_EVENT, { detail: { id: recordingId } })
  );
}
