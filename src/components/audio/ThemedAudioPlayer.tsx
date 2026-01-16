import { useState, useRef, useEffect } from 'react';
import { formatDuration } from '../../utils/formatters';

const SPEED_PRESETS = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;

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
  const speedMenuRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // Theme colors
  const colors = theme === 'violet'
    ? {
        bg: 'bg-violet-900/40',
        border: 'border-violet-700/50',
        progressBg: 'bg-violet-800/50',
        progressFill: 'bg-violet-400',
        buttonBg: 'bg-violet-500/30 hover:bg-violet-500/50 border border-violet-400/50',
        text: 'text-violet-200',
      }
    : {
        bg: 'bg-blue-900/40',
        border: 'border-blue-700/50',
        progressBg: 'bg-blue-800/50',
        progressFill: 'bg-blue-400',
        buttonBg: 'bg-blue-500/30 hover:bg-blue-500/50 border border-blue-400/50',
        text: 'text-blue-200',
      };

  // Apply playback rate to audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Handle click outside to close speed menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(event.target as Node)) {
        setShowSpeedMenu(false);
      }
    };

    if (showSpeedMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSpeedMenu]);

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

        {/* Speed control */}
        <div className="relative" ref={speedMenuRef}>
          <button
            onClick={() => setShowSpeedMenu(!showSpeedMenu)}
            className={`px-1.5 py-0.5 ${colors.buttonBg} text-white rounded text-[10px] font-medium
                       transition-all hover:scale-105 active:scale-95 min-w-[32px]`}
          >
            {playbackRate}x
          </button>

          {/* Speed dropdown menu */}
          {showSpeedMenu && (
            <div
              className={`absolute bottom-full right-0 mb-1 ${colors.bg} border ${colors.border}
                         rounded-md shadow-lg overflow-hidden z-50 min-w-[60px]`}
            >
              {SPEED_PRESETS.map((speed) => (
                <button
                  key={speed}
                  onClick={() => {
                    setPlaybackRate(speed);
                    setShowSpeedMenu(false);
                  }}
                  className={`w-full px-2 py-1 text-[10px] text-left transition-colors flex items-center justify-between
                             ${playbackRate === speed
                               ? `${colors.progressFill} text-white`
                               : `${colors.text} hover:bg-white/10`
                             }`}
                >
                  <span>{speed}x</span>
                  {playbackRate === speed && (
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
