import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ScreenRecordingSettings, ScreenResolution, ScreenFPS } from '../types';

interface ScreenRecordingSettingsContextValue {
  settings: ScreenRecordingSettings;
  updateResolution: (resolution: ScreenResolution) => Promise<void>;
  updateFPS: (fps: ScreenFPS) => Promise<void>;
  updatePreset: (preset: string) => Promise<void>;
  loading: boolean;
  getResolutionDimensions: (resolution: ScreenResolution) => { width: number; height: number };
}

const ScreenRecordingSettingsContext = createContext<
  ScreenRecordingSettingsContextValue | undefined
>(undefined);

// Resolution presets mapping
export const RESOLUTION_PRESETS: Record<ScreenResolution, { width: number; height: number }> = {
  '480p': { width: 854, height: 480 },
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
};

// Common presets for quick switching
// Note: bitsPerPixel values are calibrated for the corrected bitrate formula
// Formula: bitrate = pixels × fps × bitsPerPixel (matches OBS standards)
export const QUALITY_PRESETS = {
  'Minimal': {
    resolution: '480p' as ScreenResolution,
    fps: 10 as ScreenFPS,
    bitsPerPixel: 0.04   // ~410 kbps for 480p@10fps - economy quality
  },
  'Standard': {
    resolution: '720p' as ScreenResolution,
    fps: 30 as ScreenFPS,
    bitsPerPixel: 0.05  // ~1.4 Mbps for 720p@30fps - good balance
  },
  'High': {
    resolution: '1080p' as ScreenResolution,
    fps: 60 as ScreenFPS,
    bitsPerPixel: 0.08  // ~9.9 Mbps for 1080p@60fps - CleanShot X quality
  },
} as const;

interface ScreenRecordingSettingsProviderProps {
  children: React.ReactNode;
}

const normalizeResolution = (value?: string): ScreenResolution => {
  if (value === '480p' || value === '720p' || value === '1080p') {
    return value;
  }
  return '1080p';
};

const normalizeFPS = (value?: string): ScreenFPS => {
  const parsed = parseInt(value || '', 10);
  if (parsed === 10 || parsed === 30 || parsed === 60) {
    return parsed as ScreenFPS;
  }
  return 30;
};

export function ScreenRecordingSettingsProvider({ children }: ScreenRecordingSettingsProviderProps) {
  const [settings, setSettings] = useState<ScreenRecordingSettings>({
    resolution: '1080p',
    fps: 30,
    codec: 'h264',
    presetName: 'Standard',
    bitsPerPixel: 0.05,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const allSettings = await window.electronAPI.settings.getAll();

      setSettings({
        resolution: normalizeResolution(allSettings.screen_recording_resolution),
        fps: normalizeFPS(allSettings.screen_recording_fps),
        codec: (allSettings.screen_recording_codec as 'h264' | 'vp9' | 'vp8') || 'h264',
        presetName: allSettings.screen_recording_preset_name || 'Standard',
        bitsPerPixel: parseFloat(allSettings.screen_recording_bits_per_pixel || '0.05'),
      });
    } catch (error) {
      console.error('Failed to load screen recording settings:', error);
      // Keep default settings on error
    } finally {
      setLoading(false);
    }
  };

  const updateResolution = async (resolution: ScreenResolution) => {
    try {
      await window.electronAPI.settings.set('screen_recording_resolution', resolution);
      setSettings(prev => ({ ...prev, resolution }));
    } catch (error) {
      console.error('Failed to update resolution:', error);
    }
  };

  const updateFPS = async (fps: ScreenFPS) => {
    try {
      await window.electronAPI.settings.set('screen_recording_fps', String(fps));
      setSettings(prev => ({ ...prev, fps }));
    } catch (error) {
      console.error('Failed to update FPS:', error);
    }
  };

  const updatePreset = async (preset: string) => {
    try {
      const presetConfig = QUALITY_PRESETS[preset as keyof typeof QUALITY_PRESETS];

      if (presetConfig) {
        // Update all settings for this preset
        await Promise.all([
          window.electronAPI.settings.set('screen_recording_resolution', presetConfig.resolution),
          window.electronAPI.settings.set('screen_recording_fps', String(presetConfig.fps)),
          window.electronAPI.settings.set('screen_recording_bits_per_pixel', String(presetConfig.bitsPerPixel)),
          window.electronAPI.settings.set('screen_recording_preset_name', preset),
        ]);

        setSettings(prev => ({
          ...prev,
          resolution: presetConfig.resolution,
          fps: presetConfig.fps,
          bitsPerPixel: presetConfig.bitsPerPixel,
          presetName: preset,
        }));
      } else {
        // Just update preset name for custom presets
        await window.electronAPI.settings.set('screen_recording_preset_name', preset);
        setSettings(prev => ({ ...prev, presetName: preset }));
      }
    } catch (error) {
      console.error('Failed to update preset:', error);
    }
  };

  const getResolutionDimensions = (resolution: ScreenResolution) => {
    return RESOLUTION_PRESETS[resolution] || RESOLUTION_PRESETS['1080p'];
  };

  return (
    <ScreenRecordingSettingsContext.Provider
      value={{
        settings,
        updateResolution,
        updateFPS,
        updatePreset,
        loading,
        getResolutionDimensions,
      }}
    >
      {children}
    </ScreenRecordingSettingsContext.Provider>
  );
}

export function useScreenRecordingSettings() {
  const context = useContext(ScreenRecordingSettingsContext);
  if (!context) {
    throw new Error('useScreenRecordingSettings must be used within ScreenRecordingSettingsProvider');
  }
  return context;
}
