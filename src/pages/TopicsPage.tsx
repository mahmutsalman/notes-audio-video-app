import { useState } from 'react';
import { useTopics } from '../hooks/useTopics';
import TopicList from '../components/topics/TopicList';
import TopicForm from '../components/topics/TopicForm';
import Modal from '../components/common/Modal';
import Button from '../components/common/Button';
import type { CreateTopic } from '../types';

export default function TopicsPage() {
  const { topics, loading, error, createTopic, updateTopic, deleteTopic } = useTopics();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'updated' | 'importance' | 'name'>('updated');

  // Filter and sort topics
  const filteredTopics = topics
    .filter(topic => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        topic.name.toLowerCase().includes(query) ||
        topic.tags.some(tag => tag.toLowerCase().includes(query))
      );
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'importance':
          return b.importance_level - a.importance_level;
        case 'name':
          return a.name.localeCompare(b.name);
        case 'updated':
        default:
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      }
    });

  const handleCreateTopic = async (data: CreateTopic) => {
    setIsCreating(true);
    try {
      await createTopic(data);
      setShowCreateModal(false);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          My Topics
        </h1>
        <Button onClick={() => setShowCreateModal(true)}>
          + New Topic
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search topics..."
            className="input-field"
          />
        </div>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="input-field w-auto"
        >
          <option value="updated">Sort by: Updated</option>
          <option value="importance">Sort by: Importance</option>
          <option value="name">Sort by: Name</option>
        </select>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg">
          {error}
        </div>
      )}

      {/* Topics list */}
      <TopicList
        topics={filteredTopics}
        loading={loading}
        onUpdateTopic={updateTopic}
        onDeleteTopic={deleteTopic}
      />

      {/* Create topic modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New Topic"
        size="md"
      >
        <TopicForm
          onSubmit={handleCreateTopic}
          onCancel={() => setShowCreateModal(false)}
          isLoading={isCreating}
        />
      </Modal>
    </div>
  );
}
