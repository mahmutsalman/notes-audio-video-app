import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme, resolvedTheme } = useTheme();

  const isHome = location.pathname === '/';

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
    <header className="h-12 bg-white dark:bg-dark-surface border-b border-gray-200 dark:border-dark-border flex items-center px-4 titlebar-drag">
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

      {/* Spacer */}
      <div className="flex-1" />

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
