import { useImageAudioPlayer } from '../../context/ImageAudioPlayerContext';
import ThemedAudioPlayer from './ThemedAudioPlayer';

export default function ImageAudioPlayerBar() {
  const { currentAudio, imageLabel, dismiss } = useImageAudioPlayer();

  if (!currentAudio) return null;

  const src = window.electronAPI.paths.getFileUrl(currentAudio.file_path);
  const label = currentAudio.caption || imageLabel;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-gray-900 dark:bg-gray-950 border-t border-blue-700/50 shadow-2xl">
      <div className="flex items-center gap-3 px-4 py-2 max-w-screen-2xl mx-auto">
        {/* Icon + label */}
        <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
          <span className="text-blue-400 text-base">🔊</span>
          <span className="text-sm text-blue-300 truncate max-w-[200px]" title={label}>
            {label}
          </span>
        </div>

        {/* Player */}
        <div className="flex-1 min-w-0">
          <ThemedAudioPlayer src={src} theme="blue" />
        </div>

        {/* Dismiss */}
        <button
          onClick={dismiss}
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full
                     bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white
                     transition-colors text-xs"
          title="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
