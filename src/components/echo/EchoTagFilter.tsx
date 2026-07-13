import { useCallback } from 'react';
import { REVIEW_CHANGED_EVENT } from '../../utils/events';
import TagFilterBox from '../common/TagFilterBox';

interface EchoTagFilterProps {
  activeTags: string[];
  onChange: (tags: string[]) => void;
  /** When set, only tags present on THIS recording's echoes are offered (note-scoped). */
  recordingId?: number;
  /** Classes for the outer container. */
  containerClassName?: string;
}

/**
 * Echo's tag filter: the shared TagFilterBox, scoped to the tags actually on enrolled echoes.
 * All the widget behaviour lives in TagFilterBox — only the tag SOURCE is Echo-specific.
 */
export default function EchoTagFilter({ activeTags, onChange, recordingId, containerClassName }: EchoTagFilterProps) {
  const loadScopedTags = useCallback(
    () => (recordingId != null
      ? window.electronAPI.review.getEnrolledTagsByRecording(recordingId)
      : window.electronAPI.review.getEnrolledTags()),
    [recordingId]
  );

  return (
    <TagFilterBox
      activeTags={activeTags}
      onChange={onChange}
      loadScopedTags={loadScopedTags}
      scopedLabel="On echoes"
      scopedEmptyText="No tags on these echoes yet — add tags from “Add to Echo”, or switch to “All tags”."
      refreshEvent={REVIEW_CHANGED_EVENT}
      containerClassName={containerClassName}
    />
  );
}
