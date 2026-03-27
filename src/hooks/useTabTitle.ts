import { useEffect } from 'react';
import { useTabInstance, useTabs } from '../context/TabsContext';

export function useTabTitle(title: string) {
  const { tabId } = useTabInstance();
  const { updateTabTitle } = useTabs();
  useEffect(() => {
    if (title) updateTabTitle(tabId, title);
  }, [title, tabId, updateTabTitle]);
}
