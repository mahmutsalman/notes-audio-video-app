import { useState } from 'react';
import { useSimpleAudioRecorder } from '../../hooks/useSimpleAudioRecorder';
import Modal from '../common/Modal';
import { formatDuration } from '../../utils/formatters';
import WaveformVisualizer from './WaveformVisualizer';

interface SimpleAudioRecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (audioBlob: Blob) => Promise<void>;
  title?: string;
}

export default function SimpleAudioRecordModal({
  isOpen,
  onClose,
  onSave,
  title = 'Record Audio'
}: SimpleAudioRecordModalProps) {
  const recorder = useSimpleAudioRecorder();
  const [isSaving, setIsSaving] = useState(false);

  const handleClose = () => {
    recorder.reset();
    onClose();
  };

  const handleStop = async () => {
    const blob = await recorder.stopRecording();
    if (blob) {
      setIsSaving(true);
      try {
        await onSave(blob);
        handleClose();
      } catch (err) {
        console.error('Failed to save audio:', err);
      } finally {
        setIsSaving(false);
      }
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} size="md">
      <div className="flex flex-col items-center py-8">
        {recorder.error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
            {recorder.error}
          </div>
        )}

        {/* Status indicator */}
        {recorder.isRecording && !recorder.isPaused && (
          <div className="text-red-500 text-lg font-medium mb-2 flex items-center gap-2">
            <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            RECORDING...
          </div>
        )}
        {recorder.isPaused && (
          <div className="text-yellow-500 text-lg font-medium mb-2 flex items-center gap-2">
            <span className="w-3 h-3 bg-yellow-500 rounded-full" />
            PAUSED
          </div>
        )}
        {!recorder.isRecording && (
          <div className="text-gray-500 dark:text-gray-400 text-lg font-medium mb-2">
            Ready to record
          </div>
        )}

        {/* Waveform */}
        <div className="w-full h-24 mb-4">
          <WaveformVisualizer
            analyser={recorder.analyserNode}
            isRecording={recorder.isRecording && !recorder.isPaused}
          />
        </div>

        {/* Duration */}
        <div className="text-4xl font-mono text-gray-900 dark:text-gray-100 mb-8">
          {formatDuration(recorder.duration)}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4">
          {!recorder.isRecording ? (
            <button
              onClick={recorder.startRecording}
              disabled={isSaving}
              className="w-20 h-20 bg-red-500 hover:bg-red-600 text-white rounded-full
                         flex items-center justify-center text-3xl shadow-lg
                         focus:outline-none focus:ring-4 focus:ring-red-500/50
                         transition-all disabled:opacity-50 recording-pulse"
              title="Start recording"
            >
              🎙️
            </button>
          ) : (
            <>
              <button
                onClick={recorder.isPaused ? recorder.resumeRecording : recorder.pauseRecording}
                className="w-14 h-14 bg-yellow-500 hover:bg-yellow-600 text-white rounded-full
                           flex items-center justify-center text-xl shadow-lg
                           focus:outline-none focus:ring-4 focus:ring-yellow-500/50
                           transition-all"
                title={recorder.isPaused ? 'Resume' : 'Pause'}
              >
                {recorder.isPaused ? '▶️' : '⏸️'}
              </button>
              <button
                onClick={handleStop}
                disabled={isSaving}
                className="w-20 h-20 bg-gray-700 hover:bg-gray-800 text-white rounded-full
                           flex items-center justify-center text-3xl shadow-lg
                           focus:outline-none focus:ring-4 focus:ring-gray-500/50
                           disabled:opacity-50 transition-all"
                title="Stop and save"
              >
                ⏹️
              </button>
            </>
          )}
        </div>

        {/* Instructions */}
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400 text-center">
          {isSaving
            ? 'Saving audio...'
            : recorder.isRecording
            ? 'Press stop when finished'
            : 'Click the microphone to start recording'}
        </p>
      </div>
    </Modal>
  );
}
