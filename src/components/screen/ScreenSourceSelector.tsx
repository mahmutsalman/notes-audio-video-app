import { useState, useEffect } from 'react';
import type { ScreenSource, CaptureArea } from '../../types';
import { useScreenRecordingSettings, QUALITY_PRESETS } from '../../context/ScreenRecordingSettingsContext';

interface ScreenSourceSelectorProps {
  onSourceSelect: (source: ScreenSource) => void;
  onRegionSelect?: (region: CaptureArea) => void;
  onCancel: () => void;
  autoStartRegionSelection?: boolean;
}

export default function ScreenSourceSelector({ onSourceSelect, onRegionSelect, onCancel, autoStartRegionSelection = false }: ScreenSourceSelectorProps) {
  const [sources, setSources] = useState<ScreenSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { settings, updatePreset } = useScreenRecordingSettings();

  useEffect(() => {
    loadSources();
  }, []);

  // Auto-trigger region selection when opened via global shortcut
  useEffect(() => {
    if (autoStartRegionSelection && onRegionSelect && !loading) {
      console.log('[ScreenSourceSelector] Auto-triggering region selection from global shortcut');
      // Small delay to ensure modal is fully rendered
      const timer = setTimeout(() => {
        handleSelectRegion();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [autoStartRegionSelection, onRegionSelect, loading]);

  // Listen for region selection
  useEffect(() => {
    console.log('[ScreenSourceSelector] useEffect triggered');
    console.log('[ScreenSourceSelector] onRegionSelect exists:', !!onRegionSelect);

    if (!onRegionSelect) {
      console.warn('[ScreenSourceSelector] onRegionSelect is undefined, skipping listener setup');
      return;
    }

    console.log('[ScreenSourceSelector] Registering region:selected listener');
    const cleanup = window.electronAPI.region.onRegionSelected((region) => {
      console.log('[ScreenSourceSelector] region:selected event FIRED');
      console.log('[ScreenSourceSelector] region data:', region);
      if (region) {
        console.log('[ScreenSourceSelector] Calling onRegionSelect callback');
        onRegionSelect(region);
        console.log('[ScreenSourceSelector] onRegionSelect callback completed');
      }
    });

    console.log('[ScreenSourceSelector] Listener registered successfully');

    return () => {
      console.log('[ScreenSourceSelector] Cleaning up region listener');
      cleanup();
    };
  }, [onRegionSelect]);

  const loadSources = async () => {
    try {
      setLoading(true);
      setError(null);
      const availableSources = await window.electronAPI.screenRecording.getSources();
      setSources(availableSources);
    } catch (err) {
      console.error('Failed to load screen sources:', err);
      setError('Failed to load available screens and windows');
    } finally {
      setLoading(false);
    }
  };

  const handlePresetChange = (presetName: string) => {
    updatePreset(presetName);
  };

  const handleSelectRegion = async () => {
    console.log('[ScreenSourceSelector] Select Region button clicked!');
    console.log('[ScreenSourceSelector] window.electronAPI:', window.electronAPI);
    console.log('[ScreenSourceSelector] window.electronAPI.region:', window.electronAPI.region);

    try {
      console.log('[ScreenSourceSelector] Calling region.startSelection()...');
      await window.electronAPI.region.startSelection();
      console.log('[ScreenSourceSelector] region.startSelection() completed');
    } catch (err) {
      console.error('[ScreenSourceSelector] Failed to start region selection:', err);
      setError('Failed to start region selection');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading available screens...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8">
        <div className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-4 rounded-lg mb-4">
          {error}
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={loadSources}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            Retry
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Settings Panel */}
      <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Recording Quality</h3>

        {/* Quality Presets */}
        <div className="flex gap-2">
          {Object.keys(QUALITY_PRESETS).map((presetName) => {
            const preset = QUALITY_PRESETS[presetName as keyof typeof QUALITY_PRESETS];
            const isActive = settings.presetName === presetName;

            return (
              <button
                key={presetName}
                onClick={() => handlePresetChange(presetName)}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                }`}
              >
                <div className="font-semibold">{presetName}</div>
                <div className="text-xs opacity-80">
                  {preset.resolution} • {preset.fps} FPS
                </div>
              </button>
            );
          })}
        </div>

        {/* Current Settings Display */}
        <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
          <span>Resolution: <strong>{settings.resolution}</strong></span>
          <span>Frame Rate: <strong>{settings.fps} FPS</strong></span>
          <span>Codec: <strong>{settings.codec.toUpperCase()}</strong></span>
        </div>
      </div>

      {/* Source Selection */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Select Recording Source
        </h3>

        {/* Region Selection Button */}
        {onRegionSelect && (
          <div className="w-full mb-4">
            <button
              onClick={handleSelectRegion}
              className="w-full bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white rounded-lg p-4 transition-all hover:shadow-lg group"
            >
              <div className="flex items-center justify-center gap-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
                <div className="text-left">
                  <div className="font-semibold text-lg">Select Region</div>
                  <div className="text-sm opacity-90">Draw a rectangle on your screen to record a specific area</div>
                </div>
              </div>
            </button>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
              or press{' '}
              <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded text-xs font-mono">
                {navigator.platform.includes('Mac') ? '⌘D' : 'Ctrl+D'}
              </kbd>{' '}
              from anywhere
            </p>
          </div>
        )}

        <div className="text-xs text-gray-500 dark:text-gray-500 text-center mb-3">
          or select a full screen/window below
        </div>

        {sources.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No screens or windows available for recording
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {sources.map((source) => (
              <button
                key={source.id}
                onClick={() => onSourceSelect(source)}
                className="group relative bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:border-primary-500 dark:hover:border-primary-500 transition-all hover:shadow-lg"
              >
                {/* Thumbnail */}
                <div className="aspect-video bg-gray-100 dark:bg-gray-900 rounded mb-2 overflow-hidden">
                  <img
                    src={source.thumbnail}
                    alt={source.name}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Source Name */}
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {source.name}
                </div>

                {/* Hover Overlay */}
                <div className="absolute inset-0 bg-primary-600/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
                    Select
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={loadSources}
          className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
        >
          Refresh Sources
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
        >
          Cancel
        </button>
      </div>

      {/* Instructions */}
      <div className="text-xs text-gray-500 dark:text-gray-500 text-center">
        Click on a screen or window to start recording • ESC to cancel
      </div>
    </div>
  );
}
