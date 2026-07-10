import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';

// Importing CodeEditor pulls in all five Monaco workers as a module side effect. ReviewSession is
// otherwise Monaco-free and opens as a full-screen overlay, so load it only when the pane is shown.
const CodeEditor = lazy(() => import('../code/CodeEditor'));

const AUTOSAVE_DEBOUNCE_MS = 600;

interface ReviewCodePaneProps {
  /** The enrolled card. One pad per card — see ADR-0009. */
  reviewItemId: number;
  /** Peek mode writes nothing. */
  readOnly?: boolean;
}

/**
 * Scratch code pad beside the card being reviewed. Type your attempt; it saves itself.
 *
 * Autosave is debounced, and flushes on card change and on unmount. The pending write carries its
 * OWN reviewItemId rather than reading the current prop, because the debounce can outlive the card:
 * arrow-key to the next card within 600ms of a keystroke and a naive implementation would write the
 * previous card's code onto the new one.
 */
export default function ReviewCodePane({ reviewItemId, readOnly = false }: ReviewCodePaneProps) {
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('java');
  const [loading, setLoading] = useState(true);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [dirty, setDirty] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The write waiting to happen, pinned to the card it was typed on. */
  const pendingRef = useRef<{ itemId: number; code: string; language: string } | null>(null);

  const flush = useCallback(async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    await window.electronAPI.reviewCodeSnippets.save(pending.itemId, pending.code, pending.language);
    setSavedAt(new Date());
    setDirty(false);
  }, []);

  // Keep a stable handle so the unmount cleanup below always calls the latest flush.
  const flushRef = useRef(flush);
  useEffect(() => { flushRef.current = flush; }, [flush]);

  // Load this card's pad. The cleanup flushes whatever the PREVIOUS card left pending, which is
  // why it runs before the next effect body — React tears down before it sets up.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDirty(false);
    setSavedAt(null);
    window.electronAPI.reviewCodeSnippets.getByItem(reviewItemId).then(row => {
      if (cancelled) return;
      setCode(row?.code ?? '');
      setLanguage(row?.language ?? 'java');
      setLoading(false);
    });
    return () => {
      cancelled = true;
      void flushRef.current();
    };
  }, [reviewItemId]);

  // Last resort: the window is closing, React never unmounts.
  useEffect(() => {
    const onBeforeUnload = () => { void flushRef.current(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const schedule = useCallback((nextCode: string, nextLanguage: string) => {
    if (readOnly) return;
    pendingRef.current = { itemId: reviewItemId, code: nextCode, language: nextLanguage };
    setDirty(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void flush(); }, AUTOSAVE_DEBOUNCE_MS);
  }, [reviewItemId, readOnly, flush]);

  const onCodeChange = (next: string) => { setCode(next); schedule(next, language); };
  const onLanguageChange = (next: string) => { setLanguage(next); schedule(code, next); };

  return (
    <div className="flex flex-col h-full min-h-0 border-l border-gray-800 bg-gray-950">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-800 shrink-0">
        <span className="text-xs text-gray-400">Scratch code</span>
        <span className="text-[11px] text-gray-600 tabular-nums">
          {readOnly ? 'read-only' : dirty ? 'saving…' : savedAt ? `saved ${savedAt.toLocaleTimeString()}` : ''}
        </span>
      </div>

      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="h-full flex items-center justify-center text-xs text-gray-600">loading…</div>
        ) : (
          <Suspense fallback={<div className="h-full flex items-center justify-center text-xs text-gray-600">loading editor…</div>}>
            <CodeEditor
              code={code}
              language={language}
              onChange={onCodeChange}
              onLanguageChange={onLanguageChange}
              readOnly={readOnly}
              fill
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
