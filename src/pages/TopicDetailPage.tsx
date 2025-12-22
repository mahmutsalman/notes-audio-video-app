import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTopic } from '../hooks/useTopics';
import { useRecordings } from '../hooks/useRecordings';
import RecordingList from '../components/recordings/RecordingList';
import QuickRecord from '../components/recordings/QuickRecord';
import QuickScreenRecord from '../components/recordings/QuickScreenRecord';
import TopicForm from '../components/topics/TopicForm';
import Modal from '../components/common/Modal';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import { formatRelativeTime } from '../utils/formatters';
import type { CreateTopic, CaptureArea } from '../types';

export default function TopicDetailPage() {
  const { topicId } = useParams<{ topicId: string }>();
  const navigate = useNavigate();
  const id = topicId ? parseInt(topicId, 10) : null;

  const { topic, loading: topicLoading, refetch: refetchTopic } = useTopic(id);
  const { recordings, loading: recordingsLoading, fetchRecordings, deleteRecording, updateRecording } = useRecordings(id);

  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingRegionData, setPendingRegionData] = useState<CaptureArea | null>(null);
  const regionIdRef = useRef(0); // Track region selection ID to prevent duplicate processing

  const handleUpdateTopic = async (data: CreateTopic) => {
    if (!id) return;
    setIsUpdating(true);
    try {
      await window.electronAPI.topics.update(id, data);
      await refetchTopic();
      setShowEditModal(false);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteTopic = async () => {
    if (!id) return;
    setIsDeleting(true);
    try {
      await window.electronAPI.topics.delete(id);
      navigate('/');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRecordingSaved = () => {
    fetchRecordings();
    refetchTopic();
  };

  const handleDeleteRecording = async (recordingId: number) => {
    await deleteRecording(recordingId);
    // Refresh topic to update counts
    refetchTopic();
  };

  const handleUpdateRecording = async (recordingId: number, updates: Parameters<typeof updateRecording>[1]) => {
    await updateRecording(recordingId, updates);
  };

  // Memoize pendingRegion to prevent object reference changes causing re-renders
  // NOTE: Can't use ref.current as dependency - refs don't trigger re-renders
  // The _id is set when pendingRegionData changes, so we only need that as dependency
  const pendingRegion = useMemo(() => {
    if (!pendingRegionData) return null;
    // Return stable object with ID to track uniqueness
    return { ...pendingRegionData, _id: regionIdRef.current };
  }, [pendingRegionData]);

  // Global listener for Cmd+D region selection (works from topic page)
  // This ensures Cmd+D works without needing to open modal first
  useEffect(() => {
    console.log('[TopicDetailPage] Setting up global region:selected listener');
    const cleanup = window.electronAPI.region.onRegionSelected((region) => {
      console.log('[TopicDetailPage] Global region:selected event received');
      console.log('[TopicDetailPage] region:', region);

      if (region && id) {
        console.log('[TopicDetailPage] Storing region from Cmd+D for topic:', id);
        // Increment ID to ensure new region is treated as unique
        regionIdRef.current += 1;
        // Store region data so QuickScreenRecord modal can auto-start with it
        setPendingRegionData(region);
      }
    });

    return () => cleanup();
  }, [id]); // Only depend on id - listener active for component lifetime

  // Clear pendingRegion when recording is saved
  const handleRecordingSavedWithClear = () => {
    console.log('[TopicDetailPage] Clearing pendingRegion after save');
    setPendingRegionData(null);
    handleRecordingSaved();
  };

  if (topicLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-dark-border rounded w-1/3" />
          <div className="h-6 bg-gray-200 dark:bg-dark-border rounded w-1/4" />
          <div className="h-4 bg-gray-200 dark:bg-dark-border rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center">
        <div className="text-6xl mb-4">🔍</div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Topic not found
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          The topic you're looking for doesn't exist or has been deleted.
        </p>
        <Button onClick={() => navigate('/')}>
          Back to Topics
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        {/* Title row */}
        <div className="flex items-start justify-between mb-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {topic.name}
          </h1>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowEditModal(true)}
            >
              Edit
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
            >
              Delete
            </Button>
          </div>
        </div>

        {/* Tags */}
        {topic.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {topic.tags.map(tag => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
          <span>{topic.total_recordings ?? 0} recordings</span>
          <span>•</span>
          <span>{topic.total_images ?? 0} images</span>
          <span>•</span>
          <span>{topic.total_videos ?? 0} videos</span>
          <span>•</span>
          <span>Updated {formatRelativeTime(topic.updated_at)}</span>
        </div>
      </div>

      {/* Recordings section */}
      <div className="mb-20">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Recordings ({recordings.length})
        </h2>
        <RecordingList
          recordings={recordings}
          loading={recordingsLoading}
          onDeleteRecording={handleDeleteRecording}
          onUpdateRecording={handleUpdateRecording}
          onRecordingExtended={handleRecordingSaved}
        />
      </div>

      {/* Quick Record FAB */}
      <QuickRecord topicId={id!} onRecordingSaved={handleRecordingSaved} />

      {/* Quick Screen Record FAB - now with Cmd+D support */}
      <QuickScreenRecord
        topicId={id!}
        onRecordingSaved={handleRecordingSavedWithClear}
        pendingRegion={pendingRegion}
      />

      {/* Edit topic modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Topic"
        size="md"
      >
        <TopicForm
          topic={topic}
          onSubmit={handleUpdateTopic}
          onCancel={() => setShowEditModal(false)}
          isLoading={isUpdating}
        />
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete Topic"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-700 dark:text-gray-300">
            Are you sure you want to delete "{topic.name}"? This will also delete all
            recordings, images, and videos associated with this topic.
          </p>
          <p className="text-red-600 dark:text-red-400 text-sm font-medium">
            This action cannot be undone.
          </p>
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteTopic}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete Topic'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
