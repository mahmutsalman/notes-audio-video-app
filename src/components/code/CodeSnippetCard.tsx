import { useState } from 'react';
import type { CodeSnippet, DurationCodeSnippet } from '../../types';
import CodeEditor from './CodeEditor';

interface CodeSnippetCardProps {
  snippet: CodeSnippet | DurationCodeSnippet;
  onEdit: () => void;
  onDelete: () => void;
}

export default function CodeSnippetCard({ snippet, onEdit, onDelete }: CodeSnippetCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getLanguageLabel = (lang: string) => {
    const labels: Record<string, string> = {
      typescript: 'TypeScript',
      javascript: 'JavaScript',
      python: 'Python',
      java: 'Java',
      cpp: 'C++',
      csharp: 'C#',
      go: 'Go',
      rust: 'Rust',
      php: 'PHP',
      ruby: 'Ruby',
      swift: 'Swift',
      kotlin: 'Kotlin',
      sql: 'SQL',
      html: 'HTML',
      css: 'CSS',
      json: 'JSON',
      yaml: 'YAML',
      markdown: 'Markdown',
      plaintext: 'Plain Text',
    };
    return labels[lang] || lang;
  };

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-sm font-medium text-gray-200 hover:text-white transition-colors text-left"
            >
              {snippet.title || 'Untitled Snippet'}
            </button>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-violet-500/20 text-violet-300 border border-violet-500/30">
              {getLanguageLabel(snippet.language)}
            </span>
          </div>
          {snippet.caption && (
            <p className="text-xs text-gray-400 mt-1">{snippet.caption}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
            title="Edit"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 hover:bg-red-500/20 rounded transition-colors"
            title="Delete"
          >
            <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-2">
          <CodeEditor
            code={snippet.code}
            language={snippet.language}
            readOnly={true}
            height="300px"
            showLanguageSelector={false}
          />
        </div>
      )}

      {!isExpanded && snippet.code && (
        <div className="mt-2">
          <pre className="bg-gray-900/50 border border-gray-700 rounded p-2 text-xs text-gray-300 overflow-x-auto max-h-24 overflow-y-hidden">
            <code>{snippet.code.split('\n').slice(0, 3).join('\n')}{snippet.code.split('\n').length > 3 ? '\n...' : ''}</code>
          </pre>
          <button
            onClick={() => setIsExpanded(true)}
            className="mt-2 text-xs text-violet-400 hover:text-violet-300 transition-colors"
          >
            Show more
          </button>
        </div>
      )}
    </div>
  );
}
