import { ReactNode } from 'react';
import Header from './Header';

interface MainLayoutProps {
  children: ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg flex flex-col">
      <Header />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
