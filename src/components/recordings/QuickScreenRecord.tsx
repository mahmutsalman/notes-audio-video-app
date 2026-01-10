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
  const [recordingId, setRecordingId] = useState<number | null>(null);

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
    if (pendingRegion && !recordingId) {
      console.log('[QuickScreenRecord] Auto-opening from pendingRegion');
      handleOpen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRegion, recordingId]);

  const handleOpen = async () => {
    try {
      // Get settings to determine resolution and FPS for the recording record
      const settings = await window.electronAPI.settings.getAll();
      const resolution = normalizeResolution(settings['screen_recording_resolution']);
      const fps = normalizeFPS(settings['screen_recording_fps']);

      // Create the recording record first so we have an ID for group color state
      const recording = await window.electronAPI.recordings.create({
        topic_id: topicId,
        name: formatTimestampName(),
        audio_path: null,
        audio_duration: null,
        audio_size: null,
        video_path: null, // Will be updated after recording
        video_duration: null, // Will be updated after recording
        video_resolution: resolution,
        video_fps: fps,
        video_size: null,
        notes_content: null,
      });

      console.log('[QuickScreenRecord] Created recording with ID:', recording.id);

      setRecordingId(recording.id);
      setIsOpen(true);
    } catch (error) {
      console.error('[QuickScreenRecord] Failed to create recording:', error);
      alert('Failed to create recording. Please try again.');
    }
  };

  const handleClose = () => {
    console.log('[QuickScreenRecord] Closing modal, recording ID:', recordingId);
    setIsOpen(false);
    setRecordingId(null); // Reset recording ID when closing
  };

  const handleSave = async (
    videoBlob: Blob | null,
    marks: any[],
    durationMs: number,
    filePath?: string,
    audioBlob?: Blob | null,
    audioConfig?: { bitrate: '32k' | '64k' | '128k'; channels: 1 | 2 },
    audioOffsetMs?: number
  ) => {
    if (!recordingId) {
      console.error('[QuickScreenRecord] No recording ID available');
      alert('Recording ID not found. Please try again.');
      return;
    }

    setIsSaving(true);

    try {
      console.log('[QuickScreenRecord] handleSave called with:', {
        recordingId,
        marksCount: marks.length,
        marksWithGroupColor: marks.map((m, i) => ({ index: i, groupColor: m.group_color }))
      });

      // Get settings to extract resolution and FPS
      const settings = await window.electronAPI.settings.getAll();
      const resolution = normalizeResolution(settings['screen_recording_resolution']);
      const fps = normalizeFPS(settings['screen_recording_fps']);
      const resolvedAudioConfig = audioConfig ?? (resolution === '480p'
        ? { bitrate: '32k' as const, channels: 1 as const }
        : resolution === '720p'
          ? { bitrate: '64k' as const, channels: 2 as const }
          : { bitrate: '128k' as const, channels: 2 as const });

      console.log('[QuickScreenRecord] Saving video for recording ID:', recordingId);

      let result: { filePath: string; duration: number | null; _debug?: any };

      if (filePath) {
        const audioBuffer = audioBlob && audioBlob.size > 0
          ? await audioBlob.arrayBuffer()
          : undefined;
        result = await window.electronAPI.screenRecording.finalizeFile(
          recordingId,
          filePath,
          resolution,
          fps,
          durationMs,
          audioBuffer,
          resolvedAudioConfig.bitrate,
          resolvedAudioConfig.channels,
          audioOffsetMs
        );
      } else if (videoBlob) {
        // Save the video file with client-calculated duration as fallback
        const arrayBuffer = await videoBlob.arrayBuffer();
        result = await window.electronAPI.screenRecording.saveFile(
          recordingId,
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
      await window.electronAPI.recordings.update(recordingId, {
        video_path: result.filePath,
        video_duration: result.duration,
        video_size: result._debug?.fileSize ?? null,
      });

      console.log('[QuickScreenRecord] Recording updated with duration:', result.duration);

      const maxDurationSeconds = typeof result.duration === 'number' && Number.isFinite(result.duration) && result.duration > 0
        ? result.duration
        : durationMs / 1000;

      const clampedMarks = marks
        .map(mark => {
          const start = typeof mark.start === 'number' ? mark.start : 0;
          const end = typeof mark.end === 'number' ? mark.end : 0;
          const clampedStart = Math.max(0, Math.min(start, maxDurationSeconds));
          const clampedEnd = Math.max(0, Math.min(end, maxDurationSeconds));
          return { ...mark, start: clampedStart, end: clampedEnd };
        })
        .filter(mark => Number.isFinite(mark.start) && Number.isFinite(mark.end) && mark.end > mark.start);

      try {
        const logDebugEvent = window.electronAPI.screenRecording?.logDebugEvent;
        if (typeof logDebugEvent === 'function') {
          await logDebugEvent(recordingId, {
            type: 'marks.save',
            origin: 'renderer:QuickScreenRecord',
            payload: {
              durationMs,
              ffprobeDurationSeconds: result.duration,
              maxDurationSeconds,
              marksCount: marks.length,
              clampedMarksCount: clampedMarks.length,
              marks: marks.map((m, idx) => ({
                idx,
                start: m.start,
                end: m.end,
                group_color: m.group_color ?? null,
                note: m.note ?? null,
              })),
              clampedMarks: clampedMarks.map((m, idx) => ({
                idx,
                start: m.start,
                end: m.end,
                group_color: m.group_color ?? null,
                note: m.note ?? null,
              })),
            }
          });
        }
      } catch {
        // Non-fatal
      }

      // Save duration marks with group colors
      for (const mark of clampedMarks) {
        console.log('[QuickScreenRecord] Saving mark with group_color:', mark.group_color);
        await window.electronAPI.durations.create({
          recording_id: recordingId,
          start_time: mark.start,
          end_time: mark.end,
          note: mark.note ?? null,
          group_color: mark.group_color ?? null,
        });
      }

      console.log('[QuickScreenRecord] Duration marks saved:', clampedMarks.length);

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
      {isOpen && recordingId && (
        <ScreenRecordingModal
          isOpen={isOpen}
          onClose={handleClose}
          recordingId={recordingId}
          onSave={handleSave}
          pendingRegion={pendingRegion}
        />
      )}
    </>
  );
}
