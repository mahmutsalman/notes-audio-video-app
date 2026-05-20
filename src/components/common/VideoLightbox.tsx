import { useEffect, useRef } from 'react';

interface VideoLightboxProps {
  src: string;
  caption?: string | null;
  onClose: () => void;
}

export default function VideoLightbox({ src, caption, onClose }: VideoLightboxProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopImmediatePropagation();
        video.currentTime = Math.max(0, video.currentTime - 5);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopImmediatePropagation();
        const target = video.currentTime + 5;
        video.currentTime = Number.isFinite(video.duration) ? Math.min(video.duration, target) : target;
      }
    };
    window.addEventListener('keydown', handleKey, { capture: true });
    return () => window.removeEventListener('keydown', handleKey, { capture: true });
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] bg-gray-950 flex flex-col"
      onClick={onClose}
    >
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <span className="text-sm font-medium text-gray-200 truncate">
          ▶ {caption || 'Video'}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="text-gray-400 hover:text-white transition-colors text-lg leading-none px-2"
          title="Close (Esc)"
        >
          ✕
        </button>
      </div>
      <div
        className="flex-1 min-h-0 bg-black flex items-center justify-center overflow-hidden"
        onClick={onClose}
      >
        <video
          ref={videoRef}
          src={src}
          controls
          autoPlay
          className="max-w-full max-h-full object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}
