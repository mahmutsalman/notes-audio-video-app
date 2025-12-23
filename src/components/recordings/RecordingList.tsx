import { useState } from 'react';
import type { Recording, ImportanceColor, UpdateRecording } from '../../types';
import RecordingCard from './RecordingCard';
import ContextMenu, { type ContextMenuItemType } from '../common/ContextMenu';
import Modal from '../common/Modal';
import Button from '../common/Button';
import ExtendRecordingModal from './ExtendRecordingModal';
import ExtendVideoModal from './ExtendVideoModal';
import { SearchBar } from './SearchBar';
import { useRecordingSearch } from '../../hooks/useRecordingSearch';

interface RecordingListProps {
  recordings: Recording[];
  loading?: boolean;
  onDeleteRecording?: (recordingId: number) => Promise<void>;
  onUpdateRecording?: (recordingId: number, updates: UpdateRecording) => Promise<void>;
  onRecordingExtended?: () => void;
}

export default function RecordingList({
  recordings,
  loading,
  onDeleteRecording,
  onUpdateRecording,
  onRecordingExtended,
}: RecordingListProps) {
  // Search functionality
  const { query, setQuery, filteredRecordings, matchMetadataMap, hasQuery } = useRecordingSearch(recordings);

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

  // Rename modal state
  const [renameModal, setRenameModal] = useState<{
    isOpen: boolean;
    recording: Recording | null;
    name: string;
  }>({
    isOpen: false,
    recording: null,
    name: '',
  });
  const [isRenaming, setIsRenaming] = useState(false);

  // Extend modal state
  const [extendModal, setExtendModal] = useState<{
    isOpen: boolean;
    recording: Recording | null;
  }>({
    isOpen: false,
    recording: null,
  });

  // Extend video modal state
  const [extendVideoModal, setExtendVideoModal] = useState<{
    isOpen: boolean;
    recording: Recording | null;
  }>({
    isOpen: false,
    recording: null,
  });

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

  const handleImportanceChange = async (color: ImportanceColor) => {
    if (contextMenu.recording && onUpdateRecording) {
      await onUpdateRecording(contextMenu.recording.id, { importance_color: color });
    }
  };

  const handleRenameClick = () => {
    if (contextMenu.recording) {
      setRenameModal({
        isOpen: true,
        recording: contextMenu.recording,
        name: contextMenu.recording.name || '',
      });
    }
    closeContextMenu();
  };

  const handleExtendClick = () => {
    if (!contextMenu.recording) return;

    // Check if video or audio recording
    if (contextMenu.recording.video_path) {
      // Video recording → open video extend modal
      setExtendVideoModal({
        isOpen: true,
        recording: contextMenu.recording,
      });
    } else if (contextMenu.recording.audio_path) {
      // Audio recording → open audio extend modal
      setExtendModal({
        isOpen: true,
        recording: contextMenu.recording,
      });
    }

    closeContextMenu();
  };

  const closeExtendModal = () => {
    setExtendModal({ isOpen: false, recording: null });
  };

  const closeExtendVideoModal = () => {
    setExtendVideoModal({ isOpen: false, recording: null });
  };

  const handleExtensionSaved = () => {
    closeExtendModal();
    closeExtendVideoModal();
    // Notify parent to refresh the recordings list
    onRecordingExtended?.();
  };

  const handleRenameSubmit = async () => {
    if (!renameModal.recording || !onUpdateRecording) return;

    setIsRenaming(true);
    try {
      const trimmedName = renameModal.name.trim();
      await onUpdateRecording(renameModal.recording.id, { name: trimmedName || null });
      setRenameModal({ isOpen: false, recording: null, name: '' });
    } finally {
      setIsRenaming(false);
    }
  };

  const closeRenameModal = () => {
    if (!isRenaming) {
      setRenameModal({ isOpen: false, recording: null, name: '' });
    }
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      closeRenameModal();
    }
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
      {/* Search Bar */}
      <div className="mb-6">
        <SearchBar
          value={query}
          onChange={setQuery}
          resultCount={filteredRecordings.length}
          totalCount={recordings.length}
        />
      </div>

      {/* Empty Search Results State */}
      {hasQuery && filteredRecordings.length === 0 && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🔍</div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            No recordings match "{query}"
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            Try different keywords or clear search
          </p>
        </div>
      )}

      {/* Recording Cards */}
      {filteredRecordings.length > 0 && (
        <div className="space-y-4">
          {filteredRecordings.map((recording) => (
            <RecordingCard
              key={recording.id}
              recording={recording}
              onContextMenu={(onDeleteRecording || onUpdateRecording) ? handleContextMenu : undefined}
              matchMetadata={matchMetadataMap.get(recording.id)}
            />
          ))}
        </div>
      )}

      {/* Context Menu */}
      <ContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        onClose={closeContextMenu}
        items={[
          ...(onUpdateRecording ? [{
            type: 'color-picker' as const,
            label: 'Importance',
            value: contextMenu.recording?.importance_color ?? null,
            onChange: handleImportanceChange,
          }] : []),
          ...(onUpdateRecording ? [{
            label: 'Rename',
            icon: '✏️',
            onClick: handleRenameClick,
          }] : []),
          ...(onUpdateRecording ? [{
            label: 'Extend',
            icon: '➕',
            onClick: handleExtendClick,
          }] : []),
          ...(onDeleteRecording ? [{
            label: 'Delete',
            icon: '🗑️',
            danger: true,
            onClick: handleDeleteClick,
          }] : []),
        ] as ContextMenuItemType[]}
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

      {/* Rename Modal */}
      <Modal
        isOpen={renameModal.isOpen}
        onClose={closeRenameModal}
        title="Rename Recording"
        size="sm"
      >
        <div className="space-y-4">
          <input
            type="text"
            value={renameModal.name}
            onChange={(e) => setRenameModal(prev => ({ ...prev, name: e.target.value }))}
            onKeyDown={handleRenameKeyDown}
            autoFocus
            className="input-field w-full"
            placeholder="Recording name..."
          />
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={closeRenameModal}
              disabled={isRenaming}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRenameSubmit}
              disabled={isRenaming}
            >
              {isRenaming ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Extend Recording Modal */}
      {extendModal.recording && (
        <ExtendRecordingModal
          isOpen={extendModal.isOpen}
          onClose={closeExtendModal}
          recording={extendModal.recording}
          onExtensionSaved={handleExtensionSaved}
        />
      )}

      {/* Extend Video Modal */}
      {extendVideoModal.recording && (
        <ExtendVideoModal
          isOpen={extendVideoModal.isOpen}
          onClose={closeExtendVideoModal}
          recording={extendVideoModal.recording}
          onExtensionSaved={handleExtensionSaved}
        />
      )}
    </>
  );
}
