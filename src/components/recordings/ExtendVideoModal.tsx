import { useState, useEffect } from 'react';
import { useScreenRecorder } from '../../hooks/useScreenRecorder';
import { useScreenRecordingSettings } from '../../context/ScreenRecordingSettingsContext';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { formatDuration } from '../../utils/formatters';
import type { Recording, VideoWithThumbnail, CaptureArea, VideoCompressionOptions } from '../../types';

interface ExtendVideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  recording: Recording;
  onExtensionSaved: () => void;
}

type Phase = 'region-selection' | 'recording' | 'compression' | 'merging';

const DEFAULT_COMPRESSION_OPTIONS: VideoCompressionOptions = {
  crf: 20,
  preset: 'medium',
  audioBitrate: '128k'
};

const resolveQualityPreset = (resolution: string | null): CaptureArea['quality'] | undefined => {
  if (!resolution) return undefined;
  const normalized = resolution.trim().toLowerCase();

  if (normalized === '480p' || normalized === '720p' || normalized === '1080p') {
    return normalized as CaptureArea['quality'];
  }

  const match = normalized.match(/(\d+)\s*[x×]\s*(\d+)/);
  if (!match) return undefined;

  const width = parseInt(match[1], 10);
  const height = parseInt(match[2], 10);
  const minDimension = Math.min(width, height);

  if (minDimension <= 480) return '480p';
  if (minDimension <= 720) return '720p';
  return '1080p';
};

export default function ExtendVideoModal({
  isOpen,
  onClose,
  recording,
  onExtensionSaved,
}: ExtendVideoModalProps) {
  const [phase, setPhase] = useState<Phase>('region-selection');
  const [isMerging, setIsMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [selectedImages, setSelectedImages] = useState<{ data: ArrayBuffer; extension: string }[]>([]);
  const [selectedVideos, setSelectedVideos] = useState<VideoWithThumbnail[]>([]);
  const [extensionFilePath, setExtensionFilePath] = useState<string | null>(null);
  const [extensionAudioBuffer, setExtensionAudioBuffer] = useState<ArrayBuffer | null>(null);
  const [extensionAudioConfig, setExtensionAudioConfig] = useState<{ bitrate: '32k' | '64k' | '128k'; channels: 1 | 2 } | null>(null);
  const [extensionAudioOffsetMs, setExtensionAudioOffsetMs] = useState<number | null>(null);

  const recorder = useScreenRecorder();
  const { settings } = useScreenRecordingSettings();

  // Fetch fresh recording data when modal opens (prevents stale duration offset)
  const [currentRecording, setCurrentRecording] = useState(recording);

  useEffect(() => {
    if (isOpen) {
      const fetchFreshRecording = async () => {
        const fresh = await window.electronAPI.recordings.getById(recording.id);
        if (fresh) {
          console.log('[ExtendVideoModal] Loaded fresh recording:', {
            oldDuration: recording.video_duration,
            freshDuration: fresh.video_duration
          });
          setCurrentRecording(fresh);
        }
      };
      fetchFreshRecording();
    }
  }, [isOpen, recording.id]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setPhase('region-selection');
      setIsMerging(false);
      setMergeError(null);
      setSelectedImages([]);
      setSelectedVideos([]);
      setExtensionFilePath(null);
      setExtensionAudioBuffer(null);
      setExtensionAudioConfig(null);
      setExtensionAudioOffsetMs(null);
      recorder.resetRecording();
    }
  }, [isOpen]);

  // Set extension mode when modal opens
  useEffect(() => {
    if (isOpen && phase === 'region-selection') {
      // Set extension mode for region selection
      window.electronAPI.region.setExtensionMode(true);

      // Listen for region selected for extension
      const cleanup = window.electronAPI.region.onRegionSelectedForExtension((region: CaptureArea) => {
        console.log('[ExtendVideoModal] Region selected for extension:', region);
        setPhase('recording');

        const resolvedQuality = resolveQualityPreset(currentRecording.video_resolution) ?? region.quality;
        const resolvedFps = currentRecording.video_fps ?? region.fps ?? settings.fps ?? 30;

        const extensionRegion: CaptureArea = {
          ...region,
          recordingId: currentRecording.id,
          quality: resolvedQuality,
          fps: resolvedFps
        };

        // Start recording immediately with the selected region
        recorder.startRecordingWithRegion(extensionRegion, resolvedFps);
      });

      return () => {
        // Clear extension mode when modal closes or phase changes
        window.electronAPI.region.setExtensionMode(false);
        cleanup();
      };
    }
  }, [
    isOpen,
    phase,
    recorder,
    currentRecording.id,
    currentRecording.video_fps,
    currentRecording.video_resolution,
    settings.fps
  ]);

  // Send duration updates to overlay
  useEffect(() => {
    if (phase !== 'recording' || !recorder.isRecording) return;

    window.electronAPI.region.updateDuration(recorder.duration);
  }, [phase, recorder.isRecording, recorder.duration]);

  // Listen for pause/resume from overlay
  useEffect(() => {
    if (phase !== 'recording') return;

    const cleanupPause = window.electronAPI.region.onPauseRecording(() => {
      console.log('[ExtendVideoModal] Received pause event from overlay');
      console.log('[ExtendVideoModal] Calling recorder.pauseRecording()');
      recorder.pauseRecording();
    });

    const cleanupResume = window.electronAPI.region.onResumeRecording(() => {
      console.log('[ExtendVideoModal] Received resume event from overlay');
      console.log('[ExtendVideoModal] Calling recorder.resumeRecording()');
      recorder.resumeRecording();
    });

    return () => {
      cleanupPause();
      cleanupResume();
    };
  }, [phase, recorder]);

  // Broadcast pause state to overlay whenever it changes
  useEffect(() => {
    if (phase !== 'recording') return;

    console.log('[ExtendVideoModal] Pause state changed, broadcasting to overlay:', recorder.isPaused);
    window.electronAPI.region.sendPauseStateUpdate(recorder.isPaused);
  }, [phase, recorder.isPaused]);

  // Listen for stop recording from overlay
  useEffect(() => {
    if (phase !== 'recording') return;

    const cleanup = window.electronAPI.region.onRecordingStop(() => {
      console.log('[ExtendVideoModal] Stop button clicked on overlay');
      handleStopRecording();
    });

    return () => cleanup();
  }, [phase]);

  // Listen for Cmd+H input field toggle
  useEffect(() => {
    if (phase !== 'recording') return;

    const cleanup = window.electronAPI.region.onInputFieldToggle(() => {
      console.log('[ExtendVideoModal] Cmd+H pressed - toggling duration mark');
      recorder.handleMarkToggle();
    });

    return () => cleanup();
  }, [phase, recorder]);

  // Listen for Enter key mark toggle from overlay
  useEffect(() => {
    if (phase !== 'recording') return;

    const cleanup = window.electronAPI.region.onMarkToggle(() => {
      console.log('[ExtendVideoModal] Enter key pressed in overlay - toggling duration mark');
      recorder.handleMarkToggle();
    });

    return () => cleanup();
  }, [phase, recorder]);

  // Synchronize marking state to overlay (enables input field to appear)
  useEffect(() => {
    if (phase !== 'recording') return;

    console.log('[ExtendVideoModal] Sending mark state to overlay:', {
      isMarking: recorder.isMarking,
      startTime: recorder.pendingMarkStart ?? 0
    });

    window.electronAPI.region.sendMarkStateUpdate(
      recorder.isMarking,
      recorder.pendingMarkStart ?? 0
    );
  }, [phase, recorder.isMarking, recorder.pendingMarkStart]);

  // Send note updates to overlay
  useEffect(() => {
    if (phase !== 'recording' || !recorder.isMarking) return;

    window.electronAPI.region.sendMarkNote(recorder.pendingMarkNote);
  }, [phase, recorder.isMarking, recorder.pendingMarkNote]);

  // Listen for note updates from overlay
  useEffect(() => {
    if (phase !== 'recording') return;

    const cleanup = window.electronAPI.region.onMarkNoteUpdate((note) => {
      recorder.setMarkNote(note);
    });

    return () => cleanup();
  }, [phase, recorder]);

  const handleClose = () => {
    if (isMerging) return; // Prevent closing during merge

    // Clean up extension mode
    window.electronAPI.region.setExtensionMode(false);

    if (recorder.isRecording) {
      recorder.stopRecording();
    }
    recorder.resetRecording();
    setExtensionFilePath(null);
    setExtensionAudioBuffer(null);
    setExtensionAudioConfig(null);
    setExtensionAudioOffsetMs(null);
    onClose();
  };

  const handleStopRecording = async () => {
    const result = await recorder.stopRecording();
    setExtensionFilePath(result?.filePath ?? null);
    setExtensionAudioConfig(result?.audioConfig ?? null);
    setExtensionAudioOffsetMs(result?.audioOffsetMs ?? null);

    if (result?.audioBlob && result.audioBlob.size > 0) {
      const audioBuffer = await result.audioBlob.arrayBuffer();
      setExtensionAudioBuffer(audioBuffer);
    } else {
      setExtensionAudioBuffer(null);
    }
    setPhase('compression');
  };

  const handlePickImages = async () => {
    try {
      const result = await window.electronAPI.clipboard.readImage();
      if (result.success && result.buffer) {
        setSelectedImages(prev => [...prev, { data: result.buffer!, extension: result.extension || 'png' }]);
      } else {
        alert('No image found in clipboard. Copy an image first, then click Paste.');
      }
    } catch (error) {
      console.error('Failed to read clipboard:', error);
      alert('Could not read clipboard. Make sure you have copied an image.');
    }
  };

  const handlePickVideos = async () => {
    try {
      const result = await window.electronAPI.clipboard.readFileUrl();
      if (result.success && result.filePath) {
        const videoExtensions = ['.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v'];
        const ext = result.filePath.toLowerCase().slice(result.filePath.lastIndexOf('.'));
        if (videoExtensions.includes(ext)) {
          const videoPath = result.filePath;

          // Add video with null thumbnail initially
          const tempVideo: VideoWithThumbnail = {
            filePath: videoPath,
            thumbnailPath: null,
            isGenerating: true
          };
          setSelectedVideos(prev => [...prev, tempVideo]);

          // Generate thumbnail asynchronously
          try {
            const { thumbnailPath } = await window.electronAPI.video.generateThumbnail(videoPath);
            setSelectedVideos(prev =>
              prev.map(v =>
                v.filePath === videoPath
                  ? { ...v, thumbnailPath, isGenerating: false }
                  : v
              )
            );
          } catch (error) {
            console.error('Thumbnail generation failed:', error);
            setSelectedVideos(prev =>
              prev.map(v =>
                v.filePath === videoPath
                  ? { ...v, isGenerating: false }
                  : v
              )
            );
          }
        } else {
          alert(`The copied file is not a video (${ext}). Supported formats: MP4, MOV, WebM, AVI, MKV, M4V`);
        }
      } else {
        alert('No file found in clipboard. Copy a video file first, then click Paste.');
      }
    } catch (error) {
      console.error('Failed to read clipboard:', error);
      alert('Could not read clipboard. Make sure you have copied a video file.');
    }
  };

  // Note: Screen recorder doesn't support adding media to individual duration marks
  // (unlike voice recorder). Duration marks are simplified to just start/end/note.

  const handleMerge = async () => {
    if (!recorder.videoBlob && !extensionFilePath) return;

    setPhase('merging');
    setIsMerging(true);
    setMergeError(null);

    try {
      // 1. Calculate durations
      const originalDurationMs = (currentRecording.video_duration ?? 0) * 1000;
      const extensionDurationMs = recorder.duration * 1000;

      // 2. Prepare extension source
      let extensionSource: ArrayBuffer | string;

      if (extensionFilePath) {
        let preparedExtensionPath = extensionFilePath;

        if (extensionAudioBuffer && extensionAudioConfig) {
          const resolution = currentRecording.video_resolution || settings.resolution || '1080p';
          const fps = currentRecording.video_fps ?? settings.fps ?? 30;
          const finalized = await window.electronAPI.screenRecording.finalizeFile(
            recording.id,
            extensionFilePath,
            resolution,
            fps,
            extensionDurationMs,
            extensionAudioBuffer,
            extensionAudioConfig.bitrate,
            extensionAudioConfig.channels,
            extensionAudioOffsetMs ?? undefined
          );
          preparedExtensionPath = finalized.filePath;
          setExtensionFilePath(finalized.filePath);
          setExtensionAudioBuffer(null);
          setExtensionAudioConfig(null);
        }

        extensionSource = preparedExtensionPath;
      } else {
        extensionSource = await recorder.videoBlob!.arrayBuffer();
      }

      // 3. Merge video files using native FFmpeg
      console.log('[ExtendVideo] Merging video files with native FFmpeg...');
      console.log('[ExtendVideo] Audio offset:', extensionAudioOffsetMs);
      const result = await window.electronAPI.video.mergeExtension(
        recording.id,
        extensionSource,
        originalDurationMs,
        extensionDurationMs,
        DEFAULT_COMPRESSION_OPTIONS,
        extensionAudioOffsetMs ?? undefined
      );

      if (!result.success) {
        throw new Error(result.error || 'Merge failed');
      }
      console.log('[ExtendVideo] Video merged successfully');

      // 4. Update recording duration in database
      const durationToSave = Math.floor(result.totalDurationMs / 1000);

      console.log('[ExtendVideo] ===== DATABASE UPDATE DEBUG =====');
      console.log('[ExtendVideo] Update details:', {
        recordingId: recording.id,
        recordingName: recording.name || 'Unnamed',
        beforeUpdate: {
          originalDuration: currentRecording.video_duration,
          extensionDuration: recorder.duration,
          formatted: formatDuration(currentRecording.video_duration)
        },
        mergeResult: {
          totalDurationMs: result.totalDurationMs,
          totalDurationSeconds: durationToSave,
          formatted: formatDuration(durationToSave)
        },
        willSaveToDB: durationToSave
      });

      await window.electronAPI.recordings.update(recording.id, {
        video_duration: durationToSave
      });

      console.log('[ExtendVideo] Database update completed for recording ID:', recording.id);
      console.log('[ExtendVideo] ===================================');

      // 5. Save duration marks with offset timestamps (adjusted for original duration)
      const offsetSeconds = currentRecording.video_duration ?? 0;
      for (const mark of recorder.completedMarks) {
        await window.electronAPI.durations.create({
          recording_id: recording.id,
          start_time: mark.start + offsetSeconds,
          end_time: mark.end + offsetSeconds,
          note: mark.note ?? null,
        });
      }

      // 6. Add any recording-level images/videos
      for (const image of selectedImages) {
        await window.electronAPI.media.addImageFromClipboard(recording.id, image.data, image.extension);
      }
      for (const video of selectedVideos) {
        await window.electronAPI.media.addVideo(recording.id, video.filePath);
      }

      // Success - reset and close
      console.log('[ExtendVideo] Recording extended successfully');
      recorder.resetRecording();
      onExtensionSaved();
      onClose();
    } catch (error) {
      console.error('[ExtendVideo] Failed to extend recording:', error);
      setMergeError(error instanceof Error ? error.message : 'Failed to extend recording');
      setPhase('compression'); // Go back to compression phase on error
    } finally {
      setIsMerging(false);
    }
  };

  const originalDuration = currentRecording.video_duration ?? 0;
  const extensionDuration = recorder.duration;
  const totalDuration = originalDuration + extensionDuration;
  const qualityLabel = currentRecording.video_resolution ?? 'Auto';
  const fpsLabel = currentRecording.video_fps ?? settings.fps ?? 30;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        phase === 'region-selection' ? 'Select Capture Region' :
        phase === 'recording' ? 'Extend Video Recording' :
        phase === 'compression' ? 'Extension Summary' :
        'Extending Recording...'
      }
      size="lg"
    >
      {/* Original recording info */}
      <div className="mb-4 p-3 bg-gray-100 dark:bg-dark-hover rounded-lg">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Original recording:
          </span>
          <span className="font-mono text-gray-900 dark:text-gray-100">
            🎬 {formatDuration(originalDuration)}
          </span>
        </div>
        {recording.name && (
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">
            {recording.name}
          </div>
        )}
        {currentRecording.video_resolution && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {currentRecording.video_resolution} • {currentRecording.video_fps}fps
          </div>
        )}
      </div>

      {phase === 'region-selection' && (
        <div className="py-12 flex flex-col items-center justify-center text-center">
          <div className="text-6xl mb-4">⌨️</div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            Press Cmd+D to Select Capture Region
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md">
            Use Cmd+D (or Ctrl+D) to open the region selector. Draw a rectangle around the area you want to record for the extension.
          </p>
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg max-w-md">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              💡 Tip: The extension will be added at +{formatDuration(originalDuration)}
            </p>
          </div>
        </div>
      )}

      {phase === 'recording' && (
        <div className="space-y-4">
          {/* Recording status */}
          <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <span className="font-medium text-gray-900 dark:text-gray-100">
                Recording extension...
              </span>
              <span className="font-mono text-gray-600 dark:text-gray-400">
                {formatDuration(recorder.duration)}
              </span>
            </div>
            <Button variant="danger" size="sm" onClick={handleStopRecording}>
              Stop Recording
            </Button>
          </div>

          {/* Show completed marks during recording */}
          {recorder.completedMarks.length > 0 && (
            <div className="p-3 bg-gray-50 dark:bg-dark-hover rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Marked Sections ({recorder.completedMarks.length})
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Will be added at +{formatDuration(originalDuration)}
                </span>
              </div>
              <div className="space-y-2">
                {recorder.completedMarks.map((mark, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 text-sm p-2 rounded bg-gray-50 dark:bg-dark-surface"
                  >
                    <span className="text-gray-600 dark:text-gray-400">
                      {formatDuration(mark.start)} → {formatDuration(mark.end)}
                    </span>
                    {mark.note && (
                      <span className="text-gray-500 dark:text-gray-400 text-xs">
                        ({mark.note})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {phase === 'compression' && (
        <div className="space-y-4">
          {/* Extension info */}
          {(recorder.videoBlob || extensionFilePath) && (
            <div className="flex items-center gap-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <span className="text-green-500 text-xl">✓</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                Extension recorded
              </span>
              <span className="text-gray-500 dark:text-gray-400">
                +{formatDuration(extensionDuration)}
              </span>
              <span className="text-gray-400 dark:text-gray-500">
                → Total: {formatDuration(totalDuration)}
              </span>
            </div>
          )}

          {/* Error message */}
          {mergeError && (
            <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
              {mergeError}
            </div>
          )}

          {/* Extension summary */}
          <div className="p-4 bg-gray-50 dark:bg-dark-hover rounded-lg">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Extension Summary
            </h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <span className="text-gray-600 dark:text-gray-400">Extension duration</span>
              <span className="font-mono text-gray-900 dark:text-gray-100">
                +{formatDuration(extensionDuration)}
              </span>
              <span className="text-gray-600 dark:text-gray-400">Total duration</span>
              <span className="font-mono text-gray-900 dark:text-gray-100">
                {formatDuration(totalDuration)}
              </span>
              <span className="text-gray-600 dark:text-gray-400">Quality</span>
              <span className="text-gray-900 dark:text-gray-100">
                {qualityLabel} • {fpsLabel}fps
              </span>
              <span className="text-gray-600 dark:text-gray-400">Marked sections</span>
              <span className="text-gray-900 dark:text-gray-100">
                {recorder.completedMarks.length}
              </span>
            </div>
            <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              Extension quality is locked to the original recording.
            </div>
          </div>

          {/* Duration marks from extension */}
          {recorder.completedMarks.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Extension Durations ({recorder.completedMarks.length})
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Will be offset by +{formatDuration(originalDuration)}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {recorder.completedMarks.map((mark, index) => (
                  <div
                    key={index}
                    className="relative px-3 py-1.5 rounded-lg text-sm bg-gray-100 dark:bg-dark-surface"
                  >
                    <span className="text-gray-700 dark:text-gray-300">
                      {formatDuration(mark.start)} → {formatDuration(mark.end)}
                    </span>
                    {mark.note && (
                      <span className="ml-2 text-gray-500 dark:text-gray-400 text-xs">
                        ({mark.note})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Media attachments */}
          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={handlePickImages}
              type="button"
            >
              📋 Paste Image {selectedImages.length > 0 && `(${selectedImages.length})`}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handlePickVideos}
              type="button"
            >
              📋 Paste Video {selectedVideos.length > 0 && `(${selectedVideos.length})`}
            </Button>
          </div>

          {/* Preview selected files */}
          {(selectedImages.length > 0 || selectedVideos.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {selectedImages.map((image, i) => {
                const blob = new Blob([image.data], { type: `image/${image.extension}` });
                const previewUrl = URL.createObjectURL(blob);
                return (
                  <div
                    key={i}
                    className="relative w-16 h-16 rounded overflow-hidden bg-gray-100 dark:bg-dark-border"
                  >
                    <img
                      src={previewUrl}
                      alt=""
                      className="w-full h-full object-cover"
                      onLoad={() => URL.revokeObjectURL(previewUrl)}
                    />
                    <button
                      onClick={() => setSelectedImages(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute top-0 right-0 bg-red-500 text-white text-xs w-5 h-5 flex items-center justify-center"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
              {selectedVideos.map((video, i) => (
                <div key={i} className="relative w-16 h-16 rounded overflow-hidden bg-gray-100 dark:bg-dark-border">
                  {video.isGenerating ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : video.thumbnailPath ? (
                    <img
                      src={window.electronAPI.paths.getFileUrl(video.thumbnailPath)}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl">🎬</div>
                  )}
                  <button
                    onClick={() => setSelectedVideos(prev => prev.filter((_, idx) => idx !== i))}
                    className="absolute top-0 right-0 bg-red-500 text-white text-xs w-5 h-5"
                  >×</button>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={handleMerge}>
              Extend Recording
            </Button>
          </div>
        </div>
      )}

      {phase === 'merging' && (
        <div className="py-12 flex flex-col items-center justify-center">
          <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mb-4" />
          <p className="text-gray-700 dark:text-gray-300 font-medium">
            Merging video files...
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            This may take a moment for longer recordings
          </p>
          {originalDuration > 300 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-3 text-center max-w-xs">
              Note: For recordings over 5 minutes, merging can take a while. The extension may need to be compressed before merging.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
