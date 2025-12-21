/**
 * Audio Capture Utilities
 * Handles microphone enumeration, stream creation, and desktop audio detection
 */

export interface AudioDevice {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
}

/**
 * Enumerate all available audio input devices
 * Requires microphone permission to get device labels
 */
export async function enumerateAudioDevices(): Promise<AudioDevice[]> {
  try {
    // Request permission first (required for device labels)
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());

    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter(device => device.kind === 'audioinput')
      .map(device => ({
        deviceId: device.deviceId,
        label: device.label || `Microphone ${device.deviceId.slice(0, 5)}`,
        kind: device.kind as 'audioinput'
      }));
  } catch (error) {
    console.error('Failed to enumerate audio devices:', error);
    return [];
  }
}

/**
 * Create a microphone audio stream
 * @param deviceId - Optional specific device ID, uses default if not provided
 */
export async function createMicrophoneStream(deviceId?: string): Promise<MediaStream | null> {
  try {
    const constraints: MediaStreamConstraints = {
      audio: deviceId
        ? {
            deviceId: { exact: deviceId },
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 48000
          }
        : {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 48000
          }
    };

    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (error) {
    console.error('Failed to create microphone stream:', error);
    return null;
  }
}

/**
 * Detect if BlackHole virtual audio device is installed (macOS)
 * BlackHole is used for desktop audio capture on macOS
 */
export async function detectBlackHoleAudio(): Promise<boolean> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some(device =>
      device.kind === 'audioinput' &&
      device.label.toLowerCase().includes('blackhole')
    );
  } catch (error) {
    console.error('Failed to detect BlackHole:', error);
    return false;
  }
}

/**
 * Combine multiple audio streams into a single stream
 * Uses Web Audio API to mix audio sources
 */
export function combineAudioStreams(streams: MediaStream[]): MediaStream {
  const audioContext = new AudioContext({ sampleRate: 48000 });
  const destination = audioContext.createMediaStreamDestination();

  streams.forEach(stream => {
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length > 0) {
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(destination);
    }
  });

  return destination.stream;
}

/**
 * Get the BlackHole device if available
 * Returns the device info or null if not found
 */
export async function getBlackHoleDevice(): Promise<MediaDeviceInfo | null> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const blackHole = devices.find(device =>
      device.kind === 'audioinput' &&
      device.label.toLowerCase().includes('blackhole')
    );
    return blackHole || null;
  } catch (error) {
    console.error('Failed to get BlackHole device:', error);
    return null;
  }
}

/**
 * Create a desktop audio stream using BlackHole
 * @returns MediaStream or null if BlackHole is not available
 */
export async function createDesktopAudioStream(): Promise<MediaStream | null> {
  try {
    const blackHoleDevice = await getBlackHoleDevice();
    if (!blackHoleDevice) {
      console.warn('BlackHole device not found. Cannot capture desktop audio.');
      return null;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: blackHoleDevice.deviceId },
        sampleRate: 48000
      }
    });

    return stream;
  } catch (error) {
    console.error('Failed to create desktop audio stream:', error);
    return null;
  }
}
