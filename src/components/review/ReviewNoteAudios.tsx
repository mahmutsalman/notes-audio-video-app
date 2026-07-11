import { useEffect, useRef, useState } from 'react';
import type { ReviewNoteAudio } from '../../types';
import { useSimpleAudioRecorder } from '../../hooks/useSimpleAudioRecorder';

interface ReviewNoteAudiosProps {
  /** The note these voice notes hang off. Must already exist in the DB. */
  noteId: number;
  audios: ReviewNoteAudio[];
  onChange: (audios: ReviewNoteAudio[]) => void;
  /** Dark study-session palette vs. the light Echo detail page. */
  variant?: 'dark' | 'light';
  /** Begin recording the moment this mounts — used when the note was created BY the mic button. */
  autoStart?: boolean;
}

function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Voice notes on one reflective review note — record, play, delete.
 *
 * Playback is a plain <audio> element on the media:// URL rather than one of the app's audio
 * player contexts: those are per-media-type singletons built for long recordings with seeking and
 * speed control, and a review note just needs "play this 20-second thought". One element is shared
 * across the list so starting a second clip stops the first.
 */
export default function ReviewNoteAudios({ noteId, audios, onChange, variant = 'dark', autoStart = false }: ReviewNoteAudiosProps) {
  const recorder = useSimpleAudioRecorder();
  const [busy, setBusy] = useState(false);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const dark = variant === 'dark';

  // Stop playback when the note (or the card) goes away — an orphaned element keeps playing.
  useEffect(() => () => { audioElRef.current?.pause(); audioElRef.current = null; }, []);

  // Pressing "Voice note" creates the note row, which mounts this component; start the mic here
  // so that single press = recording, rather than press, wait for the row, press again.
  const started = useRef(false);
  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    void recorder.startRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const startRecording = async () => {
    if (busy || recorder.isRecording) return;
    await recorder.startRecording();
  };

  const stopRecording = async () => {
    if (!recorder.isRecording) return;
    setBusy(true);
    try {
      const seconds = recorder.duration;
      const blob = await recorder.stopRecording();
      if (!blob) return;
      const buf = await blob.arrayBuffer();
      const saved = await window.electronAPI.reviewNoteAudios.add(noteId, buf, seconds || null, 'webm');
      onChange([...audios, saved]);
      recorder.reset();
    } finally {
      setBusy(false);
    }
  };

  const play = (audio: ReviewNoteAudio) => {
    audioElRef.current?.pause();
    if (playingId === audio.id) { setPlayingId(null); return; }  // second click = stop
    const el = new Audio(window.electronAPI.paths.getFileUrl(audio.file_path));
    el.onended = () => setPlayingId(null);
    audioElRef.current = el;
    setPlayingId(audio.id);
    void el.play();
  };

  const remove = async (audioId: number) => {
    if (playingId === audioId) { audioElRef.current?.pause(); setPlayingId(null); }
    await window.electronAPI.reviewNoteAudios.delete(audioId);
    onChange(audios.filter(a => a.id !== audioId));
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {audios.map((a, i) => (
        <div
          key={a.id}
          className={`group/aud relative flex items-center gap-1.5 rounded-full pl-2 pr-2.5 py-1 border text-[11px] transition-colors ${
            dark
              ? 'border-gray-700 bg-gray-900/60 text-gray-300 hover:border-gray-600'
              : 'border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-surface text-gray-600 dark:text-gray-300'
          }`}
        >
          <button
            onClick={() => play(a)}
            title={playingId === a.id ? 'Stop' : 'Play this voice note'}
            className="flex items-center gap-1.5"
          >
            <span className="text-xs leading-none">{playingId === a.id ? '⏹' : '▶'}</span>
            <span className="tabular-nums">
              🎙 {a.duration != null ? formatSeconds(a.duration) : `#${i + 1}`}
            </span>
          </button>
          <button
            onClick={() => remove(a.id)}
            title="Delete this voice note"
            className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-600 text-white text-[10px] leading-none
                       opacity-0 group-hover/aud:opacity-100 transition-opacity flex items-center justify-center"
          >
            ✕
          </button>
        </div>
      ))}

      {recorder.isRecording ? (
        <button
          onClick={stopRecording}
          disabled={busy}
          title="Stop and save this voice note"
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1 border border-red-500 bg-red-500/10
                     text-red-400 text-[11px] disabled:opacity-50"
        >
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          <span className="tabular-nums">{formatSeconds(recorder.duration)}</span>
          <span>■ Stop</span>
        </button>
      ) : (
        <button
          onClick={startRecording}
          disabled={busy}
          title="Record a voice note"
          className={`rounded-full px-2.5 py-1 border border-dashed text-[11px] transition-colors disabled:opacity-50 ${
            dark
              ? 'border-gray-700 text-gray-500 hover:border-primary-500 hover:text-primary-400'
              : 'border-gray-300 dark:border-dark-border text-gray-400 hover:border-primary-400 hover:text-primary-500'
          }`}
        >
          {busy ? '…' : '🎙 Record'}
        </button>
      )}

      {recorder.error && <span className="text-[11px] text-red-400">{recorder.error}</span>}
    </div>
  );
}
