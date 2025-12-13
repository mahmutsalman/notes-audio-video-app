import { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import CodeEditor from './CodeEditor';
import type { CodeSnippet, DurationCodeSnippet } from '../../types';

interface CodeSnippetModalProps {
  snippet?: CodeSnippet | DurationCodeSnippet | null;
  onSave: (data: { title: string | null; language: string; code: string; caption: string | null }) => void;
  onCancel: () => void;
}

export default function CodeSnippetModal({ snippet, onSave, onCancel }: CodeSnippetModalProps) {
  const [title, setTitle] = useState(snippet?.title || '');
  const [language, setLanguage] = useState(snippet?.language || 'typescript');
  const [code, setCode] = useState(snippet?.code || '');
  const [caption, setCaption] = useState(snippet?.caption || '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (snippet) {
      setTitle(snippet.title || '');
      setLanguage(snippet.language);
      setCode(snippet.code);
      setCaption(snippet.caption || '');
    }
  }, [snippet]);

  const handleSave = async () => {
    if (!code.trim()) {
      alert('Code cannot be empty');
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        title: title.trim() || null,
        language,
        code: code.trim(),
        caption: caption.trim() || null,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onCancel}
      title={snippet ? 'Edit Code Snippet' : 'New Code Snippet'}
      size="xl"
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="snippet-title" className="block text-sm font-medium text-gray-300 mb-1">
            Title (optional)
          </label>
          <input
            id="snippet-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., User Authentication Function"
            className="w-full bg-gray-800 text-gray-200 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Code
          </label>
          <CodeEditor
            code={code}
            language={language}
            onChange={setCode}
            onLanguageChange={setLanguage}
            height="400px"
            showLanguageSelector={true}
          />
        </div>

        <div>
          <label htmlFor="snippet-caption" className="block text-sm font-medium text-gray-300 mb-1">
            Caption / Description (optional)
          </label>
          <textarea
            id="snippet-caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Add a description or note about this code snippet..."
            rows={3}
            className="w-full bg-gray-800 text-gray-200 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
          />
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-gray-700">
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={isSaving || !code.trim()}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
