import { useEffect, useRef, useState } from 'react';
import { useTabs } from '../../context/TabsContext';
import { logNavDebug } from '../../utils/debugNavigation';

export default function TabBar() {
  const { tabs, activeTabId, switchTab, closeTab, createTab } = useTabs();
  const [interceptorCount, setInterceptorCount] = useState(0);
  const prevActiveTabId = useRef<string>(activeTabId);

  // After every tab switch, give React one frame to apply display:none on the
  // old tab, then scan for fixed elements that are still intercepting clicks.
  useEffect(() => {
    if (tabs.length <= 1) { setInterceptorCount(0); return; }
    // Short delay so display:none propagates to computed styles before we scan
    const id = setTimeout(() => {
      const count = logNavDebug(activeTabId);
      setInterceptorCount(count);
    }, 100);
    prevActiveTabId.current = activeTabId;
    return () => clearTimeout(id);
  }, [activeTabId, tabs.length]);

  return (
    <div className="h-8 bg-white dark:bg-dark-surface border-b border-gray-200 dark:border-dark-border flex items-stretch titlebar-drag flex-shrink-0">
      {/* macOS traffic light spacer */}
      <div className="w-16 flex-shrink-0" />

      {/* Tab list */}
      <div className="flex items-stretch overflow-x-auto flex-1 min-w-0" style={{ scrollbarWidth: 'none' }}>
        {tabs.map((tab, idx) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              className={`
                titlebar-no-drag flex items-center gap-1 px-3 min-w-0 max-w-40 flex-shrink-0 cursor-pointer
                border-r border-gray-200 dark:border-dark-border select-none
                ${isActive
                  ? 'bg-gray-100 dark:bg-dark-hover text-gray-900 dark:text-gray-100'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-hover/50 hover:text-gray-700 dark:hover:text-gray-300'}
              `}
              title={`${tab.title} (⌘${idx + 1})`}
            >
              <span className="truncate text-xs font-medium flex-1 min-w-0">
                {tab.title}
              </span>
              {tabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className={`
                    flex-shrink-0 w-4 h-4 rounded flex items-center justify-center text-xs leading-none
                    hover:bg-gray-300 dark:hover:bg-gray-600
                    ${isActive ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}
                  `}
                  title="Close tab (⌘W)"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Nav-stuck warning indicator — only shown when interceptors detected */}
      {interceptorCount > 0 && (
        <button
          onClick={() => logNavDebug(activeTabId)}
          className="titlebar-no-drag flex-shrink-0 flex items-center gap-1 px-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          title={`⚠️ ${interceptorCount} fixed element(s) from inactive tabs may be blocking navigation — click to log details`}
        >
          <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[10px] font-mono font-bold">{interceptorCount}</span>
        </button>
      )}

      {/* New tab button */}
      <button
        onClick={() => createTab('/')}
        className="titlebar-no-drag flex-shrink-0 w-8 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
        title="New tab at home (⌘N)"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  );
}
