import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Tag } from '../../types';

type SortMode = 'name' | 'usage' | 'last_assigned' | 'last_clicked';

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return '—';
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  const diffWk = Math.floor(diffDay / 7);
  if (diffWk < 5) return `${diffWk}w ago`;
  const diffMo = Math.floor(diffDay / 30);
  if (diffMo < 12) return `${diffMo}mo ago`;
  return `${Math.floor(diffMo / 12)}y ago`;
}

interface TreeNode {
  label: string;
  fullPath: string;
  children: Record<string, TreeNode>;
  tag?: Tag;
}

function buildTree(tags: Tag[]): TreeNode {
  const root: TreeNode = { label: '', fullPath: '', children: {} };
  for (const tag of tags) {
    const parts = tag.name.split('/');
    let node = root;
    let path = '';
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      path = path ? `${path}/${part}` : part;
      if (!node.children[part]) {
        node.children[part] = { label: part, fullPath: path, children: {} };
      }
      if (i === parts.length - 1) {
        node.children[part].tag = tag;
      }
      node = node.children[part];
    }
  }
  return root;
}

function countDescendantUsage(node: TreeNode): number {
  let count = node.tag?.usage_count ?? 0;
  for (const child of Object.values(node.children)) {
    count += countDescendantUsage(child);
  }
  return count;
}

interface TreeNodeViewProps {
  node: TreeNode;
  depth: number;
  filterText: string;
  onTagClick: (tagName: string) => void;
  onRename: (tag: Tag) => void;
  onDelete: (tag: Tag) => void;
}

function nodeMatchesFilter(node: TreeNode, filter: string): boolean {
  if (!filter) return true;
  if (node.fullPath.toLowerCase().includes(filter.toLowerCase())) return true;
  for (const child of Object.values(node.children)) {
    if (nodeMatchesFilter(child, filter)) return true;
  }
  return false;
}

function TreeNodeView({ node, depth, filterText, onTagClick, onRename, onDelete }: TreeNodeViewProps) {
  const hasChildren = Object.keys(node.children).length > 0;
  const [expanded, setExpanded] = useState(!!filterText || depth < 1);
  const [hovering, setHovering] = useState(false);
  const totalUsage = countDescendantUsage(node);

  useEffect(() => {
    if (filterText) setExpanded(true);
  }, [filterText]);

  if (!nodeMatchesFilter(node, filterText)) return null;

  return (
    <div>
      <div
        className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer group select-none"
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onClick={() => {
          if (hasChildren) setExpanded((e) => !e);
          onTagClick(node.fullPath);
        }}
      >
        {/* Expand/collapse arrow */}
        {hasChildren ? (
          <span className="text-gray-400 dark:text-gray-600 w-3 text-center flex-shrink-0 text-[10px]">
            {expanded ? '▾' : '▸'}
          </span>
        ) : (
          <span className="w-3 flex-shrink-0" />
        )}

        {/* Tag label */}
        <span className="flex-1 text-xs text-gray-700 dark:text-gray-300 truncate font-mono">
          {node.label}
        </span>

        {/* Usage count */}
        {totalUsage > 0 && (
          <span className="text-[10px] text-gray-400 dark:text-gray-600 flex-shrink-0 mr-1">
            {totalUsage}
          </span>
        )}

        {/* Rename / Delete buttons (only for leaf tags with an id) */}
        {node.tag && hovering && (
          <div className="flex gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              className="text-[10px] text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 px-1"
              title="Rename"
              onClick={() => onRename(node.tag!)}
            >
              ✎
            </button>
            <button
              className="text-[10px] text-gray-400 hover:text-red-500 dark:hover:text-red-400 px-1"
              title="Delete"
              onClick={() => onDelete(node.tag!)}
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div>
          {Object.values(node.children)
            .sort((a, b) => a.label.localeCompare(b.label))
            .map((child) => (
              <TreeNodeView
                key={child.fullPath}
                node={child}
                depth={depth + 1}
                filterText={filterText}
                onTagClick={onTagClick}
                onRename={onRename}
                onDelete={onDelete}
              />
            ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  onTagClick: (tagName: string) => void;
}

export function TagBrowser({ onTagClick }: Props) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [filterText, setFilterText] = useState('');
  const [renamingTag, setRenamingTag] = useState<Tag | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('name');

  const loadTags = useCallback(() => {
    window.electronAPI.tags.getAll().then(setTags);
  }, []);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  const handleTagClick = useCallback((tagName: string) => {
    const tag = tags.find(t => t.name === tagName);
    if (tag) {
      window.electronAPI.tags.recordSearch(tag.id).catch(() => {});
    }
    onTagClick(tagName);
  }, [onTagClick, tags]);

  const sortedFlatTags = useMemo(() => {
    if (sortMode === 'name') return [];
    const filtered = filterText
      ? tags.filter(t => t.name.toLowerCase().includes(filterText.toLowerCase()))
      : tags;
    return [...filtered].sort((a, b) => {
      if (sortMode === 'usage') return b.usage_count - a.usage_count;
      const key = sortMode === 'last_assigned' ? 'last_assigned_at' : 'last_searched_at';
      const aVal = a[key]; const bVal = b[key];
      if (!aVal && !bVal) return 0;
      if (!aVal) return 1;
      if (!bVal) return -1;
      return new Date(bVal).getTime() - new Date(aVal).getTime();
    });
  }, [tags, sortMode, filterText]);

  async function handleRename(tag: Tag) {
    setRenamingTag(tag);
    setRenameValue(tag.name);
  }

  async function confirmRename() {
    if (!renamingTag || !renameValue.trim() || renameValue.trim() === renamingTag.name) {
      setRenamingTag(null);
      return;
    }
    await window.electronAPI.tags.rename(renamingTag.name, renameValue.trim());
    setRenamingTag(null);
    loadTags();
  }

  async function handleDelete(tag: Tag) {
    if (!window.confirm(`Delete tag "${tag.name}"? It will be removed from all media (${tag.usage_count} items).`)) return;
    await window.electronAPI.tags.delete(tag.id);
    loadTags();
  }

  const tree = buildTree(tags);
  const rootChildren = Object.values(tree.children).sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="flex flex-col h-full">
      {/* Search box */}
      <div className="px-2 pt-2 pb-1 flex-shrink-0">
        <input
          type="text"
          className="w-full px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 placeholder-gray-400 outline-none focus:border-blue-400 dark:focus:border-blue-500"
          placeholder="Filter tags…"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
      </div>

      {/* Sort controls */}
      <div className="px-2 pb-1 flex gap-1 flex-wrap flex-shrink-0">
        {([
          ['name',          'Name ↑'],
          ['usage',         'Usage ↓'],
          ['last_assigned', 'Last Assigned ↓'],
          ['last_clicked',  'Last Clicked ↓'],
        ] as [SortMode, string][]).map(([mode, label]) => (
          <button
            key={mode}
            onClick={() => setSortMode(mode)}
            className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
              sortMode === mode
                ? 'bg-blue-600 text-white border-blue-600'
                : 'border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tag count */}
      <div className="px-3 pb-1 text-[10px] text-gray-400 dark:text-gray-600 flex-shrink-0">
        {tags.length} tag{tags.length !== 1 ? 's' : ''}
      </div>

      {/* Content: tree (name sort) or flat list (other sorts) */}
      <div className="flex-1 overflow-y-auto py-1">
        {sortMode === 'name' ? (
          rootChildren.length === 0 ? (
            <p className="px-3 text-xs text-gray-400 dark:text-gray-600 italic">No tags yet.</p>
          ) : (
            rootChildren.map((node) => (
              <TreeNodeView
                key={node.fullPath}
                node={node}
                depth={0}
                filterText={filterText}
                onTagClick={handleTagClick}
                onRename={handleRename}
                onDelete={handleDelete}
              />
            ))
          )
        ) : (
          sortedFlatTags.length === 0 ? (
            <p className="px-3 text-xs text-gray-400 dark:text-gray-600 italic">No tags yet.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-gray-500 dark:text-gray-600 border-b border-gray-100 dark:border-gray-800">
                  <th className="text-left px-3 py-1 font-normal">Tag</th>
                  <th className="text-right px-2 py-1 font-normal whitespace-nowrap">Last Assigned</th>
                  <th className="text-right px-2 py-1 font-normal whitespace-nowrap">Last Clicked</th>
                  <th className="text-right px-3 py-1 font-normal">Count</th>
                </tr>
              </thead>
              <tbody>
                {sortedFlatTags.map(tag => (
                  <tr
                    key={tag.id}
                    className="hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                    onClick={() => {
                      window.electronAPI.tags.recordSearch(tag.id).catch(() => {});
                      onTagClick(tag.name);
                    }}
                  >
                    <td className="px-3 py-0.5 text-gray-700 dark:text-gray-300 truncate max-w-[130px] font-mono">{tag.name}</td>
                    <td className="px-2 py-0.5 text-right text-gray-400 dark:text-gray-600 whitespace-nowrap">{formatRelativeTime(tag.last_assigned_at)}</td>
                    <td className="px-2 py-0.5 text-right text-gray-400 dark:text-gray-600 whitespace-nowrap">{formatRelativeTime(tag.last_searched_at)}</td>
                    <td className="px-3 py-0.5 text-right text-gray-400 dark:text-gray-600">{tag.usage_count > 0 ? tag.usage_count : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>

      {/* Rename modal */}
      {renamingTag && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setRenamingTag(null)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-lg shadow-xl p-4 w-80"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-3">Rename tag</p>
            <input
              autoFocus
              type="text"
              className="w-full px-2 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none focus:border-blue-400 mb-3 font-mono"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmRename();
                if (e.key === 'Escape') setRenamingTag(null);
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-1 text-xs rounded text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={() => setRenamingTag(null)}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white"
                onClick={confirmRename}
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
