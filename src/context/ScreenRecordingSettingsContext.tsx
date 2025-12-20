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
export const QUALITY_PRESETS = {
  'Minimal': { resolution: '480p' as ScreenResolution, fps: 10 as ScreenFPS },
  'Standard': { resolution: '1080p' as ScreenResolution, fps: 30 as ScreenFPS },
  'High': { resolution: '1080p' as ScreenResolution, fps: 60 as ScreenFPS },
} as const;

interface ScreenRecordingSettingsProviderProps {
  children: React.ReactNode;
}

export function ScreenRecordingSettingsProvider({ children }: ScreenRecordingSettingsProviderProps) {
  const [settings, setSettings] = useState<ScreenRecordingSettings>({
    resolution: '1080p',
    fps: 30,
    codec: 'vp9',
    presetName: 'Standard',
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const allSettings = await window.electronAPI.settings.getAll();

      setSettings({
        resolution: (allSettings.screen_recording_resolution as ScreenResolution) || '1080p',
        fps: parseInt(allSettings.screen_recording_fps || '30') as ScreenFPS,
        codec: (allSettings.screen_recording_codec as 'vp9' | 'vp8') || 'vp9',
        presetName: allSettings.screen_recording_preset_name || 'Standard',
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
          window.electronAPI.settings.set('screen_recording_preset_name', preset),
        ]);

        setSettings(prev => ({
          ...prev,
          resolution: presetConfig.resolution,
          fps: presetConfig.fps,
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
    return RESOLUTION_PRESETS[resolution];
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
