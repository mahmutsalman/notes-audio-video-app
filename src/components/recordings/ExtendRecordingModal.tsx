import { useState, useEffect, useCallback } from 'react';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import Modal from '../common/Modal';
import Button from '../common/Button';
import AudioRecorder from '../audio/AudioRecorder';
import AudioPlayer from '../audio/AudioPlayer';
import { formatDuration } from '../../utils/formatters';
import type { Recording } from '../../types';

interface ExtendRecordingModalProps {
  isOpen: boolean;
  onClose: () => void;
  recording: Recording;
  onExtensionSaved: () => void;
}

type Phase = 'recording' | 'review' | 'merging';

export default function ExtendRecordingModal({
  isOpen,
  onClose,
  recording,
  onExtensionSaved,
}: ExtendRecordingModalProps) {
  const [phase, setPhase] = useState<Phase>('recording');
  const [isMerging, setIsMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [selectedImages, setSelectedImages] = useState<{ data: ArrayBuffer; extension: string }[]>([]);
  const [selectedVideos, setSelectedVideos] = useState<string[]>([]);
  const [selectedMarkIndex, setSelectedMarkIndex] = useState<number | null>(null);

  const recorder = useVoiceRecorder();

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setPhase('recording');
      setIsMerging(false);
      setMergeError(null);
      setSelectedImages([]);
      setSelectedVideos([]);
      setSelectedMarkIndex(null);
      recorder.resetRecording();
    }
  }, [isOpen]);

  const handleClose = () => {
    if (isMerging) return; // Prevent closing during merge

    if (recorder.isRecording) {
      recorder.stopRecording();
    }
    recorder.resetRecording();
    onClose();
  };

  const handleStopRecording = async () => {
    await recorder.stopRecording();
    setPhase('review');
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
          setSelectedVideos(prev => [...prev, result.filePath!]);
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

  // Handle Cmd+V to add image with priority: pending mark > selected mark > last mark
  const handlePasteToMark = useCallback(async () => {
    // PRIORITY 1: If there's a pending mark (currently being created), add to it
    if (recorder.isMarking || recorder.pendingMarkStart !== null) {
      try {
        const result = await window.electronAPI.clipboard.readImage();
        if (result.success && result.buffer) {
          return recorder.addImageToPendingMark({
            data: result.buffer,
            extension: result.extension || 'png'
          });
        }
      } catch (error) {
        console.error('Failed to read clipboard for pending mark:', error);
      }
      return false;
    }

    // PRIORITY 2: If a completed mark is selected, add to that mark
    if (selectedMarkIndex !== null && recorder.completedMarks[selectedMarkIndex]) {
      const mark = recorder.completedMarks[selectedMarkIndex];
      try {
        const result = await window.electronAPI.clipboard.readImage();
        if (result.success && result.buffer) {
          return recorder.addImageToMarkByStart(mark.start, {
            data: result.buffer,
            extension: result.extension || 'png'
          });
        }
      } catch (error) {
        console.error('Failed to read clipboard for selected mark:', error);
      }
      return false;
    }

    // PRIORITY 3: Fall back to last completed mark
    if (recorder.completedMarks.length === 0) return false;

    try {
      const result = await window.electronAPI.clipboard.readImage();
      if (result.success && result.buffer) {
        return recorder.addImageToLastMark({
          data: result.buffer,
          extension: result.extension || 'png'
        });
      }
    } catch (error) {
      console.error('Failed to read clipboard for last mark:', error);
    }
    return false;
  }, [recorder, selectedMarkIndex]);

  // Handle Cmd+V to add video with priority: pending mark > selected mark > last mark
  const handlePasteVideoToMark = useCallback(async () => {
    const isVideoFile = (filePath: string): boolean => {
      const videoExtensions = ['.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v'];
      const ext = filePath.toLowerCase().slice(filePath.lastIndexOf('.'));
      return videoExtensions.includes(ext);
    };

    // PRIORITY 1: If there's a pending mark (currently being created), add to it
    if (recorder.isMarking || recorder.pendingMarkStart !== null) {
      try {
        const result = await window.electronAPI.clipboard.readFileUrl();
        if (result.success && result.filePath && isVideoFile(result.filePath)) {
          return recorder.addVideoToPendingMark({ filePath: result.filePath });
        }
      } catch (error) {
        console.error('Failed to read clipboard for pending mark video:', error);
      }
      return false;
    }

    // PRIORITY 2: If a completed mark is selected, add to that mark
    if (selectedMarkIndex !== null && recorder.completedMarks[selectedMarkIndex]) {
      const mark = recorder.completedMarks[selectedMarkIndex];
      try {
        const result = await window.electronAPI.clipboard.readFileUrl();
        if (result.success && result.filePath && isVideoFile(result.filePath)) {
          return recorder.addVideoToMarkByStart(mark.start, { filePath: result.filePath });
        }
      } catch (error) {
        console.error('Failed to read clipboard for selected mark video:', error);
      }
      return false;
    }

    // PRIORITY 3: Fall back to last completed mark
    if (recorder.completedMarks.length === 0) return false;

    try {
      const result = await window.electronAPI.clipboard.readFileUrl();
      if (result.success && result.filePath && isVideoFile(result.filePath)) {
        return recorder.addVideoToLastMark({ filePath: result.filePath });
      }
    } catch (error) {
      console.error('Failed to read clipboard for last mark video:', error);
    }
    return false;
  }, [recorder, selectedMarkIndex]);

  // Keyboard listener for Cmd+V (smart detection: try image first, then video)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        // Try image first (most common)
        const imageAdded = await handlePasteToMark();
        if (imageAdded) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        // Try video second
        const videoAdded = await handlePasteVideoToMark();
        if (videoAdded) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handlePasteToMark, handlePasteVideoToMark]);

  const handleSave = async () => {
    if (!recorder.audioBlob) return;

    setPhase('merging');
    setIsMerging(true);
    setMergeError(null);

    try {
      // 1. Calculate durations
      const originalDurationMs = (recording.audio_duration ?? 0) * 1000;
      const extensionDurationMs = recorder.duration * 1000;

      // 2. Get extension as ArrayBuffer
      const extensionBuffer = await recorder.audioBlob.arrayBuffer();

      // 3. Merge audio files using native FFmpeg (fast!)
      console.log('[Extend] Merging audio files with native FFmpeg...');
      const result = await window.electronAPI.audio.mergeExtension(
        recording.id,
        extensionBuffer,
        originalDurationMs,
        extensionDurationMs
      );

      if (!result.success) {
        throw new Error(result.error || 'Merge failed');
      }
      console.log('[Extend] Audio merged successfully');

      // 4. Update recording duration in database
      await window.electronAPI.recordings.update(recording.id, {
        audio_duration: Math.floor(result.totalDurationMs / 1000)
      });

      // 5. Save duration marks with offset timestamps (adjusted for original duration)
      const offsetSeconds = recording.audio_duration ?? 0;
      for (const mark of recorder.completedMarks) {
        const duration = await window.electronAPI.durations.create({
          recording_id: recording.id,
          start_time: mark.start + offsetSeconds,
          end_time: mark.end + offsetSeconds,
          note: mark.note ?? null,
        });

        // Save images attached to this mark
        if (mark.images && mark.images.length > 0) {
          for (const image of mark.images) {
            await window.electronAPI.durationImages.addFromClipboard(
              duration.id,
              image.data,
              image.extension
            );
          }
        }

        // Save videos attached to this mark
        if (mark.videos && mark.videos.length > 0) {
          for (const video of mark.videos) {
            await window.electronAPI.durationVideos.addFromFile(
              duration.id,
              video.filePath
            );
          }
        }
      }

      // 6. Add any recording-level images/videos
      for (const image of selectedImages) {
        await window.electronAPI.media.addImageFromClipboard(recording.id, image.data, image.extension);
      }
      for (const videoPath of selectedVideos) {
        await window.electronAPI.media.addVideo(recording.id, videoPath);
      }

      // Success - reset and close
      console.log('[Extend] Recording extended successfully');
      recorder.resetRecording();
      onExtensionSaved();
      onClose();
    } catch (error) {
      console.error('[Extend] Failed to extend recording:', error);
      setMergeError(error instanceof Error ? error.message : 'Failed to extend recording');
      setPhase('review'); // Go back to review phase on error
    } finally {
      setIsMerging(false);
    }
  };

  const originalDuration = recording.audio_duration ?? 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={phase === 'merging' ? 'Extending Recording...' : 'Extend Recording'}
      size="lg"
    >
      {/* Original recording info */}
      <div className="mb-4 p-3 bg-gray-100 dark:bg-dark-hover rounded-lg">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Original recording:
          </span>
          <span className="font-mono text-gray-900 dark:text-gray-100">
            {formatDuration(originalDuration)}
          </span>
        </div>
        {recording.name && (
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">
            {recording.name}
          </div>
        )}
      </div>

      {phase === 'recording' && (
        <div className="space-y-4">
          <AudioRecorder
            recorder={recorder}
            onStopRecording={handleStopRecording}
          />

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
                {recorder.completedMarks.map((mark, index) => {
                  const imageCount = mark.images?.length || 0;
                  const videoCount = mark.videos?.length || 0;
                  const isSelected = selectedMarkIndex === index;
                  return (
                    <div
                      key={index}
                      onClick={() => setSelectedMarkIndex(index)}
                      className={`flex items-center gap-2 text-sm p-2 rounded cursor-pointer transition-colors
                        ${isSelected
                          ? 'bg-primary-100 dark:bg-primary-900/50 border-2 border-primary-500'
                          : 'hover:bg-gray-100 dark:hover:bg-dark-surface'
                        }`}
                    >
                      <span className="text-gray-600 dark:text-gray-400">
                        {formatDuration(mark.start)} → {formatDuration(mark.end)}
                      </span>
                      {imageCount > 0 && (
                        <span className="px-1.5 py-0.5 bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 rounded text-xs font-medium">
                          📷 {imageCount}
                        </span>
                      )}
                      {videoCount > 0 && (
                        <span className="px-1.5 py-0.5 bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 rounded text-xs font-medium">
                          🎬 {videoCount}
                        </span>
                      )}
                      {mark.note && (
                        <span className="text-gray-500 dark:text-gray-400 text-xs">
                          ({mark.note})
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Selected Mark Images & Videos - During Recording */}
          {selectedMarkIndex !== null && recorder.completedMarks[selectedMarkIndex] && (
            (() => {
              const mark = recorder.completedMarks[selectedMarkIndex];
              const images = mark.images || [];
              const videos = mark.videos || [];

              return (
                <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-blue-700 dark:text-blue-300">
                      Media for Selected Section ({images.length} images, {videos.length} videos)
                    </h4>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handlePasteToMark()}
                        className="px-3 py-1.5 text-xs bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
                      >
                        📋 Paste Image
                      </button>
                      <button
                        onClick={() => handlePasteVideoToMark()}
                        className="px-3 py-1.5 text-xs bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
                      >
                        📋 Paste Video
                      </button>
                    </div>
                  </div>
                  {images.length > 0 || videos.length > 0 ? (
                    <div className="space-y-3">
                      {images.length > 0 && (
                        <div>
                          <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">Images</div>
                          <div className="grid grid-cols-4 gap-2">
                            {images.map((img, imgIndex) => {
                              const blob = new Blob([img.data], { type: `image/${img.extension}` });
                              const previewUrl = URL.createObjectURL(blob);
                              return (
                                <div key={imgIndex} className="group relative">
                                  <div className="aspect-square rounded overflow-hidden bg-gray-100 dark:bg-dark-border">
                                    <img
                                      src={previewUrl}
                                      alt=""
                                      className="w-full h-full object-cover"
                                      onLoad={() => URL.revokeObjectURL(previewUrl)}
                                    />
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (recorder.removeImageFromMark) {
                                        recorder.removeImageFromMark(mark.start, imgIndex);
                                      }
                                    }}
                                    className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full
                                               opacity-0 group-hover:opacity-100 transition-opacity
                                               flex items-center justify-center text-sm"
                                  >
                                    ×
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {videos.length > 0 && (
                        <div>
                          <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">Videos</div>
                          <div className="space-y-1">
                            {videos.map((video, videoIndex) => (
                              <div key={videoIndex} className="group flex items-center gap-2 p-2 bg-white dark:bg-dark-surface rounded">
                                <span className="text-lg">🎬</span>
                                <span className="text-xs text-gray-600 dark:text-gray-400 flex-1 truncate">
                                  {video.filePath.split('/').pop()}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (recorder.removeVideoFromMark) {
                                      recorder.removeVideoFromMark(mark.start, videoIndex);
                                    }
                                  }}
                                  className="w-5 h-5 bg-red-500 text-white rounded-full
                                             opacity-0 group-hover:opacity-100 transition-opacity
                                             flex items-center justify-center text-sm"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-blue-400 dark:text-blue-500 italic text-sm">
                      No media yet. Click "Paste Image" or "Paste Video" or press Cmd+V to add.
                    </p>
                  )}
                </div>
              );
            })()
          )}
        </div>
      )}

      {phase === 'review' && (
        <div className="space-y-4">
          {/* Extension playback info */}
          {recorder.audioUrl && (
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

          {/* Audio player for extension preview */}
          {recorder.audioUrl && (
            <AudioPlayer src={recorder.audioUrl} duration={recorder.duration} />
          )}

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
                {recorder.completedMarks.map((mark, index) => {
                  const imageCount = mark.images?.length || 0;
                  const isSelected = selectedMarkIndex === index;
                  return (
                    <div
                      key={index}
                      onClick={() => setSelectedMarkIndex(index)}
                      className={`relative px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors
                        ${isSelected
                          ? 'bg-primary-100 dark:bg-primary-900/50 border-2 border-primary-500'
                          : 'bg-gray-100 dark:bg-dark-hover hover:bg-gray-200 dark:hover:bg-dark-surface'
                        }`}
                    >
                      <span className="text-gray-700 dark:text-gray-300">
                        {formatDuration(mark.start)} → {formatDuration(mark.end)}
                      </span>
                      {imageCount > 0 && (
                        <span className="ml-2 px-1.5 py-0.5 bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 rounded text-xs font-medium">
                          📷 {imageCount}
                        </span>
                      )}
                      {mark.note && (
                        <span className="ml-2 text-gray-500 dark:text-gray-400 text-xs">
                          ({mark.note})
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Selected Mark Images - During Review */}
          {selectedMarkIndex !== null && recorder.completedMarks[selectedMarkIndex] && (
            (() => {
              const mark = recorder.completedMarks[selectedMarkIndex];
              const images = mark.images || [];

              return (
                <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-blue-700 dark:text-blue-300">
                      Images for Selected Section ({images.length})
                    </h4>
                    <button
                      onClick={() => handlePasteToMark()}
                      className="px-3 py-1.5 text-xs bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
                    >
                      📋 Paste Image
                    </button>
                  </div>
                  {images.length > 0 ? (
                    <div className="grid grid-cols-4 gap-2">
                      {images.map((img, imgIndex) => {
                        const blob = new Blob([img.data], { type: `image/${img.extension}` });
                        const previewUrl = URL.createObjectURL(blob);
                        return (
                          <div key={imgIndex} className="group relative">
                            <div className="aspect-square rounded overflow-hidden bg-gray-100 dark:bg-dark-border">
                              <img
                                src={previewUrl}
                                alt=""
                                className="w-full h-full object-cover"
                                onLoad={() => URL.revokeObjectURL(previewUrl)}
                              />
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                // Will be implemented with removeImageFromMark from useVoiceRecorder
                                if (recorder.removeImageFromMark) {
                                  recorder.removeImageFromMark(mark.start, imgIndex);
                                }
                              }}
                              className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full
                                         opacity-0 group-hover:opacity-100 transition-opacity
                                         flex items-center justify-center text-sm"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-blue-400 dark:text-blue-500 italic text-sm">
                      No images yet. Click "Paste Image" or press Cmd+V to add.
                    </p>
                  )}
                </div>
              );
            })()
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
              {selectedVideos.map((videoPath, i) => (
                <div
                  key={i}
                  className="relative w-16 h-16 rounded overflow-hidden bg-gray-100 dark:bg-dark-border flex items-center justify-center"
                  title={videoPath.split('/').pop()}
                >
                  <span className="text-2xl">🎬</span>
                  <button
                    onClick={() => setSelectedVideos(prev => prev.filter((_, idx) => idx !== i))}
                    className="absolute top-0 right-0 bg-red-500 text-white text-xs w-5 h-5 flex items-center justify-center"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Extend Recording
            </Button>
          </div>
        </div>
      )}

      {phase === 'merging' && (
        <div className="py-12 flex flex-col items-center justify-center">
          <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mb-4" />
          <p className="text-gray-700 dark:text-gray-300 font-medium">
            Merging audio files...
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            This may take a moment for longer recordings
          </p>
          {originalDuration > 300 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-3 text-center max-w-xs">
              Note: For recordings over 5 minutes, merging can take a while as it needs to re-encode the entire audio.
              Check the console (Cmd+Option+I) for progress.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
