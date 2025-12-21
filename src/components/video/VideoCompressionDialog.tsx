import { useState, useEffect } from 'react';
import type { VideoCompressionOptions, VideoCompressionResult, CompressionProgress } from '../../types';

interface VideoCompressionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  videoPath: string;
  videoName: string;
  onCompressionComplete?: (result: VideoCompressionResult) => void;
}

export default function VideoCompressionDialog({
  isOpen,
  onClose,
  videoPath,
  videoName,
  onCompressionComplete
}: VideoCompressionDialogProps) {
  const [ffmpegAvailable, setFfmpegAvailable] = useState<boolean>(false);
  const [ffmpegVersion, setFfmpegVersion] = useState<string>('');
  const [ffmpegError, setFfmpegError] = useState<string>('');

  const [options, setOptions] = useState<VideoCompressionOptions>({
    crf: 35,                // Your proven setting for 88-90% compression
    preset: 'slow',         // Better compression
    audioBitrate: '32k'     // Acceptable for speech
  });

  const [isCompressing, setIsCompressing] = useState(false);
  const [progress, setProgress] = useState<CompressionProgress | null>(null);
  const [result, setResult] = useState<VideoCompressionResult | null>(null);
  const [error, setError] = useState<string>('');

  // Check ffmpeg availability on mount
  useEffect(() => {
    if (isOpen) {
      checkFFmpeg();
    }
  }, [isOpen]);

  const checkFFmpeg = async () => {
    try {
      const check = await window.electronAPI.video.checkFFmpeg();
      setFfmpegAvailable(check.available);
      setFfmpegVersion(check.version || '');
      setFfmpegError(check.error || '');
    } catch (err) {
      setFfmpegAvailable(false);
      setFfmpegError(err instanceof Error ? err.message : 'Failed to check ffmpeg');
    }
  };

  const handleCompress = async () => {
    if (!ffmpegAvailable) return;

    setIsCompressing(true);
    setError('');
    setResult(null);
    setProgress(null);

    try {
      const compressionResult = await window.electronAPI.video.compress(
        videoPath,
        options,
        (prog) => {
          setProgress(prog);
        }
      );

      if (compressionResult.success) {
        setResult(compressionResult);
        if (onCompressionComplete) {
          onCompressionComplete(compressionResult);
        }
      } else {
        setError(compressionResult.error || 'Compression failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Compression failed');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleReplaceOriginal = async () => {
    if (!result || !result.outputPath) return;

    try {
      const replaceResult = await window.electronAPI.video.replaceWithCompressed(
        videoPath,
        result.outputPath
      );

      if (replaceResult.success) {
        alert('Original file replaced successfully!');
        onClose();
      } else {
        setError(replaceResult.error || 'Failed to replace original file');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to replace original file');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Compress & Convert to MP4
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            disabled={isCompressing}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Video Info */}
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Video File</h3>
            <p className="text-gray-900 dark:text-gray-100 truncate">{videoName}</p>
          </div>

          {/* FFmpeg Status */}
          {!ffmpegAvailable ? (
            <div className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-4 rounded-lg">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="font-medium">FFmpeg not available</p>
                  <p className="text-sm mt-1">{ffmpegError || 'Video compression requires ffmpeg'}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 p-4 rounded-lg">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">FFmpeg ready</span>
                {ffmpegVersion && <span className="text-sm">• {ffmpegVersion}</span>}
              </div>
            </div>
          )}

          {/* Compression Settings */}
          {ffmpegAvailable && !result && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Compression Settings
              </h3>

              {/* CRF Slider */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Quality Level (CRF): {options.crf}
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                    {options.crf <= 28 ? 'High' : options.crf <= 35 ? 'Standard' : 'Low'}
                  </span>
                </label>
                <input
                  type="range"
                  min="23"
                  max="40"
                  value={options.crf}
                  onChange={(e) => setOptions({ ...options, crf: parseInt(e.target.value) })}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  disabled={isCompressing}
                />
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                  <span>Better Quality</span>
                  <span>Smaller Size</span>
                </div>
              </div>

              {/* Preset Dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Encoding Speed
                </label>
                <select
                  value={options.preset}
                  onChange={(e) => setOptions({ ...options, preset: e.target.value as any })}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100"
                  disabled={isCompressing}
                >
                  <option value="ultrafast">Ultra Fast (lower compression)</option>
                  <option value="fast">Fast</option>
                  <option value="medium">Medium</option>
                  <option value="slow">Slow (better compression)</option>
                  <option value="veryslow">Very Slow (best compression)</option>
                </select>
              </div>

              {/* Audio Bitrate */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Audio Quality
                </label>
                <select
                  value={options.audioBitrate}
                  onChange={(e) => setOptions({ ...options, audioBitrate: e.target.value as any })}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100"
                  disabled={isCompressing}
                >
                  <option value="24k">24 kbps (low)</option>
                  <option value="32k">32 kbps (good for speech)</option>
                  <option value="48k">48 kbps (standard)</option>
                  <option value="64k">64 kbps (good)</option>
                  <option value="128k">128 kbps (high)</option>
                </select>
              </div>
            </div>
          )}

          {/* Progress */}
          {isCompressing && progress && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-gray-700 dark:text-gray-300">
                <span>Compressing...</span>
                <span>{progress.percent}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                <div
                  className="bg-primary-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${progress.percent}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>Time: {progress.currentTime}</span>
                <span>Speed: {progress.speed}</span>
              </div>
            </div>
          )}

          {/* Results */}
          {result && result.success && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-green-800 dark:text-green-300">
                Compression Complete!
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-700 dark:text-gray-300">Original Size:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {formatFileSize(result.originalSize)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700 dark:text-gray-300">Compressed Size:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {formatFileSize(result.compressedSize)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700 dark:text-gray-300">Space Saved:</span>
                  <span className="font-medium text-green-600 dark:text-green-400">
                    {result.compressionRatio.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700 dark:text-gray-300">Output Format:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">MP4</span>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-4 rounded-lg">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 justify-end p-6 border-t border-gray-200 dark:border-gray-700">
          {!result ? (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                disabled={isCompressing}
              >
                Cancel
              </button>
              <button
                onClick={handleCompress}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                disabled={!ffmpegAvailable || isCompressing}
              >
                {isCompressing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Compressing...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Compress to MP4
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Keep Both Files
              </button>
              <button
                onClick={handleReplaceOriginal}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                Replace Original
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
