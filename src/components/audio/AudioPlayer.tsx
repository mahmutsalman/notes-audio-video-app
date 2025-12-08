import { useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { formatDuration } from '../../utils/formatters';

interface AudioPlayerProps {
  src: string;
  duration?: number;  // Optional: pass duration explicitly for blob URLs
}

export interface LoopRegion {
  start: number;
  end: number;
}

const SPEED_PRESETS = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;

export interface AudioPlayerHandle {
  toggle: () => void;
  setPressed: (pressed: boolean) => void;
  setLoopRegion: (start: number, end: number) => void;
  clearLoopRegion: () => void;
  isLooping: boolean;
}

const AudioPlayer = forwardRef<AudioPlayerHandle, AudioPlayerProps>(
  function AudioPlayer({ src, duration: propDuration }, ref) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [metadataDuration, setMetadataDuration] = useState(0);
  const [loopRegion, setLoopRegionState] = useState<LoopRegion | null>(null);
  const [playbackRate, setPlaybackRateState] = useState(1);

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

  // Loop region boundary checking
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !loopRegion) return;

    const handleTimeUpdate = () => {
      if (audio.currentTime >= loopRegion.end) {
        audio.currentTime = loopRegion.start;
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    return () => audio.removeEventListener('timeupdate', handleTimeUpdate);
  }, [loopRegion]);

  // Set loop region and start playing from start
  const setLoopRegion = (start: number, end: number) => {
    const audio = audioRef.current;
    setLoopRegionState({ start, end });
    if (audio) {
      audio.currentTime = start;
      audio.play();
      setIsPlaying(true);
    }
  };

  // Clear loop region and stop playing
  const clearLoopRegion = () => {
    const audio = audioRef.current;
    setLoopRegionState(null);
    if (audio) {
      audio.pause();
      setIsPlaying(false);
    }
  };

  // Cycle through playback speeds
  const cycleSpeed = () => {
    const currentIndex = SPEED_PRESETS.indexOf(playbackRate as typeof SPEED_PRESETS[number]);
    const nextIndex = (currentIndex + 1) % SPEED_PRESETS.length;
    const newRate = SPEED_PRESETS[nextIndex];
    setPlaybackRateState(newRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = newRate;
    }
  };

  // Expose controls to parent via ref
  useImperativeHandle(ref, () => ({
    toggle: togglePlay,
    setPressed: setIsPressed,
    setLoopRegion,
    clearLoopRegion,
    isLooping: loopRegion !== null,
  }));

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
      className={`flex items-center gap-4 p-4 rounded-lg cursor-pointer select-none
                 bg-gray-100 dark:bg-dark-hover
                 shadow-[0_4px_0_0_rgba(0,0,0,0.15)] dark:shadow-[0_4px_0_0_rgba(0,0,0,0.4)]
                 active:translate-y-1 active:shadow-none
                 transition-all duration-75
                 ${isPressed ? 'translate-y-1 shadow-none' : ''}`}
    >
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Play/Pause button */}
      <div
        className={`w-12 h-12 text-white rounded-full
                   flex items-center justify-center text-xl
                   flex-shrink-0 ${loopRegion ? 'bg-primary-500 ring-2 ring-primary-300' : 'bg-primary-600'}`}
      >
        {loopRegion ? '🔁' : isPlaying ? '⏸️' : '▶️'}
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

      {/* Speed control button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          cycleSpeed();
        }}
        className="px-2 py-1 text-xs font-medium rounded-md
                   bg-gray-200 dark:bg-dark-border
                   text-gray-700 dark:text-gray-300
                   hover:bg-gray-300 dark:hover:bg-gray-600
                   transition-colors flex-shrink-0"
      >
        {playbackRate}x
      </button>
    </div>
  );
});

export default AudioPlayer;
