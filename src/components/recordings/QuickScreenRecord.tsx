import { useState, useEffect } from 'react';
import ScreenRecordingModal from '../screen/ScreenRecordingModal';
import { formatTimestampName } from '../../utils/formatters';
import type { CaptureArea } from '../../types';

interface QuickScreenRecordProps {
  topicId: number;
  onRecordingSaved: () => void;
  pendingRegion?: CaptureArea | null;
}

export default function QuickScreenRecord({ topicId, onRecordingSaved, pendingRegion = null }: QuickScreenRecordProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Auto-open modal when pendingRegion is set (from Cmd+D)
  useEffect(() => {
    if (pendingRegion) {
      setIsOpen(true);
    }
  }, [pendingRegion]);

  const handleOpen = () => {
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleSave = async (videoBlob: Blob, marks: any[], durationMs: number) => {
    setIsSaving(true);

    try {
      // Get settings to extract resolution and FPS
      const settings = await window.electronAPI.settings.getAll();
      const resolution = settings['screen_recording_resolution'] || '1080p';
      const fps = parseInt(settings['screen_recording_fps'] || '30');

      // Create the recording record first
      const recording = await window.electronAPI.recordings.create({
        topic_id: topicId,
        name: formatTimestampName(),
        audio_path: null,
        audio_duration: null,
        video_path: null, // Will be updated after saving file
        video_duration: null, // Will be updated with actual duration from video metadata
        video_resolution: resolution,
        video_fps: fps,
        notes_content: null,
      });

      console.log('[QuickScreenRecord] Recording created with ID:', recording.id);

      // Save the video file with client-calculated duration as fallback
      const arrayBuffer = await videoBlob.arrayBuffer();
      const result = await window.electronAPI.screenRecording.saveFile(
        recording.id,
        arrayBuffer,
        resolution,
        fps,
        durationMs
      );

      console.log('[QuickScreenRecord] Video file saved:', result.filePath);

      // Enhanced debug logging
      if (result._debug) {
        if (result._debug.usedFallback) {
          console.warn('[QuickScreenRecord] ⚠️  Used fallback duration (FFprobe failed)');
          console.warn('[QuickScreenRecord] FFprobe error:', result._debug.extractionError);
        } else if (result._debug.durationExtracted) {
          console.log('[QuickScreenRecord] ✓ FFprobe extraction successful');
        }
      }

      if (result.duration === null) {
        console.error('[QuickScreenRecord] ❌ CRITICAL: Duration extraction completely failed');
        console.error('[QuickScreenRecord] This should never happen with fallback enabled');
      }

      // Update the recording with the actual video path and duration
      await window.electronAPI.recordings.update(recording.id, {
        video_path: result.filePath,
        video_duration: result.duration,
      });

      console.log('[QuickScreenRecord] Recording updated with duration:', result.duration);

      // Save duration marks
      for (const mark of marks) {
        await window.electronAPI.durations.create({
          recording_id: recording.id,
          start_time: mark.start,
          end_time: mark.end,
          note: mark.note ?? null,
        });
      }

      console.log('[QuickScreenRecord] Duration marks saved:', marks.length);

      // Notify parent to refresh list
      onRecordingSaved();
      handleClose();
    } catch (error) {
      console.error('Failed to save screen recording:', error);
      alert('Failed to save screen recording. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={handleOpen}
        disabled={isSaving}
        className="fixed bottom-6 left-6 w-16 h-16 bg-purple-600 hover:bg-purple-700 text-white rounded-full shadow-lg flex items-center justify-center text-2xl transition-all hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed z-40"
        title="Record Screen"
      >
        🎬
      </button>

      {/* Screen Recording Modal */}
      {isOpen && (
        <ScreenRecordingModal
          isOpen={isOpen}
          onClose={handleClose}
          recordingId={0} // Not used in standalone mode
          onSave={handleSave}
          pendingRegion={pendingRegion}
        />
      )}
    </>
  );
}
