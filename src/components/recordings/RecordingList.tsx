import { useState } from 'react';
import type { Recording } from '../../types';
import RecordingCard from './RecordingCard';
import ContextMenu from '../common/ContextMenu';
import Modal from '../common/Modal';
import Button from '../common/Button';

interface RecordingListProps {
  recordings: Recording[];
  loading?: boolean;
  onDeleteRecording?: (recordingId: number) => Promise<void>;
}

export default function RecordingList({
  recordings,
  loading,
  onDeleteRecording,
}: RecordingListProps) {
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    recording: Recording | null;
  }>({
    isOpen: false,
    position: { x: 0, y: 0 },
    recording: null,
  });

  // Delete confirmation modal state
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    recording: Recording | null;
  }>({
    isOpen: false,
    recording: null,
  });
  const [isDeleting, setIsDeleting] = useState(false);

  const handleContextMenu = (e: React.MouseEvent, recording: Recording) => {
    e.preventDefault();
    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      recording,
    });
  };

  const closeContextMenu = () => {
    setContextMenu((prev) => ({ ...prev, isOpen: false }));
  };

  const handleDeleteClick = () => {
    if (contextMenu.recording) {
      setDeleteModal({
        isOpen: true,
        recording: contextMenu.recording,
      });
    }
    closeContextMenu();
  };

  const handleConfirmDelete = async () => {
    if (!deleteModal.recording || !onDeleteRecording) return;

    setIsDeleting(true);
    try {
      await onDeleteRecording(deleteModal.recording.id);
      setDeleteModal({ isOpen: false, recording: null });
    } finally {
      setIsDeleting(false);
    }
  };

  const closeDeleteModal = () => {
    if (!isDeleting) {
      setDeleteModal({ isOpen: false, recording: null });
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="card p-4 animate-pulse"
          >
            <div className="h-4 bg-gray-200 dark:bg-dark-border rounded w-20 mb-2" />
            <div className="h-4 bg-gray-200 dark:bg-dark-border rounded w-full mb-2" />
            <div className="h-4 bg-gray-200 dark:bg-dark-border rounded w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  if (recordings.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">🎙️</div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          No recordings yet
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          Click the record button to add your first audio note
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {recordings.map((recording) => (
          <RecordingCard
            key={recording.id}
            recording={recording}
            onContextMenu={onDeleteRecording ? handleContextMenu : undefined}
          />
        ))}
      </div>

      {/* Context Menu */}
      <ContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        onClose={closeContextMenu}
        items={[
          {
            label: 'Delete',
            icon: '🗑️',
            danger: true,
            onClick: handleDeleteClick,
          },
        ]}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteModal.isOpen}
        onClose={closeDeleteModal}
        title="Delete Recording"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-700 dark:text-gray-300">
            Are you sure you want to delete this recording? This will also delete
            all associated images, videos, and marked sections.
          </p>
          <p className="text-red-600 dark:text-red-400 text-sm font-medium">
            This action cannot be undone.
          </p>
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={closeDeleteModal}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete Recording'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
