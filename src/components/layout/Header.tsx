import { useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { emitSyncCompleted } from '../../utils/events';
export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupStatus, setBackupStatus] = useState<{ show: boolean; success: boolean; message: string }>({
    show: false,
    success: false,
    message: '',
  });
  const hideBackupStatusTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isHome = location.pathname === '/';

  const showBackupStatus = (success: boolean, message: string) => {
    setBackupStatus({ show: true, success, message });
    if (hideBackupStatusTimeout.current) {
      clearTimeout(hideBackupStatusTimeout.current);
    }
    hideBackupStatusTimeout.current = setTimeout(() => {
      setBackupStatus(prev => ({ ...prev, show: false }));
    }, 3000);
  };

  const handleBackup = async () => {
    if (isBackingUp) return;

    setIsBackingUp(true);
    setBackupStatus({ show: false, success: false, message: '' });

    try {
      const result = await window.electronAPI.backup.create();

      if (result.success) {
        const sizeKB = result.stats ? Math.round(result.stats.totalSize / 1024) : 0;
        const backupRoot = await window.electronAPI.backup.getPath();
        showBackupStatus(true, `Backup created (${sizeKB} KB). Location: ${backupRoot}`);
      } else {
        showBackupStatus(false, result.error || 'Backup failed');
      }
    } catch (error) {
      showBackupStatus(false, error instanceof Error ? error.message : 'Backup failed');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleOpenBackupFolder = async () => {
    try {
      const backupRoot = await window.electronAPI.backup.getPath();
      await window.electronAPI.backup.openFolder();
      showBackupStatus(true, `Backup location: ${backupRoot}`);
    } catch (error) {
      showBackupStatus(false, error instanceof Error ? error.message : 'Failed to open backup folder');
    }
  };

  const cycleTheme = () => {
    if (theme === 'system') {
      setTheme('light');
    } else if (theme === 'light') {
      setTheme('dark');
    } else {
      setTheme('system');
    }
  };

  const getThemeIcon = () => {
    if (theme === 'system') {
      return '💻';
    }
    return resolvedTheme === 'dark' ? '🌙' : '☀️';
  };

  return (
    <header className="h-12 bg-white dark:bg-dark-surface border-b border-gray-200 dark:border-dark-border flex items-center px-4">
      {/* Traffic light spacing for macOS */}
      <div className="w-16 flex-shrink-0" />

      {/* Back button */}
      {!isHome && (
        <button
          onClick={() => navigate(-1)}
          className="titlebar-no-drag p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors mr-2"
          title="Go back"
        >
          <svg
            className="w-5 h-5 text-gray-600 dark:text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
      )}

      {/* Title */}
      <h1
        className="text-lg font-semibold text-gray-900 dark:text-gray-100 cursor-pointer titlebar-no-drag"
        onClick={() => navigate('/')}
      >
        Notes with Audio & Video
      </h1>

      {/* Study button */}
      <button
        onClick={() => navigate('/study')}
        className={`titlebar-no-drag p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors ml-2 ${
          location.pathname === '/study' ? 'bg-gray-100 dark:bg-dark-hover' : ''
        }`}
        title="Study View — marks with audio"
      >
        <svg
          className="w-5 h-5 text-gray-600 dark:text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
          />
        </svg>
      </button>

      {/* Search button */}
      <button
        onClick={() => navigate('/search')}
        className={`titlebar-no-drag p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors ml-2 ${
          location.pathname === '/search' ? 'bg-gray-100 dark:bg-dark-hover' : ''
        }`}
        title="Search (⌘K)"
      >
        <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </button>

      {/* Quick Capture button */}
      <button
        onClick={() => navigate('/capture')}
        className={`titlebar-no-drag p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors ml-2 ${
          location.pathname === '/capture' ? 'bg-gray-100 dark:bg-dark-hover' : ''
        }`}
        title="Quick Capture — paste images, record audio"
      >
        <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </button>

      {/* Plans button */}
      <button
        onClick={() => navigate('/plans')}
        className={`titlebar-no-drag p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors ml-2 ${
          location.pathname === '/plans' ? 'bg-gray-100 dark:bg-dark-hover' : ''
        }`}
        title="Plans — all plans across recordings"
      >
        <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Backup status toast */}
      {backupStatus.show && (
        <div
          className={`mr-2 px-3 py-1 rounded-lg text-sm font-medium transition-opacity ${
            backupStatus.success
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
              : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
          }`}
        >
          {backupStatus.message}
        </div>
      )}

      {/* Backup button */}
      <button
        onClick={handleBackup}
        disabled={isBackingUp}
        className="titlebar-no-drag p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors disabled:opacity-50 mr-1"
        title="Backup data"
      >
        {isBackingUp ? (
          <svg
            className="w-5 h-5 text-gray-600 dark:text-gray-400 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : (
          <svg
            className="w-5 h-5 text-gray-600 dark:text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
          </svg>
        )}
      </button>

      {/* Open backup folder button */}
      <button
        onClick={handleOpenBackupFolder}
        className="titlebar-no-drag p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors mr-1"
        title="Open backup folder"
      >
        <svg
          className="w-5 h-5 text-gray-600 dark:text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
          />
        </svg>
      </button>

      {/* Theme toggle */}
      <button
        onClick={cycleTheme}
        className="titlebar-no-drag p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
        title={`Theme: ${theme}`}
      >
        <span className="text-lg">{getThemeIcon()}</span>
      </button>
    </header>
  );
}
