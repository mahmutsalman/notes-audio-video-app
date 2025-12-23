import { useState, useEffect } from 'react';
import { useScreenRecorder } from '../../hooks/useScreenRecorder';
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
  const [compressionOptions, setCompressionOptions] = useState<VideoCompressionOptions>({
    crf: 35,
    preset: 'slow',
    audioBitrate: '32k'
  });

  const recorder = useScreenRecorder();

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

        // Start recording immediately with the selected region
        const fps = 10; // Default FPS, could be made configurable
        recorder.startRecordingWithRegion(region, fps);
      });

      return () => {
        // Clear extension mode when modal closes or phase changes
        window.electronAPI.region.setExtensionMode(false);
        cleanup();
      };
    }
  }, [isOpen, phase, recorder]);

  // Send duration updates to overlay
  useEffect(() => {
    if (phase !== 'recording' || !recorder.isRecording) return;

    window.electronAPI.region.updateDuration(recorder.duration);
  }, [phase, recorder.isRecording, recorder.duration]);

  // Listen for pause/resume from overlay
  useEffect(() => {
    if (phase !== 'recording') return;

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
  }, [phase, recorder]);

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
    onClose();
  };

  const handleStopRecording = async () => {
    await recorder.stopRecording();
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
    if (!recorder.videoBlob) return;

    setPhase('merging');
    setIsMerging(true);
    setMergeError(null);

    try {
      // 1. Calculate durations
      const originalDurationMs = (currentRecording.video_duration ?? 0) * 1000;
      const extensionDurationMs = recorder.duration * 1000;

      // 2. Get extension as ArrayBuffer
      const extensionBuffer = await recorder.videoBlob.arrayBuffer();

      // 3. Merge video files using native FFmpeg
      console.log('[ExtendVideo] Merging video files with native FFmpeg...');
      const result = await window.electronAPI.video.mergeExtension(
        recording.id,
        extensionBuffer,
        originalDurationMs,
        extensionDurationMs,
        compressionOptions
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        phase === 'region-selection' ? 'Select Capture Region' :
        phase === 'recording' ? 'Extend Video Recording' :
        phase === 'compression' ? 'Compression Settings' :
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
        {recording.video_resolution && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {recording.video_resolution} • {recording.video_fps}fps
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
          {recorder.videoBlob && (
            <div className="flex items-center gap-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <span className="text-green-500 text-xl">✓</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                Extension recorded
              </span>
              <span className="text-gray-500 dark:text-gray-400">
                +{formatDuration(recorder.duration)}
              </span>
              <span className="text-gray-400 dark:text-gray-500">
                → Total: {formatDuration(originalDuration + recorder.duration)}
              </span>
            </div>
          )}

          {/* Error message */}
          {mergeError && (
            <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
              {mergeError}
            </div>
          )}

          {/* Compression settings */}
          <div className="p-4 bg-gray-50 dark:bg-dark-hover rounded-lg">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Compression Settings
            </h4>

            {/* CRF Slider */}
            <div className="mb-4">
              <label className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
                <span>Quality (CRF)</span>
                <span className="font-mono">{compressionOptions.crf}</span>
              </label>
              <input
                type="range"
                min="23"
                max="40"
                value={compressionOptions.crf}
                onChange={(e) => setCompressionOptions(prev => ({ ...prev, crf: parseInt(e.target.value) }))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span>Higher quality (larger)</span>
                <span>Lower quality (smaller)</span>
              </div>
            </div>

            {/* Preset Select */}
            <div className="mb-4">
              <label className="text-sm text-gray-600 dark:text-gray-400 mb-2 block">
                Encoding Speed
              </label>
              <select
                value={compressionOptions.preset}
                onChange={(e) => setCompressionOptions(prev => ({ ...prev, preset: e.target.value as any }))}
                className="w-full px-3 py-2 bg-white dark:bg-dark-surface border border-gray-300 dark:border-dark-border rounded-lg"
              >
                <option value="ultrafast">Ultra Fast (lowest compression)</option>
                <option value="fast">Fast</option>
                <option value="medium">Medium</option>
                <option value="slow">Slow (recommended)</option>
                <option value="veryslow">Very Slow (best compression)</option>
              </select>
            </div>

            {/* Audio Bitrate Select */}
            <div>
              <label className="text-sm text-gray-600 dark:text-gray-400 mb-2 block">
                Audio Bitrate
              </label>
              <select
                value={compressionOptions.audioBitrate}
                onChange={(e) => setCompressionOptions(prev => ({ ...prev, audioBitrate: e.target.value as any }))}
                className="w-full px-3 py-2 bg-white dark:bg-dark-surface border border-gray-300 dark:border-dark-border rounded-lg"
              >
                <option value="24k">24 kbps (very low)</option>
                <option value="32k">32 kbps (recommended for speech)</option>
                <option value="48k">48 kbps</option>
                <option value="64k">64 kbps</option>
                <option value="128k">128 kbps (high quality)</option>
              </select>
            </div>
          </div>

          {/* Duration marks from extension */}
          {recorder.completedMarks.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  New Marked Sections ({recorder.completedMarks.length})
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
