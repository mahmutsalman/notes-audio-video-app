import { useNavigate } from 'react-router-dom';
import type { SearchNavState } from '../../types';

interface SearchNavBannerProps {
  searchNav: SearchNavState;
}

export default function SearchNavBanner({ searchNav }: SearchNavBannerProps) {
  const navigate = useNavigate();
  const { results, currentIndex, query } = searchNav;
  const total = results.length;

  const goTo = (index: number) => {
    const result = results[index];
    if (!result?.recording_id) return;
    navigate(`/recording/${result.recording_id}`, {
      state: { searchNav: { results, currentIndex: index, query } },
    });
  };

  const goBack = () => {
    navigate(`/search?q=${encodeURIComponent(query)}`);
  };

  const canPrev = currentIndex > 0;
  const canNext = currentIndex < total - 1;

  return (
    <div className="sticky top-0 z-20 bg-blue-600 dark:bg-blue-700 text-white flex items-center gap-2 px-4 py-2 text-sm shadow-md">
      <button
        onClick={goBack}
        className="flex items-center gap-1.5 hover:text-blue-200 transition-colors font-medium shrink-0"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Search
      </button>

      <span className="text-blue-300 mx-1">|</span>
      <span className="text-blue-100 shrink-0">{currentIndex + 1} of {total}</span>

      <div className="flex-1" />

      <button
        onClick={() => canPrev && goTo(currentIndex - 1)}
        disabled={!canPrev}
        className="flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="Previous result"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Prev
      </button>
      <button
        onClick={() => canNext && goTo(currentIndex + 1)}
        disabled={!canNext}
        className="flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="Next result"
      >
        Next
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}
