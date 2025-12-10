import { useRef, useState, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react';
import { Howl } from 'howler';
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
  const howlRef = useRef<Howl | null>(null);
  const loopRegionRef = useRef<LoopRegion | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(propDuration ?? 0);
  const [loopRegion, setLoopRegionState] = useState<LoopRegion | null>(null);
  const [playbackRate, setPlaybackRateState] = useState(1);

  // Keep loopRegionRef in sync with state (for use in interval callback)
  useEffect(() => {
    loopRegionRef.current = loopRegion;
  }, [loopRegion]);

  // Initialize Howl when src changes
  useEffect(() => {
    // Clean up previous instance
    if (howlRef.current) {
      howlRef.current.unload();
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    const howl = new Howl({
      src: [src],
      html5: true, // Use HTML5 audio for large files (streaming)
      preload: true,
      onload: () => {
        const dur = howl.duration();
        if (Number.isFinite(dur) && dur > 0) {
          setDuration(dur);
        }
      },
      onplay: () => {
        setIsPlaying(true);
      },
      onpause: () => {
        setIsPlaying(false);
      },
      onstop: () => {
        setIsPlaying(false);
      },
      onend: () => {
        // If we have a loop region, this shouldn't fire (we handle looping manually)
        // But just in case, restart if looping
        const region = loopRegionRef.current;
        if (region) {
          howl.seek(region.start);
          howl.play();
        } else {
          setIsPlaying(false);
        }
      },
    });

    howlRef.current = howl;

    // Set initial playback rate
    howl.rate(playbackRate);

    // Update currentTime periodically and check loop boundary
    intervalRef.current = setInterval(() => {
      if (howl.playing()) {
        const time = howl.seek() as number;
        if (typeof time === 'number') {
          setCurrentTime(time);

          // Check loop boundary
          const region = loopRegionRef.current;
          if (region && time >= region.end) {
            howl.seek(region.start);
          }
        }
      }
    }, 50); // 50ms for smoother updates

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      howl.unload();
    };
  }, [src]); // Only re-create when src changes

  // Update playback rate when it changes
  useEffect(() => {
    if (howlRef.current) {
      howlRef.current.rate(playbackRate);
    }
  }, [playbackRate]);

  // Use prop duration if provided
  useEffect(() => {
    if (propDuration && propDuration > 0) {
      setDuration(propDuration);
    }
  }, [propDuration]);

  const togglePlay = useCallback(() => {
    const howl = howlRef.current;
    if (!howl) return;

    if (isPlaying) {
      howl.pause();
    } else {
      howl.play();
    }
  }, [isPlaying]);

  const setLoopRegion = useCallback((start: number, end: number) => {
    const howl = howlRef.current;
    if (!howl) return;

    console.log('[AudioPlayer] setLoopRegion:', { start, end });

    setLoopRegionState({ start, end });

    // Stop current playback, seek, then play - ensures clean state for rapid clicking
    howl.stop();
    howl.seek(start);
    howl.play();
  }, []);

  const clearLoopRegion = useCallback(() => {
    const howl = howlRef.current;
    setLoopRegionState(null);
    if (howl) {
      howl.pause();
      setIsPlaying(false);
    }
  }, []);

  // Cycle through playback speeds
  const cycleSpeed = useCallback(() => {
    const currentIndex = SPEED_PRESETS.indexOf(playbackRate as typeof SPEED_PRESETS[number]);
    const nextIndex = (currentIndex + 1) % SPEED_PRESETS.length;
    const newRate = SPEED_PRESETS[nextIndex];
    setPlaybackRateState(newRate);
  }, [playbackRate]);

  // Expose controls to parent via ref
  useImperativeHandle(ref, () => ({
    toggle: togglePlay,
    setPressed: setIsPressed,
    setLoopRegion,
    clearLoopRegion,
    isLooping: loopRegion !== null,
  }), [togglePlay, setLoopRegion, clearLoopRegion, loopRegion]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const howl = howlRef.current;
    if (!howl) return;

    const time = parseFloat(e.target.value);
    howl.seek(time);
    setCurrentTime(time);
  }, []);

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
