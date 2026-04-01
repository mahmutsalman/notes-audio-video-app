import { useState, useCallback, useRef } from 'react';
import type { SearchCondition, SearchConditionType, FilteredSearchParams } from '../../types';
import { IMAGE_COLOR_KEYS, IMAGE_COLORS } from '../../utils/imageColors';

interface SearchConditionBuilderProps {
  onChange: (params: FilteredSearchParams | null) => void;
}

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

interface ConditionRowProps {
  condition: SearchCondition;
  onUpdate: (id: string, patch: Partial<SearchCondition>) => void;
  onRemove: (id: string) => void;
}

function ConditionRow({ condition, onUpdate, onRemove }: ConditionRowProps) {
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTagInput = (value: string) => {
    onUpdate(condition.id, { value });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) { setTagSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      const tags = await window.electronAPI.tags.search(value);
      setTagSuggestions(tags.map((t: { name: string }) => t.name));
      setShowSuggestions(true);
    }, 200);
  };

  const handleTypeChange = (type: SearchConditionType) => {
    onUpdate(condition.id, { type, value: '' });
    setTagSuggestions([]);
  };

  return (
    <div className="flex items-start gap-2 p-2 bg-gray-50 dark:bg-dark-hover rounded-lg">
      {/* Type selector */}
      <select
        value={condition.type}
        onChange={(e) => handleTypeChange(e.target.value as SearchConditionType)}
        className="text-xs bg-white dark:bg-dark-surface border border-gray-300 dark:border-gray-600 rounded px-1.5 py-1 text-gray-700 dark:text-gray-200 flex-shrink-0"
      >
        <option value="text">Text</option>
        <option value="tag">Tag</option>
        <option value="color">Color</option>
      </select>

      {/* Value input */}
      <div className="flex-1 min-w-0 relative">
        {condition.type === 'text' && (
          <input
            type="text"
            value={condition.value}
            onChange={(e) => onUpdate(condition.id, { value: e.target.value })}
            placeholder="Search text…"
            className="w-full text-xs bg-white dark:bg-dark-surface border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-blue-500"
          />
        )}

        {condition.type === 'tag' && (
          <div className="relative">
            <input
              type="text"
              value={condition.value}
              onChange={(e) => handleTagInput(e.target.value)}
              onFocus={() => condition.value && setShowSuggestions(tagSuggestions.length > 0)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Tag name…"
              className="w-full text-xs bg-white dark:bg-dark-surface border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-blue-500"
            />
            {showSuggestions && tagSuggestions.length > 0 && (
              <div className="absolute top-full mt-0.5 left-0 right-0 z-50 bg-white dark:bg-dark-surface border border-gray-200 dark:border-gray-600 rounded shadow-lg max-h-32 overflow-y-auto">
                {tagSuggestions.map(name => (
                  <button
                    key={name}
                    onMouseDown={() => { onUpdate(condition.id, { value: name }); setShowSuggestions(false); }}
                    className="w-full text-left px-2 py-1 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-dark-hover"
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {condition.type === 'color' && (
          <div className="flex gap-1.5 flex-wrap py-0.5">
            {IMAGE_COLOR_KEYS.map(key => {
              const isActive = condition.value === key;
              return (
                <button
                  key={key}
                  onClick={() => onUpdate(condition.id, { value: isActive ? '' : key })}
                  title={IMAGE_COLORS[key].label}
                  className={`w-5 h-5 rounded-full border-2 flex-shrink-0 transition-all ${isActive ? 'border-white scale-110' : 'border-transparent opacity-70 hover:opacity-100'}`}
                  style={{ backgroundColor: IMAGE_COLORS[key].hex }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Remove button */}
      <button
        onClick={() => onRemove(condition.id)}
        className="flex-shrink-0 w-5 h-5 text-gray-400 hover:text-red-400 text-sm leading-none flex items-center justify-center"
        title="Remove condition"
      >
        ×
      </button>
    </div>
  );
}

export default function SearchConditionBuilder({ onChange }: SearchConditionBuilderProps) {
  const [conditions, setConditions] = useState<SearchCondition[]>([]);
  const [op, setOp] = useState<'AND' | 'OR'>('AND');

  const notify = useCallback((conds: SearchCondition[], operator: 'AND' | 'OR') => {
    const active = conds.filter(c => c.value.trim());
    onChange(active.length > 0 ? { conditions: active, op: operator } : null);
  }, [onChange]);

  const addCondition = () => {
    const newCond: SearchCondition = { id: makeId(), type: 'text', value: '' };
    const next = [...conditions, newCond];
    setConditions(next);
    notify(next, op);
  };

  const updateCondition = (id: string, patch: Partial<SearchCondition>) => {
    const next = conditions.map(c => c.id === id ? { ...c, ...patch } : c);
    setConditions(next);
    notify(next, op);
  };

  const removeCondition = (id: string) => {
    const next = conditions.filter(c => c.id !== id);
    setConditions(next);
    notify(next, op);
  };

  const setOperator = (newOp: 'AND' | 'OR') => {
    setOp(newOp);
    notify(conditions, newOp);
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Header row: AND/OR + Add button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Match:</span>
          <button
            onClick={() => setOperator('AND')}
            className={`text-xs px-2.5 py-1 rounded border transition-colors ${op === 'AND' ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-500'}`}
          >
            ALL (AND)
          </button>
          <button
            onClick={() => setOperator('OR')}
            className={`text-xs px-2.5 py-1 rounded border transition-colors ${op === 'OR' ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-500'}`}
          >
            ANY (OR)
          </button>
        </div>
        <button
          onClick={addCondition}
          className="text-xs text-blue-500 hover:text-blue-400 font-medium"
        >
          + Add Condition
        </button>
      </div>

      {/* Condition rows */}
      {conditions.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 italic text-center py-2">
          No conditions yet — click "Add Condition" to start
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {conditions.map(cond => (
            <ConditionRow
              key={cond.id}
              condition={cond}
              onUpdate={updateCondition}
              onRemove={removeCondition}
            />
          ))}
        </div>
      )}
    </div>
  );
}
