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

  const normalizeResolution = (value?: string) => {
    if (value === '480p' || value === '720p' || value === '1080p') {
      return value;
    }
    return '1080p';
  };

  const normalizeFPS = (value?: string) => {
    const parsed = parseInt(value || '', 10);
    if (parsed === 10 || parsed === 30 || parsed === 60) {
      return parsed;
    }
    return 30;
  };

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

  const handleSave = async (
    videoBlob: Blob | null,
    marks: any[],
    durationMs: number,
    filePath?: string,
    audioBlob?: Blob | null,
    audioConfig?: { bitrate: '32k' | '64k' | '128k'; channels: 1 | 2 }
  ) => {
    setIsSaving(true);

    try {
      // Get settings to extract resolution and FPS
      const settings = await window.electronAPI.settings.getAll();
      const resolution = normalizeResolution(settings['screen_recording_resolution']);
      const fps = normalizeFPS(settings['screen_recording_fps']);
      const resolvedAudioConfig = audioConfig ?? (resolution === '480p'
        ? { bitrate: '32k' as const, channels: 1 as const }
        : resolution === '720p'
          ? { bitrate: '64k' as const, channels: 2 as const }
          : { bitrate: '128k' as const, channels: 2 as const });

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

      let result: { filePath: string; duration: number | null; _debug?: any };

      if (filePath) {
        const audioBuffer = audioBlob && audioBlob.size > 0
          ? await audioBlob.arrayBuffer()
          : undefined;
        result = await window.electronAPI.screenRecording.finalizeFile(
          recording.id,
          filePath,
          resolution,
          fps,
          durationMs,
          audioBuffer,
          resolvedAudioConfig.bitrate,
          resolvedAudioConfig.channels
        );
      } else if (videoBlob) {
        // Save the video file with client-calculated duration as fallback
        const arrayBuffer = await videoBlob.arrayBuffer();
        result = await window.electronAPI.screenRecording.saveFile(
          recording.id,
          arrayBuffer,
          resolution,
          fps,
          durationMs
        );
      } else {
        throw new Error('No video data available to save');
      }

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
