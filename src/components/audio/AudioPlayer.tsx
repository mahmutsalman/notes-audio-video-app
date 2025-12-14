import { useRef, useState, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react';
import { Howl } from 'howler';
import { formatDuration } from '../../utils/formatters';
import { SoundTouchPlayer } from '../../lib/SoundTouchPlayer';

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
  const soundTouchRef = useRef<SoundTouchPlayer | null>(null); // For WebM with pitch preservation
  const loopRegionRef = useRef<LoopRegion | null>(null);
  const activeSoundIdRef = useRef<number | null>(null); // Track specific Howl sound instance for seeking
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null); // For click-to-seek calculations
  const wasPlayingBeforeDragRef = useRef<boolean>(false); // Track play state before drag starts

  const [isPlaying, setIsPlaying] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(propDuration ?? 0);
  const [loopRegion, setLoopRegionState] = useState<LoopRegion | null>(null);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null); // For hover preview
  const [isDragging, setIsDragging] = useState(false); // For drag-to-seek
  const [dragTime, setDragTime] = useState<number | null>(null); // For drag-to-seek preview
  const [isHovering, setIsHovering] = useState(false); // For hover visual feedback

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
  // Only use SoundTouch when speed ≠ 1x (for pitch preservation)
  // At 1x speed, use native Howler for perfect quality
  const useSoundTouch = isWebmSource && playbackRate !== 1;
  const useHtml5Audio = !isWebmSource || playbackRate === 1; // Use HTML5 for non-WebM OR WebM at 1x speed

  // Initialize audio player when src or playback mode changes
  useEffect(() => {
    // Save current state before switching players (for smooth transitions when speed changes)
    // Use currentTime state as it's more reliable than asking the player
    let savedPosition = currentTime;
    let savedWasPlaying = isPlaying;

    console.log(`[AudioPlayer] Saving state from React: position=${savedPosition.toFixed(2)}s, playing=${savedWasPlaying}`);

    // Clean up previous instances
    if (howlRef.current) {
      howlRef.current.unload();
      howlRef.current = null;
    }
    if (soundTouchRef.current) {
      soundTouchRef.current.dispose();
      soundTouchRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    activeSoundIdRef.current = null;

    // Reset loaded state when src changes
    setIsLoaded(false);

    console.log(`[AudioPlayer] Initializing player: ${useSoundTouch ? 'SoundTouchPlayer (ScriptProcessorNode)' : 'Howler'} | Speed: ${playbackRate}x | WebM: ${isWebmSource}`);

    // Use SoundTouchPlayer for WebM/blob sources (pitch preservation)
    // NOTE: Uses deprecated ScriptProcessorNode API which may cause periodic crackling
    // due to main-thread audio processing. Modern AudioWorklet alternatives have
    // compatibility issues with buffered audio playback (see investigation doc).
    if (useSoundTouch) {
      const player = new SoundTouchPlayer({
        onTimeUpdate: (time) => {
          setCurrentTime(time);
          // Check loop boundary
          const region = loopRegionRef.current;
          if (region && time >= region.end) {
            console.log('[DEBUG] Loop boundary reached! time:', time.toFixed(2), '>= end:', region.end);
            console.log('[DEBUG] Looping back to start:', region.start);
            player.seek(region.start);
            setCurrentTime(region.start);
            setDebugInfo(prev => ({ ...prev, lastLoopBack: Date.now() }));
          }
        },
        onEnd: () => {
          const region = loopRegionRef.current;
          if (region) {
            player.seek(region.start);
            player.play();
          } else {
            setIsPlaying(false);
          }
        },
        onLoad: () => {
          setIsLoaded(true);
          onLoad?.();
          console.log('[AudioPlayer] SoundTouchPlayer loaded and ready for seeking');
        },
        onPlay: () => {
          setIsPlaying(true);
          onPlay?.();
        },
        onPause: () => {
          setIsPlaying(false);
        },
      });

      soundTouchRef.current = player;

      // Load the audio
      player.load(src)
        .then((dur) => {
          setDuration(dur);
          player.setTempo(playbackRate);

          // Restore saved position if switching from another player
          if (savedPosition > 0) {
            console.log(`[AudioPlayer] Restoring to SoundTouch: position=${savedPosition.toFixed(2)}s, willPlay=${savedWasPlaying}`);
            player.seek(savedPosition);
            setCurrentTime(savedPosition);
            if (savedWasPlaying) {
              player.play();
            }
          } else {
            console.log(`[AudioPlayer] No position to restore (savedPosition=${savedPosition})`);
          }
        })
        .catch((err) => {
          console.error('[AudioPlayer] Failed to load audio with SoundTouchPlayer:', err);
        });

      return () => {
        player.dispose();
      };
    }

    // Use Howler for non-WebM sources (unchanged behavior)
    const howl = new Howl({
      src: [src],
      html5: useHtml5Audio,
      format: isWebmSource ? ['webm'] : undefined,
      preload: true,
      onload: () => {
        const dur = howl.duration();
        if (Number.isFinite(dur) && dur > 0) {
          setDuration(dur);
        }
        setIsLoaded(true);
        onLoad?.();
        console.log('[AudioPlayer] Howler loaded and ready for seeking');

        // Restore saved position if switching from another player
        if (savedPosition > 0) {
          console.log(`[AudioPlayer] Restoring to Howler: position=${savedPosition.toFixed(2)}s, willPlay=${savedWasPlaying}`);
          howl.seek(savedPosition);
          setCurrentTime(savedPosition);
          if (savedWasPlaying) {
            const id = howl.play();
            activeSoundIdRef.current = typeof id === 'number' ? id : null;
          }
        } else {
          console.log(`[AudioPlayer] No position to restore (savedPosition=${savedPosition})`);
        }
      },
      onplay: (id) => {
        if (typeof id === 'number') {
          activeSoundIdRef.current = id;
        }
        setIsPlaying(true);
        onPlay?.();
      },
      onpause: () => {
        setIsPlaying(false);
      },
      onstop: () => {
        setIsPlaying(false);
        activeSoundIdRef.current = null;
      },
      onend: () => {
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
    howl.rate(playbackRate);

    // Update currentTime periodically for Howler (SoundTouchPlayer does this internally)
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
    }, 50);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      howl.unload();
      activeSoundIdRef.current = null;
    };
  }, [src, useSoundTouch, useHtml5Audio, isWebmSource, playbackRate]); // Re-create when src, playback mode, or speed changes

  // Update playback rate when it changes
  useEffect(() => {
    if (soundTouchRef.current) {
      soundTouchRef.current.setTempo(playbackRate);
    } else if (howlRef.current) {
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
    // Handle SoundTouchPlayer
    const soundTouch = soundTouchRef.current;
    if (soundTouch) {
      if (isPlaying) {
        soundTouch.pause();
      } else {
        soundTouch.play();
      }
      return;
    }

    // Handle Howler
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
    // Handle SoundTouchPlayer
    const soundTouch = soundTouchRef.current;
    if (soundTouch) {
      const audioDuration = soundTouch.getDuration();
      const clampedStart = Math.max(0, Math.min(start, audioDuration));
      const clampedEnd = Math.max(clampedStart, Math.min(end, audioDuration));

      console.log('═══════════════════════════════════════════');
      console.log('[DEBUG] setLoopRegion CALLED (SoundTouchPlayer)');
      console.log('[DEBUG] Requested start:', start, 'seconds');
      console.log('[DEBUG] Requested end:', end, 'seconds');
      console.log('[DEBUG] Clamped start:', clampedStart, 'seconds');
      console.log('[DEBUG] Clamped end:', clampedEnd, 'seconds');
      console.log('[DEBUG] Audio total duration:', audioDuration, 'seconds');

      setLoopRegionState({ start: clampedStart, end: clampedEnd });

      // Stop, seek to start, then play
      soundTouch.stop();
      soundTouch.seek(clampedStart);
      setCurrentTime(clampedStart);
      setDebugInfo(prev => ({
        ...prev,
        requestedStart: clampedStart,
        requestedEnd: clampedEnd,
        actualSeekPosition: clampedStart,
      }));

      soundTouch.play();

      // Verify seek position after settling
      setTimeout(() => {
        const actualPos = soundTouch.getCurrentTime();
        console.log('[DEBUG] After seek, actual position:', actualPos, 'seconds');
        console.log('[DEBUG] Seek accuracy:', (actualPos - clampedStart).toFixed(3), 'seconds off');
        setDebugInfo(prev => ({
          ...prev,
          actualSeekPosition: actualPos,
        }));
      }, 180);

      console.log('═══════════════════════════════════════════');
      return;
    }

    // Handle Howler
    const howl = howlRef.current;
    if (!howl) return;

    const audioDuration = howl.duration();
    const clampedStart = Math.max(0, Math.min(start, audioDuration));
    const clampedEnd = Math.max(clampedStart, Math.min(end, audioDuration));

    console.log('═══════════════════════════════════════════');
    console.log('[DEBUG] setLoopRegion CALLED (Howler)');
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
    setLoopRegionState(null);

    // Handle SoundTouchPlayer
    const soundTouch = soundTouchRef.current;
    if (soundTouch) {
      soundTouch.pause();
      setIsPlaying(false);
      return;
    }

    // Handle Howler
    const howl = howlRef.current;
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

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || duration === 0 || !isLoaded || isDragging) return;

    e.stopPropagation(); // Prevent event bubbling to parent

    const rect = progressBarRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const targetTime = percentage * duration;

    // CRITICAL: Pause before seeking to prevent dual audio
    const wasPlaying = isPlaying;

    // Handle SoundTouchPlayer
    const soundTouch = soundTouchRef.current;
    if (soundTouch) {
      if (wasPlaying) soundTouch.pause();
      soundTouch.seek(targetTime);
      setCurrentTime(targetTime);
      if (wasPlaying) {
        setTimeout(() => soundTouch.play(), 50);
      }
      return;
    }

    // Handle Howler
    const howl = howlRef.current;
    if (!howl) return;

    const id = activeSoundIdRef.current ?? undefined;
    if (wasPlaying && id !== undefined) {
      howl.pause(id);
    }

    // Seek on current instance
    howl.seek(targetTime, id);
    setCurrentTime(targetTime);

    // If was playing, resume with proper seeking
    if (wasPlaying) {
      const newId = howl.play();
      const finalId = typeof newId === 'number' ? newId : null;
      activeSoundIdRef.current = finalId;

      // Ensure seek is applied to the new instance
      if (finalId !== null) {
        requestAnimationFrame(() => {
          howl.seek(targetTime, finalId);
          setCurrentTime(targetTime);
        });
      }
    }
  }, [duration, isPlaying, isLoaded, isDragging]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || duration === 0 || !isLoaded) return;

    e.stopPropagation(); // Prevent event bubbling to parent

    // Don't set isDragging yet - wait for actual mouse movement
    // This allows click-to-seek to work without pausing
    const rect = progressBarRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    setDragTime(percentage * duration);
  }, [duration, isLoaded]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!progressBarRef.current || duration === 0) return;

    // Only drag if dragTime was set (mouse was pressed on progress bar)
    if (dragTime === null) return;

    // First time moving - start dragging and pause audio
    if (!isDragging) {
      // Capture play state BEFORE any changes
      wasPlayingBeforeDragRef.current = isPlaying;

      setIsDragging(true);

      // Pause audio when drag actually starts (not on mousedown)
      if (soundTouchRef.current && isPlaying) {
        soundTouchRef.current.pause();
      }
      if (howlRef.current && isPlaying) {
        const id = activeSoundIdRef.current ?? undefined;
        howlRef.current.pause(id);
      }
    }

    const rect = progressBarRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const targetTime = percentage * duration;
    setDragTime(targetTime);
    setCurrentTime(targetTime); // Live preview during drag
  }, [isDragging, dragTime, duration, isPlaying]);

  const handleMouseUp = useCallback(() => {
    // Reset drag state even if we didn't actually drag (just clicked)
    if (dragTime === null) return;

    // Only seek if we actually dragged (not just clicked)
    if (isDragging) {
      setIsDragging(false);

      // Seek to final position
      const soundTouch = soundTouchRef.current;
      if (soundTouch) {
        soundTouch.seek(dragTime);
        setCurrentTime(dragTime);
        if (wasPlayingBeforeDragRef.current) {
          setTimeout(() => soundTouch.play(), 50);
        }
      }

      const howl = howlRef.current;
      if (howl) {
        const id = activeSoundIdRef.current ?? undefined;

        // Seek on current instance
        howl.seek(dragTime, id);
        setCurrentTime(dragTime);

        // If was playing BEFORE drag, resume with proper seeking
        if (wasPlayingBeforeDragRef.current) {
          const newId = howl.play();
          const finalId = typeof newId === 'number' ? newId : null;
          activeSoundIdRef.current = finalId;

          // Ensure seek is applied to the new instance
          if (finalId !== null) {
            requestAnimationFrame(() => {
              howl.seek(dragTime, finalId);
              setCurrentTime(dragTime);
            });
          }
        }
      }
    }

    setDragTime(null);
    wasPlayingBeforeDragRef.current = false; // Reset for next drag
  }, [isDragging, dragTime, isPlaying]);

  // Hover handlers for visual feedback
  const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation(); // Prevent event bubbling
    setIsHovering(true);
  }, []);

  const handleMouseLeave = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation(); // Prevent event bubbling
    setIsHovering(false);
    setHoverTime(null);
  }, []);

  const handleMouseMoveHover = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || duration === 0) return;

    e.stopPropagation(); // Prevent event bubbling

    const rect = progressBarRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    setHoverTime(percentage * duration);
  }, [duration]);

  // Touch handlers for mobile devices
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || duration === 0 || !isLoaded) return;
    e.preventDefault(); // Prevent scroll

    const touch = e.touches[0];
    const rect = progressBarRef.current.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));

    setIsDragging(true);
    setDragTime(percentage * duration);

    // Pause during drag to prevent audio overlap
    if (soundTouchRef.current && isPlaying) {
      soundTouchRef.current.pause();
    }
    if (howlRef.current && isPlaying) {
      howlRef.current.pause();
    }
  }, [duration, isPlaying, isLoaded]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDragging || !progressBarRef.current || duration === 0) return;

    const touch = e.touches[0];
    const rect = progressBarRef.current.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const targetTime = percentage * duration;

    setDragTime(targetTime);
    setCurrentTime(targetTime); // Live preview
  }, [isDragging, duration]);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging || dragTime === null) return;

    setIsDragging(false);

    // Seek to final position
    const soundTouch = soundTouchRef.current;
    if (soundTouch) {
      soundTouch.seek(dragTime);
      if (isPlaying) {
        setTimeout(() => soundTouch.play(), 50);
      }
    }

    const howl = howlRef.current;
    if (howl) {
      const id = activeSoundIdRef.current ?? undefined;
      howl.seek(dragTime, id);
      if (isPlaying) {
        setTimeout(() => {
          const newId = howl.play();
          activeSoundIdRef.current = typeof newId === 'number' ? newId : null;
        }, 50);
      }
    }

    setDragTime(null);
  }, [isDragging, dragTime, isPlaying]);

  // Keyboard navigation handler
  const handleProgressKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!duration || !isLoaded) return;

    let seekDelta = 0;
    switch (e.key) {
      case 'ArrowLeft':
        seekDelta = -5; // 5 seconds back
        break;
      case 'ArrowRight':
        seekDelta = 5; // 5 seconds forward
        break;
      case 'Home':
        seekDelta = -currentTime; // Jump to start
        break;
      case 'End':
        seekDelta = duration - currentTime; // Jump to end
        break;
      default:
        return; // Don't prevent default for other keys
    }

    e.preventDefault();

    const targetTime = Math.max(0, Math.min(duration, currentTime + seekDelta));

    // Same pause-seek-resume pattern
    const wasPlaying = isPlaying;

    // Handle SoundTouchPlayer
    const soundTouch = soundTouchRef.current;
    if (soundTouch) {
      if (wasPlaying) soundTouch.pause();
      soundTouch.seek(targetTime);
      setCurrentTime(targetTime);
      if (wasPlaying) {
        setTimeout(() => soundTouch.play(), 50);
      }
      return;
    }

    // Handle Howler
    const howl = howlRef.current;
    if (!howl) return;

    const id = activeSoundIdRef.current ?? undefined;
    if (wasPlaying && id !== undefined) {
      howl.pause(id);
    }

    // Seek on current instance
    howl.seek(targetTime, id);
    setCurrentTime(targetTime);

    // If was playing, resume with proper seeking
    if (wasPlaying) {
      const newId = howl.play();
      const finalId = typeof newId === 'number' ? newId : null;
      activeSoundIdRef.current = finalId;

      // Ensure seek is applied to the new instance
      if (finalId !== null) {
        requestAnimationFrame(() => {
          howl.seek(targetTime, finalId);
          setCurrentTime(targetTime);
        });
      }
    }
  }, [duration, currentTime, isPlaying, isLoaded]);

  // Attach global event listeners when mouse is pressed on progress bar
  useEffect(() => {
    if (dragTime !== null) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragTime, handleMouseMove, handleMouseUp]);

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
        className={`flex items-center gap-4 p-4 rounded-lg select-none
                   bg-gray-100 dark:bg-dark-hover
                   shadow-[0_4px_0_0_rgba(0,0,0,0.15)] dark:shadow-[0_4px_0_0_rgba(0,0,0,0.4)]
                   active:translate-y-1 active:shadow-none
                   transition-all duration-75
                   ${isPressed ? 'translate-y-1 shadow-none' : ''}`}
      >
      {/* Play/Pause button */}
      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        aria-pressed={isPlaying}
        className={`w-12 h-12 text-white rounded-full
                   flex items-center justify-center text-xl
                   flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
                   ${loopRegion ? 'bg-primary-500 ring-2 ring-primary-300' : 'bg-primary-600'}`}
      >
        {loopRegion ? '🔁' : isPlaying ? '⏸️' : '▶️'}
      </button>

      {/* Progress and time */}
      <div className="flex-1 min-w-0">
        {/* Progress bar with expanded clickable area */}
        <div
          ref={progressBarRef}
          role="slider"
          aria-label="Seek audio position"
          aria-valuemin={0}
          aria-valuemax={Math.floor(duration)}
          aria-valuenow={Math.floor(currentTime)}
          aria-valuetext={`${formatDuration(Math.floor(currentTime))} of ${formatDuration(Math.floor(duration))}`}
          tabIndex={0}
          onClick={handleProgressClick}
          onMouseDown={handleMouseDown}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onMouseMove={handleMouseMoveHover}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          onKeyDown={handleProgressKeyDown}
          className="relative py-2 -my-2 mb-1 cursor-pointer group touch-none
                     focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        >
          {/* Visual progress bar */}
          <div className={`relative bg-gray-200 dark:bg-dark-border rounded-full transition-all
                          ${isHovering || isDragging ? 'h-3' : 'h-2'}`}>
            {/* Progress fill */}
            <div
              className="absolute h-full bg-primary-600 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />

            {/* Hover preview indicator */}
            {isHovering && hoverTime !== null && !isDragging && (
              <div
                className="absolute top-0 w-0.5 h-full bg-primary-400/50"
                style={{ left: `${(hoverTime / duration) * 100}%` }}
              />
            )}

            {/* Scrubber handle - appears on hover or drag */}
            {(isHovering || isDragging) && (
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white dark:bg-gray-200
                           rounded-full shadow-md ring-2 ring-primary-600 transition-all"
                style={{ left: `${progress}%`, marginLeft: '-6px' }}
              />
            )}

            {/* Time tooltip */}
            {isHovering && hoverTime !== null && !isDragging && (
              <div
                className="absolute -top-8 -translate-x-1/2 bg-gray-900 dark:bg-gray-700
                           text-white text-xs px-2 py-1 rounded pointer-events-none whitespace-nowrap"
                style={{ left: `${(hoverTime / duration) * 100}%` }}
              >
                {formatDuration(Math.floor(hoverTime))}
              </div>
            )}
          </div>
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
