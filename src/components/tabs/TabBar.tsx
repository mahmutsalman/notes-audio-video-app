import { useTabs } from '../../context/TabsContext';

export default function TabBar() {
  const { tabs, activeTabId, switchTab, closeTab, createTab } = useTabs();

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

      {/* New tab button */}
      <button
        onClick={() => createTab('/')}
        className="titlebar-no-drag flex-shrink-0 w-8 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
        title="New tab (⌘T)"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  );
}
