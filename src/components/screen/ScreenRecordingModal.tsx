import { useState, useEffect, useRef, useCallback } from 'react';
import ScreenSourceSelector from './ScreenSourceSelector';
import { useScreenRecorder } from '../../hooks/useScreenRecorder';
import { useScreenRecordingSettings, QUALITY_PRESETS } from '../../context/ScreenRecordingSettingsContext';
import type { ScreenSource, CaptureArea } from '../../types';

interface ScreenRecordingModalProps {
  isOpen: boolean;
  onClose: () => void;
  recordingId: number;
  onSave: (videoBlob: Blob, marks: any[]) => Promise<void>;
  autoStartRegionSelection?: boolean;
}

type Step = 'source-selection' | 'recording' | 'saving';

export default function ScreenRecordingModal({
  isOpen,
  onClose,
  recordingId: _recordingId, // Not used in component, but passed from parent
  onSave,
  autoStartRegionSelection = false,
}: ScreenRecordingModalProps) {
  const [step, setStep] = useState<Step>('source-selection');
  const recorder = useScreenRecorder();
  const { settings, getResolutionDimensions, updatePreset } = useScreenRecordingSettings();
  const noteInputRef = useRef<HTMLInputElement>(null);

  // Handler functions (defined before useEffects to avoid temporal dead zone)
  const handleClose = useCallback(() => {
    recorder.resetRecording();
    setStep('source-selection');
    onClose();
  }, [recorder, onClose]);

  const handleStopRecording = useCallback(async () => {
    setStep('saving');

    // Close overlay windows (region selector with blue rectangle)
    // This IPC call closes the overlay and sends recording:stop event back,
    // but the listener will be cleaned up by then since step changed to 'saving'
    window.electronAPI.region.stopRecording();

    const blob = await recorder.stopRecording();

    if (blob) {
      try {
        await onSave(blob, recorder.completedMarks);
        handleClose();
      } catch (error) {
        console.error('Failed to save recording:', error);
        // TODO: Show error message
      }
    }
  }, [recorder, onSave, handleClose]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setStep('source-selection');
      recorder.resetRecording();
    }
  }, [isOpen]);

  // Auto-focus note input when marking
  useEffect(() => {
    if (recorder.isMarking && noteInputRef.current) {
      noteInputRef.current.focus();
    }
  }, [recorder.isMarking]);

  // Log step changes for debugging
  useEffect(() => {
    console.log('[ScreenRecordingModal] step changed to:', step);
  }, [step]);

  // Listen for stop recording event from overlay
  useEffect(() => {
    if (step !== 'recording') return;

    console.log('[ScreenRecordingModal] Setting up recording:stop listener');
    const cleanup = window.electronAPI.region.onRecordingStop(() => {
      console.log('[ScreenRecordingModal] recording:stop event received from overlay');
      handleStopRecording();
    });

    return () => {
      console.log('[ScreenRecordingModal] Cleaning up recording:stop listener');
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
      recorder.pauseRecording();
    });

    const cleanupResume = window.electronAPI.region.onResumeRecording(() => {
      recorder.resumeRecording();
    });

    return () => {
      cleanupPause();
      cleanupResume();
    };
  }, [step, recorder]);

  // Keyboard shortcuts during recording
  useEffect(() => {
    if (step !== 'recording') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!recorder.isRecording) return;

      const target = e.target as HTMLElement;
      const isTypingNote = target === noteInputRef.current;

      if (e.code === 'Space' && !isTypingNote) {
        e.preventDefault();
        if (recorder.isPaused) recorder.resumeRecording();
        else recorder.pauseRecording();
      } else if (e.code === 'Enter') {
        e.preventDefault();
        recorder.handleMarkToggle();
      } else if (e.code === 'Escape' && !isTypingNote) {
        e.preventDefault();
        handleClose();
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

  const handleRegionSelect = async (region: CaptureArea) => {
    console.log('[ScreenRecordingModal] handleRegionSelect called with region:', region);
    console.log('[ScreenRecordingModal] Current step:', step);
    console.log('[ScreenRecordingModal] Setting step to recording');
    setStep('recording');
    console.log('[ScreenRecordingModal] Step set to recording');

    console.log('[ScreenRecordingModal] Calling startRecordingWithRegion');
    try {
      await recorder.startRecordingWithRegion(
        region,
        settings.fps
      );
      console.log('[ScreenRecordingModal] startRecordingWithRegion completed successfully');
    } catch (error) {
      console.error('[ScreenRecordingModal] startRecordingWithRegion failed:', error);
    }
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
                <div className="grid grid-cols-4 gap-2">
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
                          {preset.bitsPerPixel === 0.10 && 'Premium'}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Current Settings Summary */}
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <div className="text-xs text-gray-600 dark:text-gray-400 flex items-center justify-between">
                    <span>Current: {settings.resolution} • {settings.fps} FPS • H.264</span>
                    <span className="text-gray-500">
                      Quality: {(settings.bitsPerPixel || 0.18).toFixed(2)} bpp
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
                    onClick={recorder.isPaused ? recorder.resumeRecording : recorder.pauseRecording}
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
