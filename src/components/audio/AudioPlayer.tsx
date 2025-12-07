import { useRef, useState, useEffect } from 'react';
import { formatDuration } from '../../utils/formatters';

interface AudioPlayerProps {
  src: string;
  duration?: number;  // Optional: pass duration explicitly for blob URLs
}

export default function AudioPlayer({ src, duration: propDuration }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [metadataDuration, setMetadataDuration] = useState(0);

  // Use prop duration if provided (for blob URLs), otherwise use metadata
  const duration = propDuration ?? metadataDuration;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => {
      // Only use metadata duration if it's valid (not NaN, Infinity)
      if (Number.isFinite(audio.duration)) {
        setMetadataDuration(audio.duration);
      }
    };
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const time = parseFloat(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      onClick={togglePlay}
      className="flex items-center gap-4 p-4 rounded-lg cursor-pointer select-none
                 bg-gray-100 dark:bg-dark-hover
                 shadow-[0_4px_0_0_rgba(0,0,0,0.15)] dark:shadow-[0_4px_0_0_rgba(0,0,0,0.4)]
                 active:translate-y-1 active:shadow-none
                 transition-all duration-75"
    >
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Play/Pause button */}
      <div
        className="w-12 h-12 bg-primary-600 text-white rounded-full
                   flex items-center justify-center text-xl
                   flex-shrink-0"
      >
        {isPlaying ? '⏸️' : '▶️'}
      </div>

      {/* Progress and time */}
      <div className="flex-1 min-w-0">
        {/* Progress bar */}
        <div className="relative h-2 bg-gray-200 dark:bg-dark-border rounded-full overflow-hidden mb-1">
          <div
            className="absolute h-full bg-primary-600 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
          <input
            type="range"
            min="0"
            max={duration || 0}
            value={currentTime}
            onChange={handleSeek}
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>

        {/* Time display */}
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>{formatDuration(Math.floor(currentTime))}</span>
          <span>{formatDuration(Math.floor(duration))}</span>
        </div>
      </div>
    </div>
  );
}
