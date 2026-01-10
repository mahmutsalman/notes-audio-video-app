import { useState, useEffect, useRef, useCallback } from 'react';
import ScreenSourceSelector from './ScreenSourceSelector';
import { useScreenRecorder } from '../../hooks/useScreenRecorder';
import { useScreenRecordingSettings, QUALITY_PRESETS } from '../../context/ScreenRecordingSettingsContext';
import { useGroupColorToggle } from '../../hooks/useGroupColorToggle';
import type { ScreenSource, CaptureArea } from '../../types';
import type { DurationGroupColor } from '../../utils/durationGroupColors';

interface ScreenRecordingModalProps {
  isOpen: boolean;
  onClose: () => void;
  recordingId: number;
  onSave: (
    videoBlob: Blob | null,
    marks: any[],
    durationMs: number,
    filePath?: string,
    audioBlob?: Blob | null,
    audioConfig?: { bitrate: '32k' | '64k' | '128k'; channels: 1 | 2 },
    audioOffsetMs?: number
  ) => Promise<void>;
  autoStartRegionSelection?: boolean;
  pendingRegion?: CaptureArea | null;
}

type Step = 'source-selection' | 'recording' | 'saving';

export default function ScreenRecordingModal({
  isOpen,
  onClose,
  recordingId,
  onSave,
  autoStartRegionSelection = false,
  pendingRegion = null,
}: ScreenRecordingModalProps) {
  // Removed excessive render logging - only log important state changes
  const [step, setStep] = useState<Step>('source-selection');
  const recorder = useScreenRecorder();
  const { settings, getResolutionDimensions, updatePreset, loading } = useScreenRecordingSettings();
  const groupColorToggle = useGroupColorToggle(recordingId);
  const noteInputRef = useRef<HTMLInputElement>(null);
  const processedRegionIdRef = useRef<number | null>(null); // Track processed region to prevent duplicate starts
  const wasOpenRef = useRef(false); // Track previous isOpen state to detect true open events
  const isStoppingRef = useRef(false); // Prevent double-call to handleStopRecording
  const markGroupColorsRef = useRef<Map<number, DurationGroupColor>>(new Map()); // Track group color for each mark

  // Component lifecycle cleanup
  useEffect(() => {
    return () => {
      // Component unmounting - cleanup handled elsewhere
    };
  }, []);

  // Handler functions (defined before useEffects to avoid temporal dead zone)
  const handleClose = useCallback(() => {
    recorder.resetRecording();
    setStep('source-selection');
    isStoppingRef.current = false; // Reset stopping flag
    onClose();
  }, [recorder, onClose]);

  const handleStopRecording = useCallback(async () => {
    // Prevent re-entrant calls (can be triggered by both button click and IPC event)
    if (isStoppingRef.current) {
      console.log('[ScreenRecordingModal] Already stopping, ignoring duplicate call');
      return;
    }

    isStoppingRef.current = true;

    try {
      // CRITICAL FIX: Wait for overlay windows to close BEFORE changing state
      // This prevents the race condition where setStep('saving') would remove
      // the listener before the IPC handler sends the recording:stop event back
      await window.electronAPI.region.stopRecording();

      // Now safe to transition to saving state (overlay is confirmed closed)
      setStep('saving');

      // Overlay windows are now confirmed closed - safe to proceed with save
      const result = await recorder.stopRecording();

      if (result) {
        try {
          // Add group_color to each mark based on tracked colors
          const marksWithGroupColor = recorder.completedMarks.map((mark, index) => ({
            ...mark,
            group_color: markGroupColorsRef.current.get(index) ?? null,
          }));

          console.log('[ScreenRecordingModal] Saving marks with group colors:', marksWithGroupColor);

          // Save group color toggle state to database
          await groupColorToggle.saveState();

          // Pass duration in milliseconds as third parameter
          await onSave(
            result.blob,
            marksWithGroupColor,
            result.durationMs,
            result.filePath,
            result.audioBlob,
            result.audioConfig,
            result.audioOffsetMs
          );
          handleClose();
        } catch (error) {
          console.error('Failed to save recording:', error);
          // TODO: Show error message
        }
      }
    } finally {
      // Reset flag when complete (or on error)
      isStoppingRef.current = false;
    }
  }, [recorder, onSave, handleClose]);

  const handleRegionSelect = useCallback(async (region: CaptureArea) => {
    setStep('recording');

    try {
      const regionWithRecordingId: CaptureArea = {
        ...region,
        recordingId
      };
      await recorder.startRecordingWithRegion(
        regionWithRecordingId,
        settings.fps
      );
    } catch (error) {
      console.error('[ScreenRecordingModal] Failed to start recording:', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingId, settings.fps]);

  // Reset ONLY when modal transitions from closed to open (false → true)
  // This prevents resetting during recording when isOpen changes
  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    const justOpened = !wasOpen && isOpen;
    const justClosed = wasOpen && !isOpen;

    if (justOpened) {
      setStep('source-selection');
      recorder.resetRecording();
      // Reset processed region ID when modal opens
      processedRegionIdRef.current = null;
      isStoppingRef.current = false; // Reset stopping flag
      markGroupColorsRef.current.clear(); // Clear mark group color tracking
    } else if (justClosed) {
      // Clear processed region ID when modal closes
      processedRegionIdRef.current = null;
      isStoppingRef.current = false; // Reset stopping flag
      markGroupColorsRef.current.clear(); // Clear mark group color tracking
    }

    // Update ref for next comparison
    wasOpenRef.current = isOpen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Auto-start recording when opened via Cmd+D with pending region
  // CRITICAL: Wait for settings to finish loading before starting!
  // CRITICAL: Only process each region ONCE using _id tracking
  useEffect(() => {
    const regionId = (pendingRegion as any)?._id;

    // Check if this specific region has already been processed
    if (regionId !== undefined && regionId === processedRegionIdRef.current) {
      return;
    }

    const allConditionsMet = isOpen && pendingRegion && step === 'source-selection' && !loading;

    if (allConditionsMet) {
      // Mark this region as processed BEFORE calling handler to prevent race conditions
      processedRegionIdRef.current = regionId;
      handleRegionSelect(pendingRegion);
    }
  }, [isOpen, pendingRegion, step, loading, handleRegionSelect]);

  // Auto-focus note input when marking
  // But skip auto-focus during region recording since user types in overlay
  useEffect(() => {
    if (recorder.isMarking && noteInputRef.current && !recorder.captureArea) {
      noteInputRef.current.focus();
    }
  }, [recorder.isMarking, recorder.captureArea]);

  // Listen for stop recording event from overlay
  useEffect(() => {
    if (step !== 'recording') return;

    const cleanup = window.electronAPI.region.onRecordingStop(() => {
      handleStopRecording();
    });

    return () => {
      cleanup();
    };
  }, [step, handleStopRecording]);

  // Send duration updates to overlay
  useEffect(() => {
    if (step !== 'recording' || !recorder.isRecording) return;

    window.electronAPI.region.updateDuration(recorder.duration);
  }, [step, recorder.isRecording, recorder.duration]);

  // Listen for pause/resume from overlay
  useEffect(() => {
    if (step !== 'recording') return;

    const cleanupPause = window.electronAPI.region.onPauseRecording(() => {
      console.log('[ScreenRecordingModal] Received pause event from overlay');
      console.log('[ScreenRecordingModal] Calling recorder.pauseRecording()');
      recorder.pauseRecording('manual', 'overlay:pause');
    });

    const cleanupResume = window.electronAPI.region.onResumeRecording(() => {
      console.log('[ScreenRecordingModal] Received resume event from overlay');
      console.log('[ScreenRecordingModal] Calling recorder.resumeRecording()');
      recorder.resumeRecording('overlay:resume');
    });

    return () => {
      cleanupPause();
      cleanupResume();
    };
  }, [step, recorder]);

  // Broadcast pause state to overlay whenever it changes
  useEffect(() => {
    if (step !== 'recording') return;

    console.log('[ScreenRecordingModal] Pause state changed, broadcasting to overlay:', recorder.isPaused);
    window.electronAPI.region.sendPauseStateUpdate(recorder.isPaused);
  }, [step, recorder.isPaused]);

  // Broadcast pause source to overlay whenever it changes
  useEffect(() => {
    if (step !== 'recording') return;

    console.log('[ScreenRecordingModal] Pause source changed, broadcasting to overlay:', recorder.pauseSource);
    window.electronAPI.region.sendPauseSourceUpdate(recorder.pauseSource);
  }, [step, recorder.pauseSource]);

  // Broadcast group color toggle state to overlay
  useEffect(() => {
    if (step !== 'recording') return;

    console.log('[ScreenRecordingModal] Group color state changed, broadcasting to overlay:', {
      isActive: groupColorToggle.isActive,
      currentColor: groupColorToggle.currentColor
    });
    window.electronAPI.region.sendGroupColorToggle(groupColorToggle.isActive, groupColorToggle.currentColor);
  }, [step, groupColorToggle.isActive, groupColorToggle.currentColor]);

  // Handle group color toggle requests from overlay UI (source of truth lives here)
  useEffect(() => {
    if (step !== 'recording') return;

    const cleanup = window.electronAPI.region.onGroupColorToggleRequest(() => {
      console.log('[ScreenRecordingModal] Group color toggle requested from overlay');
      groupColorToggle.toggle();
    });

    return () => cleanup();
  }, [step, groupColorToggle.toggle]);

  // Track group color for each completed mark
  useEffect(() => {
    if (step !== 'recording') return;

    const currentMarkCount = recorder.completedMarks.length;
    const trackedMarkCount = markGroupColorsRef.current.size;

    // New mark(s) completed - store current group color for them
    if (currentMarkCount > trackedMarkCount) {
      const groupColor = groupColorToggle.isActive ? groupColorToggle.currentColor : null;
      for (let i = trackedMarkCount; i < currentMarkCount; i++) {
        markGroupColorsRef.current.set(i, groupColor);
        console.log(`[ScreenRecordingModal] Mark ${i} assigned group color:`, groupColor);
      }
    }
  }, [step, recorder.completedMarks.length, groupColorToggle.isActive, groupColorToggle.currentColor]);

  // Duration mark synchronization: Broadcast marking state to overlay
  useEffect(() => {
    if (step !== 'recording') return;

    // Only log when marking state changes, not the start time updates
    if (recorder.isMarking) {
      console.log('[ScreenRecordingModal] Started marking at', recorder.pendingMarkStart);
    }
    window.electronAPI.region.sendMarkStateUpdate(
      recorder.isMarking,
      recorder.pendingMarkStart ?? 0
    );
  }, [step, recorder.isMarking, recorder.pendingMarkStart]);

  // Duration mark synchronization: Listen for mark toggle from overlay
  useEffect(() => {
    if (step !== 'recording') return;

    const cleanup = window.electronAPI.region.onMarkToggle(() => {
      console.log('[ScreenRecordingModal] Mark toggled from overlay');
      recorder.handleMarkToggle();
    });

    return () => cleanup();
  }, [step, recorder]);

  // Duration mark synchronization: Send note updates to overlay
  useEffect(() => {
    if (step !== 'recording' || !recorder.isMarking) return;

    // Don't log every keystroke - too noisy
    window.electronAPI.region.sendMarkNote(recorder.pendingMarkNote);
  }, [step, recorder.isMarking, recorder.pendingMarkNote]);

  // Duration mark synchronization: Listen for note updates from overlay
  useEffect(() => {
    if (step !== 'recording') return;

    const cleanup = window.electronAPI.region.onMarkNoteUpdate((note) => {
      // Don't log every keystroke - too noisy
      recorder.setMarkNote(note);
    });

    return () => cleanup();
  }, [step, recorder]);

  // Listen for cmd+h input field toggle
  useEffect(() => {
    if (step !== 'recording') return;

    const cleanup = window.electronAPI.region.onInputFieldToggle(() => {
      console.log('[ScreenRecordingModal] Cmd+H pressed');

      // Only toggle if not already marking
      if (!recorder.isMarking) {
        console.log('[ScreenRecordingModal] Starting new duration mark');
        recorder.handleMarkToggle();
      } else {
        console.log('[ScreenRecordingModal] Already marking - refocusing input');

        // If fullscreen recording (no captureArea), input is in React modal - refocus it here
        if (!recorder.captureArea && noteInputRef.current) {
          console.log('[ScreenRecordingModal] Fullscreen mode - refocusing React modal input');
          noteInputRef.current.focus();

          // Move cursor to end of text
          const length = noteInputRef.current.value.length;
          noteInputRef.current.setSelectionRange(length, length);
        } else {
          console.log('[ScreenRecordingModal] Region mode - overlay will handle refocus');
          // In region mode, overlay will handle refocus via its own listener
        }
      }
    });

    return () => cleanup();
  }, [step, recorder]);

  // Listen for mark input focus (auto-pause for marking)
  useEffect(() => {
    console.log('[ScreenRecordingModal] Setting up mark input focus listener, step:', step);
    if (step !== 'recording') return;

    const cleanup = window.electronAPI.region.onMarkInputFocus(() => {
      console.log('[ScreenRecordingModal] ===== MARK INPUT GAINED FOCUS =====');
      console.log('[ScreenRecordingModal] isPaused:', recorder.isPaused);
      console.log('[ScreenRecordingModal] Calling pauseForMarking()');
      recorder.pauseForMarking();
    });

    console.log('[ScreenRecordingModal] ✅ Focus listener registered');
    return () => {
      console.log('[ScreenRecordingModal] Cleaning up mark input focus listener');
      cleanup();
    };
  }, [step, recorder.pauseForMarking]);

  // Listen for mark input blur (auto-resume from marking)
  useEffect(() => {
    console.log('[ScreenRecordingModal] Setting up mark input blur listener, step:', step);
    if (step !== 'recording') return;

    const cleanup = window.electronAPI.region.onMarkInputBlur(() => {
      console.log('[ScreenRecordingModal] ===== MARK INPUT LOST FOCUS =====');
      console.log('[ScreenRecordingModal] isPaused:', recorder.isPaused);
      console.log('[ScreenRecordingModal] pauseSource:', (recorder as any).pauseSource);
      console.log('[ScreenRecordingModal] Calling resumeFromMarking()');
      recorder.resumeFromMarking();
    });

    console.log('[ScreenRecordingModal] ✅ Blur listener registered');
    return () => {
      console.log('[ScreenRecordingModal] Cleaning up mark input blur listener');
      cleanup();
    };
  }, [step, recorder.resumeFromMarking]);

  // Keyboard shortcuts during recording
  useEffect(() => {
    if (step !== 'recording') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!recorder.isRecording) return;

      const target = e.target as HTMLElement;
      const isTypingNote = target === noteInputRef.current;

      // Cmd+H (or Ctrl+H): Toggle duration mark input field
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyH') {
        e.preventDefault();
        window.electronAPI.region.sendInputFieldToggle();
        return;
      }

      if (e.code === 'Space' && !isTypingNote) {
        e.preventDefault();
        if (recorder.isPaused) recorder.resumeRecording('keyboard:space');
        else recorder.pauseRecording('manual', 'keyboard:space');
      } else if (e.code === 'Enter') {
        e.preventDefault();
        recorder.handleMarkToggle();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        // If marking is active, cancel it (auto-resume will happen via blur event)
        if (recorder.isMarking) {
          console.log('[ScreenRecordingModal] Escape pressed - canceling marking');
          recorder.handleMarkToggle(); // Cancel marking
        } else if (!isTypingNote) {
          handleClose(); // Close modal
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step, recorder.isRecording, recorder.isPaused, recorder.handleMarkToggle, recorder.pauseRecording, recorder.resumeRecording]);

  const handleSourceSelect = async (source: ScreenSource) => {
    const dimensions = getResolutionDimensions(settings.resolution);
    setStep('recording');

    await recorder.startRecording(
      source.id,
      source.name,
      dimensions,
      settings.fps
    );
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {step === 'source-selection' && 'Screen Recording'}
            {step === 'recording' && `Recording: ${recorder.selectedSource?.name}`}
            {step === 'saving' && 'Saving Recording...'}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            disabled={step === 'saving'}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'source-selection' && (
            <div className="space-y-6">
              {/* Quality Preset Selector */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  Recording Quality
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {Object.keys(QUALITY_PRESETS).map((presetName) => {
                    const preset = QUALITY_PRESETS[presetName as keyof typeof QUALITY_PRESETS];
                    const isActive = settings.presetName === presetName;

                    return (
                      <button
                        key={presetName}
                        onClick={() => updatePreset(presetName)}
                        className={`p-3 rounded-lg border-2 transition-all ${
                          isActive
                            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                        }`}
                      >
                        <div className={`font-medium text-sm ${
                          isActive ? 'text-primary-700 dark:text-primary-300' : 'text-gray-700 dark:text-gray-300'
                        }`}>
                          {presetName}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {preset.resolution} • {preset.fps}fps
                        </div>
                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          {preset.bitsPerPixel === 0.04 && 'Economy size'}
                          {preset.bitsPerPixel === 0.05 && 'Balanced'}
                          {preset.bitsPerPixel === 0.08 && 'CleanShot quality'}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Current Settings Summary */}
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <div className="text-xs text-gray-600 dark:text-gray-400 flex items-center justify-between">
                    <span>Current: {settings.resolution} • {settings.fps} FPS • {settings.fps < 24 ? 'VP9' : 'H.264'}</span>
                    <span className="text-gray-500">
                      Quality: {(settings.bitsPerPixel || 0.08).toFixed(2)} bpp
                    </span>
                  </div>
                </div>
              </div>

              <ScreenSourceSelector
                onSourceSelect={handleSourceSelect}
                onRegionSelect={handleRegionSelect}
                onCancel={handleClose}
                autoStartRegionSelection={autoStartRegionSelection}
              />
            </div>
          )}

          {step === 'recording' && (
            <div className="space-y-6">
              {/* Recording Status */}
              <div className="text-center">
                {recorder.isRecording && !recorder.isPaused && (
                  <div className="text-red-500 text-lg font-medium mb-2 flex items-center justify-center gap-2">
                    <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                    RECORDING
                  </div>
                )}

                {recorder.isPaused && (
                  <div className="text-yellow-500 text-lg font-medium mb-2 flex items-center justify-center gap-2">
                    <span className="w-3 h-3 bg-yellow-500 rounded-full" />
                    PAUSED
                  </div>
                )}

                {/* Settings Info */}
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  {/* Show region overlay settings if available, otherwise show global settings */}
                  {recorder.captureArea?.quality && recorder.captureArea?.fps ? (
                    <>
                      {recorder.captureArea.quality.toUpperCase()} • {recorder.captureArea.fps} FPS • {recorder.selectedCodec || 'WEBM'}
                    </>
                  ) : (
                    <>
                      {settings.resolution} • {settings.fps} FPS • {recorder.selectedCodec || 'WEBM'}
                    </>
                  )}
                </div>

                {/* Duration Marking */}
                {recorder.isRecording && (
                  <div className="flex flex-col items-center gap-2 mb-4">
                    {recorder.isMarking ? (
                      <>
                        <div className="flex items-center gap-2 text-primary-600 dark:text-primary-400 font-medium">
                          <span className="w-2 h-2 bg-primary-600 dark:bg-primary-400 rounded-full animate-pulse" />
                          Marking from {formatDuration(recorder.pendingMarkStart ?? 0)}...
                        </div>
                        <input
                          ref={noteInputRef}
                          type="text"
                          value={recorder.pendingMarkNote}
                          onChange={(e) => recorder.setMarkNote(e.target.value)}
                          placeholder="Type a note (optional) - Press Enter to end mark"
                          className="w-96 px-3 py-1.5 text-sm rounded-lg border border-primary-300 dark:border-primary-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
                        />
                      </>
                    ) : recorder.completedMarks.length > 0 ? (
                      <div className="text-gray-500 dark:text-gray-400 text-sm">
                        {recorder.completedMarks.length} mark{recorder.completedMarks.length !== 1 ? 's' : ''} saved
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Duration Display */}
                <div className="text-5xl font-mono font-bold text-gray-900 dark:text-gray-100 mb-8">
                  {formatDuration(recorder.duration)}
                </div>

                {/* Controls */}
                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={recorder.isPaused
                      ? () => recorder.resumeRecording('ui:button')
                      : () => recorder.pauseRecording('manual', 'ui:button')}
                    className="w-16 h-16 bg-yellow-500 hover:bg-yellow-600 text-white rounded-full flex items-center justify-center text-2xl transition-colors"
                    title={recorder.isPaused ? 'Resume' : 'Pause'}
                  >
                    {recorder.isPaused ? '▶' : '⏸'}
                  </button>

                  <button
                    onClick={handleStopRecording}
                    className="w-20 h-20 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center text-2xl transition-colors"
                    title="Stop and save"
                  >
                    ⏹
                  </button>
                </div>

                {/* Instructions */}
                <div className="mt-6 text-sm text-gray-500 dark:text-gray-400 space-y-1">
                  <div className="flex items-center gap-3">
                    <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded w-16 text-center">Space</kbd>
                    <span>Pause/Resume</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded w-16 text-center">Enter</kbd>
                    <span>Start/End Duration Mark (+ add optional note)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded w-16 text-center">ESC</kbd>
                    <span>Cancel Recording</span>
                  </div>
                </div>
              </div>

              {/* Error Display */}
              {recorder.error && (
                <div className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-4 rounded-lg">
                  {recorder.error}
                </div>
              )}
            </div>
          )}

          {step === 'saving' && (
            <div className="text-center py-12">
              <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600 dark:text-gray-400">Saving screen recording...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
