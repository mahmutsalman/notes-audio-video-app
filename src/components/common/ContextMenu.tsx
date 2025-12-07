import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ImportanceColor } from '../../types';
import { IMPORTANCE_COLORS, IMPORTANCE_COLOR_ORDER } from '../../utils/importance';

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  icon?: string;
  danger?: boolean;
}

export interface ContextMenuColorItem {
  type: 'color-picker';
  label: string;
  value: ImportanceColor;
  onChange: (color: ImportanceColor) => void;
}

export type ContextMenuItemType = ContextMenuItem | ContextMenuColorItem;

function isColorPickerItem(item: ContextMenuItemType): item is ContextMenuColorItem {
  return 'type' in item && item.type === 'color-picker';
}

interface ContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  items: ContextMenuItemType[];
  onClose: () => void;
}

export default function ContextMenu({
  isOpen,
  position,
  items,
  onClose,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside or Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    // Small delay to prevent immediate close from the same click that opened it
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);
    document.addEventListener('keydown', handleEscape);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  // Adjust position to keep menu in viewport
  useEffect(() => {
    if (!isOpen || !menuRef.current) return;

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Adjust if menu goes off right edge
    if (position.x + rect.width > viewportWidth) {
      menu.style.left = `${viewportWidth - rect.width - 8}px`;
    }

    // Adjust if menu goes off bottom edge
    if (position.y + rect.height > viewportHeight) {
      menu.style.top = `${viewportHeight - rect.height - 8}px`;
    }
  }, [isOpen, position]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[140px] py-1 bg-white dark:bg-dark-surface
                 rounded-lg shadow-lg border border-gray-200 dark:border-dark-border
                 animate-in fade-in zoom-in-95 duration-100"
      style={{ top: position.y, left: position.x }}
    >
      {items.map((item, index) => {
        if (isColorPickerItem(item)) {
          return (
            <div
              key={index}
              className="px-4 py-2 flex items-center gap-3"
            >
              <div className="flex items-center gap-1.5">
                {IMPORTANCE_COLOR_ORDER.map((colorKey) => {
                  const colorConfig = IMPORTANCE_COLORS[colorKey];
                  const isSelected = item.value === colorKey;
                  return (
                    <button
                      key={colorKey}
                      onClick={() => {
                        item.onChange(colorKey);
                        onClose();
                      }}
                      className={`w-5 h-5 rounded-full ${colorConfig.bg} transition-all
                                 hover:scale-110 hover:ring-2 hover:ring-offset-1 hover:ring-offset-dark-surface
                                 ${isSelected ? 'ring-2 ring-offset-1 ring-offset-dark-surface ring-white/50' : ''}`}
                      title={colorConfig.label}
                    />
                  );
                })}
                {/* Clear button */}
                <button
                  onClick={() => {
                    item.onChange(null);
                    onClose();
                  }}
                  className={`w-5 h-5 rounded-full border-2 border-gray-400 dark:border-gray-500
                             flex items-center justify-center transition-all
                             hover:scale-110 hover:border-gray-300
                             ${item.value === null ? 'border-white/50' : ''}`}
                  title="Clear"
                >
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">×</span>
                </button>
              </div>
              <span className="text-sm text-gray-500 dark:text-gray-400">{item.label}</span>
            </div>
          );
        }

        return (
          <button
            key={index}
            onClick={() => {
              item.onClick();
              onClose();
            }}
            className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2
                       transition-colors
                       ${item.danger
                         ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                         : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-hover'
                       }`}
          >
            {item.icon && <span>{item.icon}</span>}
            {item.label}
          </button>
        );
      })}
    </div>,
    document.body
  );
}
