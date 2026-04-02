import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';

export interface Tab {
  id: string;
  title: string;
  currentPath: string;
  initialPath: string;
}

interface TabsState {
  tabs: Tab[];
  activeTabId: string;
}

interface TabsContextValue {
  tabs: Tab[];
  activeTabId: string;
  createTab: (initialPath?: string) => void;
  closeTab: (id: string) => void;
  switchTab: (id: string) => void;
  updateTabTitle: (tabId: string, title: string) => void;
  updateTabPath: (tabId: string, path: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

interface TabInstanceContextValue {
  tabId: string;
}
const TabInstanceContext = createContext<TabInstanceContextValue>({ tabId: '' });

let _nextTabId = 1;
function generateTabId() {
  return `tab-${_nextTabId++}`;
}

export function pathToTitle(path: string): string {
  if (path === '/') return 'Topics';
  if (path.startsWith('/search')) return 'Search';
  if (path.startsWith('/study')) return 'Study';
  if (path.startsWith('/capture')) return 'Capture';
  if (path.startsWith('/topic/')) return 'Topic';
  if (path.startsWith('/recording/')) return 'Recording';
  return 'Notes';
}

function makeTab(initialPath = '/'): Tab {
  return {
    id: generateTabId(),
    title: pathToTitle(initialPath),
    currentPath: initialPath,
    initialPath,
  };
}

export function TabsProvider({ children }: { children: ReactNode }) {
  const [{ tabs, activeTabId }, setState] = useState<TabsState>(() => {
    const initialTab = makeTab('/');
    return { tabs: [initialTab], activeTabId: initialTab.id };
  });

  const createTab = useCallback((initialPath = '/') => {
    const tab = makeTab(initialPath);
    setState(prev => ({ tabs: [...prev.tabs, tab], activeTabId: tab.id }));
  }, []);

  const closeTab = useCallback((id: string) => {
    setState(prev => {
      if (prev.tabs.length <= 1) return prev;
      const idx = prev.tabs.findIndex(t => t.id === id);
      const nextTabs = prev.tabs.filter(t => t.id !== id);
      const nextActiveId = prev.activeTabId === id
        ? nextTabs[Math.min(idx, nextTabs.length - 1)].id
        : prev.activeTabId;
      return { tabs: nextTabs, activeTabId: nextActiveId };
    });
  }, []);

  const switchTab = useCallback((id: string) => {
    setState(prev => ({ ...prev, activeTabId: id }));
  }, []);

  const updateTabTitle = useCallback((tabId: string, title: string) => {
    setState(prev => ({
      ...prev,
      tabs: prev.tabs.map(t => t.id === tabId ? { ...t, title } : t),
    }));
  }, []);

  const updateTabPath = useCallback((tabId: string, path: string) => {
    setState(prev => ({
      ...prev,
      tabs: prev.tabs.map(t => t.id === tabId ? { ...t, currentPath: path } : t),
    }));
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;

      // Cmd+T → duplicate current tab at its current path
      if (e.key === 't' && !e.shiftKey) {
        e.preventDefault();
        setState(prev => {
          const active = prev.tabs.find(t => t.id === prev.activeTabId);
          const path = active?.currentPath ?? '/';
          const tab = makeTab(path);
          return { tabs: [...prev.tabs, tab], activeTabId: tab.id };
        });
        return;
      }

      // Cmd+N → new tab at home
      if (e.key === 'n' && !e.shiftKey) {
        e.preventDefault();
        createTab('/');
        return;
      }

      // Cmd+W → close current tab (only if >1 tab), prevent Electron window close
      if (e.key === 'w' && !e.shiftKey) {
        setState(prev => {
          if (prev.tabs.length <= 1) return prev;
          e.preventDefault();
          const idx = prev.tabs.findIndex(t => t.id === prev.activeTabId);
          const nextTabs = prev.tabs.filter(t => t.id !== prev.activeTabId);
          const nextActiveId = nextTabs[Math.min(idx, nextTabs.length - 1)].id;
          return { tabs: nextTabs, activeTabId: nextActiveId };
        });
        return;
      }

      // Cmd+1..9 → switch to tab by index
      const numKey = parseInt(e.key, 10);
      if (!isNaN(numKey) && numKey >= 1 && numKey <= 9 && !e.shiftKey) {
        e.preventDefault();
        setState(prev => {
          const target = prev.tabs[numKey - 1];
          if (!target) return prev;
          return { ...prev, activeTabId: target.id };
        });
        return;
      }

      // Cmd+Shift+] → next tab
      if (e.key === ']' && e.shiftKey) {
        e.preventDefault();
        setState(prev => {
          const idx = prev.tabs.findIndex(t => t.id === prev.activeTabId);
          const next = prev.tabs[(idx + 1) % prev.tabs.length];
          return { ...prev, activeTabId: next.id };
        });
        return;
      }

      // Cmd+Shift+[ → prev tab
      if (e.key === '[' && e.shiftKey) {
        e.preventDefault();
        setState(prev => {
          const idx = prev.tabs.findIndex(t => t.id === prev.activeTabId);
          const prev2 = prev.tabs[(idx - 1 + prev.tabs.length) % prev.tabs.length];
          return { ...prev, activeTabId: prev2.id };
        });
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [createTab]);

  return (
    <TabsContext.Provider value={{ tabs, activeTabId, createTab, closeTab, switchTab, updateTabTitle, updateTabPath }}>
      {children}
    </TabsContext.Provider>
  );
}

export function TabInstanceProvider({ tabId, children }: { tabId: string; children: ReactNode }) {
  const value = useMemo(() => ({ tabId }), [tabId]);
  return (
    <TabInstanceContext.Provider value={value}>
      {children}
    </TabInstanceContext.Provider>
  );
}

export function useTabs(): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('useTabs must be used within TabsProvider');
  return ctx;
}

export function useTabInstance(): TabInstanceContextValue {
  return useContext(TabInstanceContext);
}

/** Returns true only when this tab is the currently active (visible) tab. */
export function useIsActiveTab(): boolean {
  const { tabId } = useTabInstance();
  const { activeTabId } = useTabs();
  return tabId === activeTabId;
}
