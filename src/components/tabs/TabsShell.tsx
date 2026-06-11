import { useEffect, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { useTabs, TabInstanceProvider } from '../../context/TabsContext';
import TabBar from './TabBar';
import App from '../../App';

// Each mounted tab is a full App instance (router, pages, hooks, listeners).
// Keeping every tab mounted behind display:none made CPU/memory grow without
// bound as tabs accumulated, so only the most recently used tabs stay alive.
// Evicted tabs keep their entry in the tab bar and remount at currentPath.
const MAX_MOUNTED_TABS = 3;

export default function TabsShell() {
  const { tabs, activeTabId } = useTabs();

  const [recentTabIds, setRecentTabIds] = useState<string[]>([activeTabId]);
  useEffect(() => {
    setRecentTabIds(prev => [activeTabId, ...prev.filter(id => id !== activeTabId)]);
  }, [activeTabId]);

  const liveRecentIds = [
    activeTabId,
    ...recentTabIds.filter(id => id !== activeTabId && tabs.some(t => t.id === id)),
  ];
  const mountedIds = new Set(liveRecentIds.slice(0, MAX_MOUNTED_TABS));

  return (
    <div className="flex flex-col h-screen">
      <TabBar />
      <div className="flex-1 min-h-0 relative">
        {tabs.map(tab => mountedIds.has(tab.id) && (
          <div
            key={tab.id}
            data-tab-id={tab.id}
            className="absolute inset-0 flex flex-col"
            style={tab.id !== activeTabId ? { display: 'none' } : undefined}
          >
            <TabInstanceProvider tabId={tab.id}>
              <MemoryRouter initialEntries={[tab.currentPath || tab.initialPath]}>
                <App />
              </MemoryRouter>
            </TabInstanceProvider>
          </div>
        ))}
      </div>
    </div>
  );
}
