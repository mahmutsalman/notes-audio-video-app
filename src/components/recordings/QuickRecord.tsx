import { useState, useEffect, useCallback } from 'react';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import Modal from '../common/Modal';
import Button from '../common/Button';
import AudioRecorder from '../audio/AudioRecorder';
import AudioPlayer from '../audio/AudioPlayer';
import { formatDuration, formatTimestampName } from '../../utils/formatters';
import type { VideoWithThumbnail } from '../../types';

interface QuickRecordProps {
  topicId: number;
  onRecordingSaved: () => void;
}

export default function QuickRecord({ topicId, onRecordingSaved }: QuickRecordProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [phase, setPhase] = useState<'recording' | 'review'>('recording');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isPasting, setIsPasting] = useState(false);
  const [pasteSuccess, setPasteSuccess] = useState<'image' | 'video' | null>(null);
  const [selectedImages, setSelectedImages] = useState<{ data: ArrayBuffer; extension: string }[]>([]);
  const [selectedVideos, setSelectedVideos] = useState<VideoWithThumbnail[]>([]);
  const [selectedMarkIndex, setSelectedMarkIndex] = useState<number | null>(null);

  const recorder = useVoiceRecorder();

  // Auto-hide success indicator after 1.5 seconds
  useEffect(() => {
    if (pasteSuccess) {
      const timer = setTimeout(() => setPasteSuccess(null), 1500);
      return () => clearTimeout(timer);
    }
  }, [pasteSuccess]);

  const handleOpen = () => {
    setIsOpen(true);
    setPhase('recording');
    setNotes('');
    setSelectedImages([]);
    setSelectedVideos([]);
    setSelectedMarkIndex(null);
  };

  const handleClose = () => {
    if (recorder.isRecording) {
      recorder.stopRecording();
    }
    recorder.resetRecording();
    setIsOpen(false);
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
      // Try to read file URL from clipboard (works with CleanShot, Finder, etc.)
      const result = await window.electronAPI.clipboard.readFileUrl();

      if (result.success && result.filePath) {
        // Check if the file is a video by extension
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
        alert('No file found in clipboard. Copy a video file first (e.g., from CleanShot or Finder), then click Paste.');
      }
    } catch (error) {
      console.error('Failed to read clipboard:', error);
      alert('Could not read clipboard. Make sure you have copied a video file.');
    }
  };

  // Handle Cmd+V to add image to the current mark (priority: pending > selected > last completed)
  const handlePasteToMark = useCallback(async () => {
    // Priority 1: If marking (pending mark exists), add to pending mark
    if (recorder.isMarking) {
      try {
        const result = await window.electronAPI.clipboard.readImage();
        if (result.success && result.buffer) {
          const added = recorder.addImageToPendingMark({
            data: result.buffer,
            extension: result.extension || 'png'
          });
          return added;
        }
      } catch (error) {
        console.error('Failed to read clipboard for pending mark:', error);
      }
      return false;
    }

    // Priority 2: If a completed mark is selected, add to that mark
    if (selectedMarkIndex !== null && recorder.completedMarks[selectedMarkIndex]) {
      const mark = recorder.completedMarks[selectedMarkIndex];
      try {
        const result = await window.electronAPI.clipboard.readImage();
        if (result.success && result.buffer) {
          const added = recorder.addImageToMarkByStart(mark.start, {
            data: result.buffer,
            extension: result.extension || 'png'
          });
          return added;
        }
      } catch (error) {
        console.error('Failed to read clipboard for selected mark:', error);
      }
      return false;
    }

    // Priority 3: If no pending mark or selection but completed marks exist, add to last completed mark
    if (recorder.completedMarks.length > 0) {
      try {
        const result = await window.electronAPI.clipboard.readImage();
        if (result.success && result.buffer) {
          const added = recorder.addImageToLastMark({
            data: result.buffer,
            extension: result.extension || 'png'
          });
          return added;
        }
      } catch (error) {
        console.error('Failed to read clipboard for mark:', error);
      }
      return false;
    }

    // No marks to paste to
    return false;
  }, [recorder, selectedMarkIndex]);

  // Handle Cmd+V to add video to the current mark (priority: pending > selected > last completed)
  const handlePasteVideoToMark = useCallback(async () => {
    const isVideoFile = (filePath: string): boolean => {
      const videoExtensions = ['.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v'];
      const ext = filePath.toLowerCase().slice(filePath.lastIndexOf('.'));
      return videoExtensions.includes(ext);
    };

    // Priority 1: If marking (pending mark exists), add to pending mark
    if (recorder.isMarking) {
      try {
        const result = await window.electronAPI.clipboard.readFileUrl();
        if (result.success && result.filePath && isVideoFile(result.filePath)) {
          // Generate thumbnail for the video
          let thumbnailPath: string | null = null;
          try {
            const thumbResult = await window.electronAPI.video.generateThumbnail(result.filePath);
            if (thumbResult.success) {
              thumbnailPath = thumbResult.thumbnailPath;
            }
          } catch (err) {
            console.error('Failed to generate thumbnail:', err);
          }
          const added = recorder.addVideoToPendingMark({ filePath: result.filePath, thumbnailPath });
          return added;
        }
      } catch (error) {
        console.error('Failed to read clipboard for pending mark video:', error);
      }
      return false;
    }

    // Priority 2: If a completed mark is selected, add to that mark
    if (selectedMarkIndex !== null && recorder.completedMarks[selectedMarkIndex]) {
      const mark = recorder.completedMarks[selectedMarkIndex];
      try {
        const result = await window.electronAPI.clipboard.readFileUrl();
        if (result.success && result.filePath && isVideoFile(result.filePath)) {
          // Generate thumbnail for the video
          let thumbnailPath: string | null = null;
          try {
            const thumbResult = await window.electronAPI.video.generateThumbnail(result.filePath);
            if (thumbResult.success) {
              thumbnailPath = thumbResult.thumbnailPath;
            }
          } catch (err) {
            console.error('Failed to generate thumbnail:', err);
          }
          const added = recorder.addVideoToMarkByStart(mark.start, { filePath: result.filePath, thumbnailPath });
          return added;
        }
      } catch (error) {
        console.error('Failed to read clipboard for selected mark video:', error);
      }
      return false;
    }

    // Priority 3: If no pending mark or selection but completed marks exist, add to last completed mark
    if (recorder.completedMarks.length > 0) {
      try {
        const result = await window.electronAPI.clipboard.readFileUrl();
        if (result.success && result.filePath && isVideoFile(result.filePath)) {
          // Generate thumbnail for the video
          let thumbnailPath: string | null = null;
          try {
            const thumbResult = await window.electronAPI.video.generateThumbnail(result.filePath);
            if (thumbResult.success) {
              thumbnailPath = thumbResult.thumbnailPath;
            }
          } catch (err) {
            console.error('Failed to generate thumbnail:', err);
          }
          const added = recorder.addVideoToLastMark({ filePath: result.filePath, thumbnailPath });
          return added;
        }
      } catch (error) {
        console.error('Failed to read clipboard for mark video:', error);
      }
      return false;
    }

    // No marks to paste to
    return false;
  }, [recorder, selectedMarkIndex]);

  // Keyboard listener for Cmd+V to add image/video to current mark (works in both recording and review phases)
  useEffect(() => {
    if (!isOpen) return;
    // Only activate if there's a pending mark or completed marks
    if (!recorder.isMarking && recorder.completedMarks.length === 0) return;

    const handleKeyDown = async (e: KeyboardEvent) => {
      // Check for Cmd+V (macOS) or Ctrl+V (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'v' && !isPasting) {
        setIsPasting(true);
        try {
          // Try image first (most common)
          const imageAdded = await handlePasteToMark();
          if (imageAdded) {
            e.preventDefault();
            e.stopPropagation();
            setPasteSuccess('image');
            return;
          }

          // Try video second
          const videoAdded = await handlePasteVideoToMark();
          if (videoAdded) {
            e.preventDefault();
            e.stopPropagation();
            setPasteSuccess('video');
          }
        } finally {
          setIsPasting(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, recorder.isMarking, recorder.completedMarks.length, isPasting, handlePasteToMark, handlePasteVideoToMark]);

  const handleSave = async () => {
    if (!recorder.audioBlob) return;

    setIsSaving(true);

    try {
      // Create the recording with a default timestamp name
      const recording = await window.electronAPI.recordings.create({
        topic_id: topicId,
        name: formatTimestampName(),
        audio_path: null,
        audio_duration: recorder.duration,
        audio_size: null,
        video_path: null,
        video_duration: null,
        video_resolution: null,
        video_fps: null,
        video_size: null,
        notes_content: notes || null,
      });

      console.log('[QuickRecord] Recording created with ID:', recording.id);

      // Save the audio file
      const arrayBuffer = await recorder.audioBlob.arrayBuffer();
      await window.electronAPI.audio.save(
        recording.id,
        arrayBuffer,
        `recording_${Date.now()}.webm`
      );

      // Add images from clipboard data
      for (const image of selectedImages) {
        await window.electronAPI.media.addImageFromClipboard(recording.id, image.data, image.extension);
      }

      // Add videos from file paths
      for (const video of selectedVideos) {
        await window.electronAPI.media.addVideo(recording.id, video.filePath);
      }

      // Save duration marks and their images
      console.log('[QuickRecord] Saving duration marks. Total marks:', recorder.completedMarks.length);
      console.log('[QuickRecord] Completed marks data:', recorder.completedMarks);

      for (const mark of recorder.completedMarks) {
        console.log('[QuickRecord] Processing mark:', {
          start: mark.start,
          end: mark.end,
          note: mark.note,
          imageCount: mark.images?.length || 0,
          hasImages: !!(mark.images && mark.images.length > 0)
        });

        const duration = await window.electronAPI.durations.create({
          recording_id: recording.id,
          start_time: mark.start,
          end_time: mark.end,
          note: mark.note ?? null,
        });

        console.log('[QuickRecord] Duration created with ID:', duration.id);

        // Save images attached to this mark
        if (mark.images && mark.images.length > 0) {
          console.log(`[QuickRecord] Saving ${mark.images.length} images for duration ${duration.id}`);
          for (let i = 0; i < mark.images.length; i++) {
            const image = mark.images[i];
            console.log(`[QuickRecord] Saving image ${i + 1}/${mark.images.length}:`, {
              size: image.data.byteLength,
              extension: image.extension
            });

            try {
              const savedImage = await window.electronAPI.durationImages.addFromClipboard(
                duration.id,
                image.data,
                image.extension
              );
              console.log(`[QuickRecord] Image ${i + 1} saved successfully:`, savedImage);
            } catch (err) {
              console.error(`[QuickRecord] Failed to save image ${i + 1}:`, err);
            }
          }
        } else {
          console.log('[QuickRecord] No images to save for this mark');
        }

        // Save videos attached to this mark
        if (mark.videos && mark.videos.length > 0) {
          console.log(`[QuickRecord] Saving ${mark.videos.length} videos for duration ${duration.id}`);
          for (let i = 0; i < mark.videos.length; i++) {
            const video = mark.videos[i];
            console.log(`[QuickRecord] Saving video ${i + 1}/${mark.videos.length}:`, {
              filePath: video.filePath
            });

            try {
              const savedVideo = await window.electronAPI.durationVideos.addFromFile(
                duration.id,
                video.filePath
              );
              console.log(`[QuickRecord] Video ${i + 1} saved successfully:`, savedVideo);
            } catch (err) {
              console.error(`[QuickRecord] Failed to save video ${i + 1}:`, err);
            }
          }
        } else {
          console.log('[QuickRecord] No videos to save for this mark');
        }
      }

      // Reset and close
      recorder.resetRecording();
      setIsOpen(false);
      onRecordingSaved();
    } catch (error) {
      console.error('Failed to save recording:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {/* FAB Button */}
      <button
        onClick={handleOpen}
        className="fixed bottom-8 right-8 w-16 h-16 bg-primary-600 hover:bg-primary-700
                   text-white rounded-full shadow-lg hover:shadow-xl transition-all
                   flex items-center justify-center text-2xl
                   focus:outline-none focus:ring-4 focus:ring-primary-500/50"
        title="Add new recording"
      >
        🎙️
      </button>

      {/* Recording Modal */}
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title={phase === 'recording' ? 'New Recording' : 'Review Recording'}
        size="lg"
        draggable={phase === 'recording'}
      >
        {phase === 'recording' ? (
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
                  <div className="flex items-center gap-2">
                    {pasteSuccess && (
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium animate-pulse">
                        ✓ {pasteSuccess === 'image' ? 'Image' : 'Video'} added
                      </span>
                    )}
                    {(recorder.isMarking || recorder.completedMarks.length > 0) && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {recorder.isMarking
                          ? "⌘V adds media to current mark"
                          : selectedMarkIndex !== null
                          ? "⌘V adds media to selected mark"
                          : "⌘V adds media to last mark"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  {recorder.completedMarks.map((mark, index) => {
                    const imageCount = mark.images?.length || 0;
                    const videoCount = mark.videos?.length || 0;
                    const isSelected = selectedMarkIndex === index;

                    return (
                      <div
                        key={index}
                        onClick={() => setSelectedMarkIndex(isSelected ? null : index)}
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

            {/* Selected Mark Media Display - During Recording */}
            {selectedMarkIndex !== null && recorder.completedMarks[selectedMarkIndex] && (() => {
              const mark = recorder.completedMarks[selectedMarkIndex];
              const images = mark.images || [];
              const videos = mark.videos || [];

              return (
                <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-blue-700 dark:text-blue-300">
                      Media for Selected Section ({images.length} images, {videos.length} videos)
                    </h4>
                    <button
                      onClick={() => setSelectedMarkIndex(null)}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
                    >
                      Deselect
                    </button>
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
                                      recorder.removeImageFromMark(mark.start, imgIndex);
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
                          <div className="grid grid-cols-4 gap-2">
                            {videos.map((video, videoIndex) => (
                              <div key={videoIndex} className="group relative">
                                <div className="aspect-square rounded overflow-hidden bg-gray-100 dark:bg-dark-border">
                                  {video.thumbnailPath ? (
                                    <img
                                      src={window.electronAPI.paths.getFileUrl(video.thumbnailPath)}
                                      alt=""
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-2xl">🎬</div>
                                  )}
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    recorder.removeVideoFromMark(mark.start, videoIndex);
                                  }}
                                  className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full
                                             opacity-0 group-hover:opacity-100 transition-opacity
                                             flex items-center justify-center text-sm"
                                >×</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-blue-600 dark:text-blue-400 italic">
                      No media yet. Press ⌘V to add images or videos.
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Playback */}
            {recorder.audioUrl && (
              <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-dark-hover rounded-lg">
                <span className="text-green-500 text-xl">✓</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  Recording saved
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                  {formatDuration(recorder.duration)}
                </span>
              </div>
            )}

            {/* Audio player */}
            {recorder.audioUrl && (
              <AudioPlayer src={recorder.audioUrl} duration={recorder.duration} />
            )}

            {/* Completed duration marks with image indicators */}
            {recorder.completedMarks.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Marked Sections ({recorder.completedMarks.length})
                  </span>
                  <div className="flex items-center gap-2">
                    {pasteSuccess && (
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium animate-pulse">
                        ✓ {pasteSuccess === 'image' ? 'Image' : 'Video'} added
                      </span>
                    )}
                    {recorder.completedMarks.length > 0 && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {selectedMarkIndex !== null
                          ? "⌘V adds media to selected mark"
                          : "⌘V adds media to last mark"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recorder.completedMarks.map((mark, index) => {
                    const imageCount = mark.images?.length || 0;
                    const videoCount = mark.videos?.length || 0;
                    const isSelected = selectedMarkIndex === index;

                    return (
                      <div
                        key={index}
                        onClick={() => setSelectedMarkIndex(isSelected ? null : index)}
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
                        {videoCount > 0 && (
                          <span className="ml-2 px-1.5 py-0.5 bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 rounded text-xs font-medium">
                            🎬 {videoCount}
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

            {/* Selected Mark Media Display - During Review */}
            {selectedMarkIndex !== null && recorder.completedMarks[selectedMarkIndex] && (() => {
              const mark = recorder.completedMarks[selectedMarkIndex];
              const images = mark.images || [];
              const videos = mark.videos || [];

              return (
                <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-blue-700 dark:text-blue-300">
                      Media for Selected Section ({images.length} images, {videos.length} videos)
                    </h4>
                    <button
                      onClick={() => setSelectedMarkIndex(null)}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
                    >
                      Deselect
                    </button>
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
                                      recorder.removeImageFromMark(mark.start, imgIndex);
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
                          <div className="grid grid-cols-4 gap-2">
                            {videos.map((video, videoIndex) => (
                              <div key={videoIndex} className="group relative">
                                <div className="aspect-square rounded overflow-hidden bg-gray-100 dark:bg-dark-border">
                                  {video.thumbnailPath ? (
                                    <img
                                      src={window.electronAPI.paths.getFileUrl(video.thumbnailPath)}
                                      alt=""
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-2xl">🎬</div>
                                  )}
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    recorder.removeVideoFromMark(mark.start, videoIndex);
                                  }}
                                  className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full
                                             opacity-0 group-hover:opacity-100 transition-opacity
                                             flex items-center justify-center text-sm"
                                >×</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-blue-600 dark:text-blue-400 italic">
                      No media yet. Press ⌘V to add images or videos.
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Notes input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes about this recording..."
                rows={4}
                className="input-field resize-none"
              />
            </div>

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
                  // Create a blob URL for preview
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
              <Button variant="secondary" onClick={handleClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Recording'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
