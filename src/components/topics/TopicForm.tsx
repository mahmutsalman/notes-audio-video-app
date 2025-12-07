import { useState, FormEvent } from 'react';
import type { Topic, CreateTopic } from '../../types';
import Button from '../common/Button';
import TagInput from '../common/TagInput';
import ImportanceSlider from '../common/ImportanceSlider';

interface TopicFormProps {
  topic?: Topic;
  onSubmit: (data: CreateTopic) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function TopicForm({
  topic,
  onSubmit,
  onCancel,
  isLoading = false,
}: TopicFormProps) {
  const [name, setName] = useState(topic?.name ?? '');
  const [tags, setTags] = useState<string[]>(topic?.tags ?? []);
  const [importance, setImportance] = useState(topic?.importance_level ?? 5);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!topic;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Topic name is required');
      return;
    }

    setError(null);

    try {
      await onSubmit({
        name: name.trim(),
        tags,
        importance_level: importance,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save topic');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Name */}
      <div>
        <label
          htmlFor="name"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Topic Name
        </label>
        <input
          type="text"
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter topic name..."
          className="input-field"
          autoFocus
        />
      </div>

      {/* Tags */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Tags
        </label>
        <TagInput
          tags={tags}
          onChange={setTags}
          placeholder="Add tags (press Enter or comma)"
        />
      </div>

      {/* Importance */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Importance Level
        </label>
        <ImportanceSlider value={importance} onChange={setImportance} />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving...' : isEdit ? 'Update Topic' : 'Create Topic'}
        </Button>
      </div>
    </form>
  );
}
