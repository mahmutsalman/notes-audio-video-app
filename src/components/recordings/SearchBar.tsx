import { useRef, useEffect } from 'react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  resultCount: number;
  totalCount: number;
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * Elegant search bar component with clear button and result counter
 */
export function SearchBar({
  value,
  onChange,
  resultCount,
  totalCount,
  placeholder = 'Search by name...',
  autoFocus = false,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus if requested
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Keyboard shortcut: Cmd/Ctrl + F
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleClear = () => {
    onChange('');
    inputRef.current?.focus();
  };

  const hasValue = value.length > 0;
  const hasQuery = value.trim().length > 0;

  return (
    <div className="w-full">
      {/* Search Input */}
      <div className="relative">
        {/* Search Icon */}
        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-lg">
          🔍
        </div>

        {/* Input Field */}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full h-10 pl-10 pr-10
                     bg-white dark:bg-dark-surface
                     border border-gray-300 dark:border-dark-border
                     rounded-lg
                     text-gray-900 dark:text-gray-100
                     placeholder-gray-400 dark:placeholder-gray-500
                     focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                     transition-all duration-200"
          aria-label="Search recordings"
        />

        {/* Clear Button */}
        {hasValue && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2
                       text-gray-400 dark:text-gray-500
                       hover:text-gray-600 dark:hover:text-gray-300
                       transition-colors duration-200
                       focus:outline-none focus:ring-2 focus:ring-primary-500 rounded
                       text-lg"
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {/* Result Counter */}
      {hasQuery && (
        <div className="mt-2 text-sm text-gray-500 dark:text-gray-400 text-center">
          {resultCount === 0 ? (
            <span>No recordings match "{value}"</span>
          ) : (
            <span>
              {resultCount} of {totalCount} recording{totalCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
