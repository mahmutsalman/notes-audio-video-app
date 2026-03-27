import type { MediaTagType } from '../../types';
import { TagAutocomplete } from './TagAutocomplete';

interface Props {
  mediaType: MediaTagType;
  mediaId: number;
  title?: string;
  onClose: () => void;
}

export function TagModal({ mediaType, mediaId, title, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-[380px] max-w-[90vw] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            🏷️ {title ?? 'Tags'}
          </p>
          <button
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <TagAutocomplete
          mediaType={mediaType}
          mediaId={mediaId}
          key={`${mediaType}-${mediaId}`}
        />
        <p className="mt-3 text-[10px] text-gray-400 dark:text-gray-600">
          Use <span className="font-mono">/</span> for hierarchy — e.g. <span className="font-mono">java/inheritance/example1</span>
        </p>
      </div>
    </div>
  );
}
