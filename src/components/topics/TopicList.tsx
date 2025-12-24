import { useState } from 'react';
import type { Topic, UpdateTopic } from '../../types';
import TopicCard from './TopicCard';
import ContextMenu from '../common/ContextMenu';
import Modal from '../common/Modal';
import Button from '../common/Button';

interface TopicListProps {
  topics: Topic[];
  loading?: boolean;
  onUpdateTopic?: (topicId: number, updates: UpdateTopic) => Promise<void>;
  onDeleteTopic?: (topicId: number) => Promise<void>;
}

export default function TopicList({ topics, loading, onUpdateTopic, onDeleteTopic }: TopicListProps) {
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    topic: Topic | null;
  }>({
    isOpen: false,
    position: { x: 0, y: 0 },
    topic: null,
  });

  const [renameModal, setRenameModal] = useState<{
    isOpen: boolean;
    topic: Topic | null;
    name: string;
  }>({
    isOpen: false,
    topic: null,
    name: '',
  });
  const [isRenaming, setIsRenaming] = useState(false);

  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    topic: Topic | null;
  }>({
    isOpen: false,
    topic: null,
  });
  const [isDeleting, setIsDeleting] = useState(false);

  const handleContextMenu = (e: React.MouseEvent, topic: Topic) => {
    e.preventDefault();
    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      topic,
    });
  };

  const closeContextMenu = () => {
    setContextMenu(prev => ({ ...prev, isOpen: false }));
  };

  const handleRenameClick = () => {
    if (contextMenu.topic) {
      setRenameModal({
        isOpen: true,
        topic: contextMenu.topic,
        name: contextMenu.topic.name,
      });
    }
    closeContextMenu();
  };

  const handleDeleteClick = () => {
    if (contextMenu.topic) {
      setDeleteModal({
        isOpen: true,
        topic: contextMenu.topic,
      });
    }
    closeContextMenu();
  };

  const handleRenameSubmit = async () => {
    if (!renameModal.topic || !onUpdateTopic) return;

    setIsRenaming(true);
    try {
      const trimmedName = renameModal.name.trim();
      await onUpdateTopic(renameModal.topic.id, { name: trimmedName });
      setRenameModal({ isOpen: false, topic: null, name: '' });
    } finally {
      setIsRenaming(false);
    }
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      if (!isRenaming) {
        setRenameModal({ isOpen: false, topic: null, name: '' });
      }
    }
  };

  const closeRenameModal = () => {
    if (!isRenaming) {
      setRenameModal({ isOpen: false, topic: null, name: '' });
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteModal.topic || !onDeleteTopic) return;

    setIsDeleting(true);
    try {
      await onDeleteTopic(deleteModal.topic.id);
      setDeleteModal({ isOpen: false, topic: null });
    } finally {
      setIsDeleting(false);
    }
  };

  const closeDeleteModal = () => {
    if (!isDeleting) {
      setDeleteModal({ isOpen: false, topic: null });
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="card p-4 animate-pulse"
          >
            <div className="h-4 bg-gray-200 dark:bg-dark-border rounded w-3/4 mb-2" />
            <div className="h-6 bg-gray-200 dark:bg-dark-border rounded w-full mb-2" />
            <div className="h-4 bg-gray-200 dark:bg-dark-border rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (topics.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">📝</div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          No topics yet
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          Create your first topic to start organizing your audio notes
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {topics.map(topic => (
          <TopicCard
            key={topic.id}
            topic={topic}
            onContextMenu={handleContextMenu}
          />
        ))}
      </div>

      <ContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        onClose={closeContextMenu}
        items={[
          { label: 'Edit name', icon: '✏️', onClick: handleRenameClick },
          { label: 'Delete', icon: '🗑️', onClick: handleDeleteClick, danger: true },
        ]}
      />

      <Modal
        isOpen={renameModal.isOpen}
        onClose={closeRenameModal}
        title="Rename Topic"
        size="sm"
      >
        <div className="space-y-4">
          <input
            type="text"
            value={renameModal.name}
            onChange={(e) => setRenameModal(prev => ({ ...prev, name: e.target.value }))}
            onKeyDown={handleRenameKeyDown}
            className="input-field"
            placeholder="Enter topic name..."
            autoFocus
          />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={closeRenameModal} disabled={isRenaming}>
              Cancel
            </Button>
            <Button onClick={handleRenameSubmit} disabled={isRenaming || !renameModal.name.trim()}>
              {isRenaming ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={deleteModal.isOpen}
        onClose={closeDeleteModal}
        title="Delete Topic"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            This will permanently delete this topic and all recordings inside it.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={closeDeleteModal} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirmDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
