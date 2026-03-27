import { MemoryRouter } from 'react-router-dom';
import { useTabs, TabInstanceProvider } from '../../context/TabsContext';
import TabBar from './TabBar';
import App from '../../App';

export default function TabsShell() {
  const { tabs, activeTabId } = useTabs();

  return (
    <div className="flex flex-col h-screen">
      <TabBar />
      <div className="flex-1 min-h-0 relative">
        {tabs.map(tab => (
          <div
            key={tab.id}
            style={{ display: tab.id === activeTabId ? 'flex' : 'none' }}
            className="flex-col h-full"
          >
            <TabInstanceProvider tabId={tab.id}>
              <MemoryRouter initialEntries={[tab.initialPath]}>
                <App />
              </MemoryRouter>
            </TabInstanceProvider>
          </div>
        ))}
      </div>
    </div>
  );
}
