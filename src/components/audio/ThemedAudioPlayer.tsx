import { useState, useRef } from 'react';
import { formatDuration } from '../../utils/formatters';

interface ThemedAudioPlayerProps {
  src: string;
  theme?: 'violet' | 'blue';
  className?: string;
}

export default function ThemedAudioPlayer({
  src,
  theme = 'violet',
  className = '',
}: ThemedAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  // Theme colors
  const colors = theme === 'violet'
    ? {
        bg: 'bg-violet-900/40',
        border: 'border-violet-700/50',
        progressBg: 'bg-violet-800/50',
        progressFill: 'bg-violet-400',
        buttonBg: 'bg-violet-500 hover:bg-violet-600',
        text: 'text-violet-200',
      }
    : {
        bg: 'bg-blue-900/40',
        border: 'border-blue-700/50',
        progressBg: 'bg-blue-800/50',
        progressFill: 'bg-blue-400',
        buttonBg: 'bg-blue-500 hover:bg-blue-600',
        text: 'text-blue-200',
      };

  // Handle play/pause
  const togglePlay = async () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      await audioRef.current.play();
    }
  };

  // Handle time update
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  // Handle loaded metadata
  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      setIsLoaded(true);
    }
  };

  // Handle seek
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    audioRef.current.currentTime = percentage * duration;
  };

  // Handle ended
  const handleEnded = () => {
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  };

  // Progress percentage
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`rounded-md ${colors.bg} border ${colors.border} px-2.5 py-1.5 ${className}`}>
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={handleEnded}
        preload="metadata"
      />

      <div className="flex items-center gap-2">
        {/* Play/Pause button */}
        <button
          onClick={togglePlay}
          disabled={!isLoaded}
          className={`w-7 h-7 ${colors.buttonBg} text-white rounded-full
                     flex items-center justify-center transition-all
                     disabled:opacity-50 disabled:cursor-not-allowed
                     shadow hover:scale-105 active:scale-95`}
        >
          {isPlaying ? (
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg className="w-3 h-3 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Progress bar */}
        <div
          className={`flex-1 h-1.5 ${colors.progressBg} rounded-full cursor-pointer overflow-hidden`}
          onClick={handleSeek}
        >
          <div
            className={`h-full ${colors.progressFill} rounded-full transition-all duration-100`}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Time display */}
        <div className={`text-[10px] font-mono ${colors.text} whitespace-nowrap min-w-[60px] text-right`}>
          {formatDuration(Math.floor(currentTime))} / {formatDuration(Math.floor(duration))}
        </div>
      </div>
    </div>
  );
}
