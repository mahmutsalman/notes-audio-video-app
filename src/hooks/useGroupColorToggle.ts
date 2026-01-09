import { useState, useCallback, useEffect } from 'react';
import { getNextGroupColor, type DurationGroupColor } from '../utils/durationGroupColors';

export function useGroupColorToggle(recordingId: number | null) {
  const [isActive, setIsActive] = useState(false);
  const [currentColor, setCurrentColor] = useState<DurationGroupColor>('purple');

  // Load state from database when recording starts
  useEffect(() => {
    if (!recordingId) return;

    const loadState = async () => {
      try {
        const state = await window.electronAPI.recordings.getGroupColorState(recordingId);
        setIsActive(state.toggleActive);
        setCurrentColor(state.lastGroupColor || 'purple');
        console.log('[useGroupColorToggle] Loaded state:', state);
      } catch (error) {
        console.error('[useGroupColorToggle] Failed to load state:', error);
        // Default to first color
        setIsActive(false);
        setCurrentColor('purple');
      }
    };

    loadState();
  }, [recordingId]);

  // Toggle function
  const toggle = useCallback(() => {
    if (isActive) {
      // Toggle OFF: advance to next color
      const nextColor = getNextGroupColor(currentColor);
      setCurrentColor(nextColor);
      setIsActive(false);
      console.log('[useGroupColorToggle] Toggled OFF, next color:', nextColor);
    } else {
      // Toggle ON: use current color
      setIsActive(true);
      console.log('[useGroupColorToggle] Toggled ON, current color:', currentColor);
    }
  }, [isActive, currentColor]);

  // Save state to database
  const saveState = useCallback(async () => {
    if (!recordingId) return;

    try {
      await window.electronAPI.recordings.updateGroupColorState(
        recordingId,
        currentColor,
        isActive
      );
      console.log('[useGroupColorToggle] Saved state:', { currentColor, isActive });
    } catch (error) {
      console.error('[useGroupColorToggle] Failed to save state:', error);
    }
  }, [recordingId, currentColor, isActive]);

  return {
    isActive,
    currentColor,
    toggle,
    saveState,
  };
}
