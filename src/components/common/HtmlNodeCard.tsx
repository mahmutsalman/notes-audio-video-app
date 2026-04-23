import React, { useState, useRef } from 'react';
import { HtmlNode, DurationHtmlNode } from '../../types';

interface HtmlNodeCardProps {
  node: HtmlNode | DurationHtmlNode;
  onOpen: () => void;
  onDelete: () => void;
  onUpdateTitle: (title: string | null) => void;
}

export default function HtmlNodeCard({ node, onOpen, onDelete, onUpdateTitle }: HtmlNodeCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(node.title ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setTitleDraft(node.title ?? '');
    setIsEditingTitle(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleTitleBlur() {
    setIsEditingTitle(false);
    const trimmed = titleDraft.trim() || null;
    if (trimmed !== node.title) onUpdateTitle(trimmed);
  }

  function handleTitleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); inputRef.current?.blur(); }
    if (e.key === 'Escape') { setTitleDraft(node.title ?? ''); setIsEditingTitle(false); }
  }

  const isPdf = node.file_type === 'pdf';
  const displayTitle = node.title || (isPdf ? 'Untitled PDF' : 'Untitled HTML');
  const fileName = node.file_path.split('/').pop() ?? '';

  return (
    <div
      className="relative flex items-center gap-2 p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750 select-none"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={isEditingTitle ? undefined : onOpen}
    >
      {/* File type badge */}
      <span
        className={`shrink-0 text-xs font-bold px-1.5 py-0.5 rounded ${
          isPdf
            ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
            : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
        }`}
      >
        {isPdf ? 'PDF' : 'HTML'}
      </span>

      {/* Title / filename */}
      <div className="flex-1 min-w-0">
        {isEditingTitle ? (
          <input
            ref={inputRef}
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
            onClick={e => e.stopPropagation()}
            className="w-full text-sm bg-transparent border-b border-blue-400 outline-none text-gray-800 dark:text-gray-200"
            placeholder="Add title…"
          />
        ) : (
          <div className="flex flex-col min-w-0">
            <span className="text-sm text-gray-800 dark:text-gray-200 truncate" title={fileName}>
              {displayTitle}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500 truncate">{fileName}</span>
          </div>
        )}
      </div>

      {/* Hover actions: rename + delete, grouped together */}
      {isHovered && !isEditingTitle && (
        <div className="shrink-0 flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <button
            onClick={startEdit}
            className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 px-1"
            title="Rename"
          >
            ✎
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-200 px-1"
            title="Delete"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
