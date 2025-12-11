import { useRef, useState, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react';
import { Howl } from 'howler';
import { formatDuration } from '../../utils/formatters';

interface AudioPlayerProps {
  src: string;
  duration?: number;  // Optional: pass duration explicitly for blob URLs
  onLoad?: () => void;  // Callback when audio is loaded and ready for seeking
  onPlay?: () => void;  // Callback when playback actually starts
  showDebug?: boolean;  // Show debug overlay (secret feature)
}

export interface LoopRegion {
  start: number;
  end: number;
}

const SPEED_PRESETS = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;
const setPreservePitch = (node: HTMLAudioElement | null) => {
  if (!node) return;
  // Enable pitch preservation when changing playbackRate on HTML5 audio
  (node as any).preservesPitch = true;
  (node as any).mozPreservesPitch = true;
  (node as any).webkitPreservesPitch = true;
};

export interface AudioPlayerHandle {
  toggle: () => void;
  setPressed: (pressed: boolean) => void;
  setLoopRegion: (start: number, end: number) => void;
  clearLoopRegion: () => void;
  isLooping: boolean;
  isLoaded: boolean;
}

const AudioPlayer = forwardRef<AudioPlayerHandle, AudioPlayerProps>(
  function AudioPlayer({ src, duration: propDuration, onLoad, onPlay, showDebug = false }, ref) {
  const howlRef = useRef<Howl | null>(null);
  const loopRegionRef = useRef<LoopRegion | null>(null);
  const activeSoundIdRef = useRef<number | null>(null); // Track specific Howl sound instance for seeking
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(propDuration ?? 0);
  const [loopRegion, setLoopRegionState] = useState<LoopRegion | null>(null);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [isLoaded, setIsLoaded] = useState(false);

  // DEBUG: Track what was requested vs what's actually happening
  const [debugInfo, setDebugInfo] = useState<{
    requestedStart: number | null;
    requestedEnd: number | null;
    actualSeekPosition: number | null;
    lastLoopBack: number | null;
  }>({ requestedStart: null, requestedEnd: null, actualSeekPosition: null, lastLoopBack: null });

  // Keep loopRegionRef in sync with state (for use in interval callback)
  useEffect(() => {
    loopRegionRef.current = loopRegion;
  }, [loopRegion]);

  const isWebmSource = src.toLowerCase().includes('.webm') || src.startsWith('blob:');

  // Initialize Howl when src changes
  useEffect(() => {
    // Clean up previous instance
    if (howlRef.current) {
      howlRef.current.unload();
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    activeSoundIdRef.current = null;

    // Reset loaded state when src changes
    setIsLoaded(false);

    const howl = new Howl({
      src: [src],
      html5: true, // HTML5 audio preserves pitch; we handle seeking accuracy manually
      format: isWebmSource ? ['webm'] : undefined,
      preload: true,
      onload: () => {
        const dur = howl.duration();
        if (Number.isFinite(dur) && dur > 0) {
          setDuration(dur);
        }
        setIsLoaded(true);  // Audio is now ready for seeking
        onLoad?.();  // Notify parent that audio is ready
        console.log('[AudioPlayer] Audio loaded and ready for seeking');
      },
      onplay: (id) => {
        if (typeof id === 'number') {
          activeSoundIdRef.current = id;
          // Ensure pitch preservation on the underlying HTMLAudioElement
          const sound = (howl as any)._sounds?.find((s: any) => s?._id === id);
          if (sound?._node) {
            setPreservePitch(sound._node);
          }
        }
        setIsPlaying(true);
        onPlay?.();  // Notify parent that playback started
      },
      onpause: () => {
        setIsPlaying(false);
      },
      onstop: () => {
        setIsPlaying(false);
        activeSoundIdRef.current = null;
      },
      onend: () => {
        // If we have a loop region, this shouldn't fire (we handle looping manually)
        // But just in case, restart if looping
        const region = loopRegionRef.current;
        if (region) {
          const id = howl.play();
          activeSoundIdRef.current = typeof id === 'number' ? id : null;
          howl.seek(region.start, activeSoundIdRef.current ?? undefined);
        } else {
          setIsPlaying(false);
          activeSoundIdRef.current = null;
        }
      },
    });

    howlRef.current = howl;

    // Set initial playback rate
    howl.rate(playbackRate);

    // Update currentTime periodically and check loop boundary
    intervalRef.current = setInterval(() => {
      if (howl.playing()) {
        const id = activeSoundIdRef.current ?? undefined;
        const time = howl.seek(id) as number;
        if (typeof time === 'number') {
          setCurrentTime(time);

          // Check loop boundary
          const region = loopRegionRef.current;
          if (region && time >= region.end) {
            console.log('[DEBUG] Loop boundary reached! time:', time.toFixed(2), '>= end:', region.end);
            console.log('[DEBUG] Looping back to start:', region.start);
            howl.seek(region.start, id);
            setCurrentTime(region.start);
            setDebugInfo(prev => ({ ...prev, lastLoopBack: Date.now() }));
          }
        }
      }
    }, 50); // 50ms for smoother updates

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      howl.unload();
      activeSoundIdRef.current = null;
    };
  }, [src, isWebmSource]); // Only re-create when src changes

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
      const id = howl.play();
      activeSoundIdRef.current = typeof id === 'number' ? id : null;
    }
  }, [isPlaying]);

  const setLoopRegion = useCallback((start: number, end: number) => {
    const howl = howlRef.current;
    if (!howl) return;

    const audioDuration = howl.duration();
    const clampedStart = Math.max(0, Math.min(start, audioDuration));
    const clampedEnd = Math.max(clampedStart, Math.min(end, audioDuration));

    console.log('═══════════════════════════════════════════');
    console.log('[DEBUG] setLoopRegion CALLED');
    console.log('[DEBUG] Requested start:', start, 'seconds');
    console.log('[DEBUG] Requested end:', end, 'seconds');
    console.log('[DEBUG] Clamped start:', clampedStart, 'seconds');
    console.log('[DEBUG] Clamped end:', clampedEnd, 'seconds');
    console.log('[DEBUG] Audio total duration:', audioDuration, 'seconds');

    setLoopRegionState({ start: clampedStart, end: clampedEnd });

    // Stop current playback, seek, then play - ensures clean state for rapid clicking
    howl.stop();
    activeSoundIdRef.current = null;

    console.log('[DEBUG] Starting playback and seeking to clamped start...');
    const soundId = howl.play();
    const targetId = typeof soundId === 'number' ? soundId : undefined;
    if (targetId !== undefined) {
      activeSoundIdRef.current = targetId;
    }

    const applySeek = () => {
      howl.seek(clampedStart, targetId);
      setCurrentTime(clampedStart);
      setDebugInfo(prev => ({
        ...prev,
        requestedStart: clampedStart,
        requestedEnd: clampedEnd,
        actualSeekPosition: clampedStart,
      }));

      // Verify final position after the seek settles
      setTimeout(() => {
        const actualPos = howl.seek(targetId) as number;
        console.log('[DEBUG] After seek, actual position:', actualPos, 'seconds');
        console.log('[DEBUG] Seek accuracy:', (actualPos - clampedStart).toFixed(3), 'seconds off');
        setDebugInfo(prev => ({
          ...prev,
          actualSeekPosition: actualPos,
        }));
        setCurrentTime(actualPos);
      }, 180);
    };

    // Wait for play event to ensure HTML5 audio is ready for seeking
    let fallbackTimer: NodeJS.Timeout | null = setTimeout(() => {
      fallbackTimer = null;
      applySeek();
    }, 80);

    howl.once('play', () => {
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      applySeek();
    }, targetId);

    console.log('═══════════════════════════════════════════');
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
    isLoaded,
  }), [togglePlay, setLoopRegion, clearLoopRegion, loopRegion, isLoaded]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const howl = howlRef.current;
    if (!howl) return;

    const time = parseFloat(e.target.value);
    const id = activeSoundIdRef.current ?? undefined;
    howl.seek(time, id);
    setCurrentTime(time);
  }, []);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="space-y-2">
      {/* DEBUG OVERLAY - Secret feature: right-click Audio header to toggle */}
      {showDebug && (
        <div className="bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-400 dark:border-yellow-600 rounded-lg p-3 text-xs font-mono">
          <div className="font-bold text-yellow-800 dark:text-yellow-200 mb-2">🔍 DEBUG INFO</div>
          <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-yellow-700 dark:text-yellow-300">
            <div>Requested Start:</div>
            <div className="font-bold">{debugInfo.requestedStart?.toFixed(2) ?? '-'} sec</div>
            <div className="font-bold text-blue-600 dark:text-blue-400">{debugInfo.requestedStart !== null ? formatDuration(Math.floor(debugInfo.requestedStart)) : '-'}</div>

            <div>Requested End:</div>
            <div className="font-bold">{debugInfo.requestedEnd?.toFixed(2) ?? '-'} sec</div>
            <div className="font-bold text-blue-600 dark:text-blue-400">{debugInfo.requestedEnd !== null ? formatDuration(Math.floor(debugInfo.requestedEnd)) : '-'}</div>

            <div>Actual Seek Position:</div>
            <div className={`font-bold ${debugInfo.actualSeekPosition !== null && debugInfo.requestedStart !== null && Math.abs(debugInfo.actualSeekPosition - debugInfo.requestedStart) > 0.5 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
              {debugInfo.actualSeekPosition?.toFixed(2) ?? '-'} sec
            </div>
            <div className={`font-bold ${debugInfo.actualSeekPosition !== null && debugInfo.requestedStart !== null && Math.abs(debugInfo.actualSeekPosition - debugInfo.requestedStart) > 0.5 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>
              {debugInfo.actualSeekPosition !== null ? formatDuration(Math.floor(debugInfo.actualSeekPosition)) : '-'}
            </div>

            <div>Current Position:</div>
            <div className="font-bold">{currentTime.toFixed(2)} sec</div>
            <div className="font-bold text-blue-600 dark:text-blue-400">{formatDuration(Math.floor(currentTime))}</div>

            <div>Audio Duration:</div>
            <div className="font-bold">{duration.toFixed(2)} sec</div>
            <div className="font-bold text-blue-600 dark:text-blue-400">{formatDuration(Math.floor(duration))}</div>

            <div>Seek Error:</div>
            <div className={`font-bold ${debugInfo.actualSeekPosition !== null && debugInfo.requestedStart !== null && Math.abs(debugInfo.actualSeekPosition - debugInfo.requestedStart) > 0.5 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`} style={{gridColumn: 'span 2'}}>
              {debugInfo.actualSeekPosition !== null && debugInfo.requestedStart !== null
                ? (debugInfo.actualSeekPosition - debugInfo.requestedStart).toFixed(3) + ' sec'
                : '-'}
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
});

export default AudioPlayer;
