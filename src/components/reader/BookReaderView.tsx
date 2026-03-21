import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { BookData } from '../../types';
import {
  buildFullText,
  buildPageMap,
  buildViewOffsets,
  findOriginalPage,
  findViewIndex,
  getOffsetForPage,
  measureTextCapacity,
  PageMapEntry,
} from '../../utils/readerPagination';
import PdfViewer, { PdfViewerHandle } from '../pdf/PdfViewer';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.0;
const ZOOM_STEP = 0.1;
const DEFAULT_ZOOM = 1.0;
const BASE_FONT_SIZE = 18;

interface BookReaderViewProps {
  bookDataPath: string;
  pdfPath?: string;
  initialCharacterOffset?: number;
  onPositionChange?: (characterOffset: number, progress: number, originalPage: number) => void;
}

export interface BookReaderViewHandle {
  goToOriginalPage: (pageNum: number) => void;
  currentOriginalPage: number;
}

interface ReaderState {
  viewText: string;
  viewIndex: number;
  totalViews: number;
  originalPage: number;
  totalOriginalPages: number;
  isLoading: boolean;
}

export const BookReaderView = forwardRef<BookReaderViewHandle, BookReaderViewProps>(
  ({ bookDataPath, pdfPath, initialCharacterOffset = 0, onPositionChange }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const pdfPreviewRef = useRef<PdfViewerHandle>(null);
    const [zoom, setZoom] = useState(DEFAULT_ZOOM);
    const [showPdfPreview, setShowPdfPreview] = useState(false);
    const [isEditingPage, setIsEditingPage] = useState(false);
    const [pageInput, setPageInput] = useState('');
    const [isEditingView, setIsEditingView] = useState(false);
    const [viewInput, setViewInput] = useState('');
    const [bookData, setBookData] = useState<BookData | null>(null);
    const [hoveredWordRange, setHoveredWordRange] = useState<{ charStart: number; charEnd: number } | null>(null);
    const [state, setState] = useState<ReaderState>({
      viewText: '',
      viewIndex: 0,
      totalViews: 1,
      originalPage: 1,
      totalOriginalPages: 1,
      isLoading: true,
    });

    // Track character offset via ref to avoid re-triggering reflow on every navigation
    const charOffsetRef = useRef(initialCharacterOffset);
    const fullTextRef = useRef('');
    const pageMapRef = useRef<PageMapEntry[]>([]);
    const viewOffsetsRef = useRef<number[]>([]);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Load book data once
    useEffect(() => {
      let cancelled = false;
      (async () => {
        try {
          const data = await window.electronAPI.pdf.readBookData(bookDataPath) as BookData;
          if (!cancelled) setBookData(data);
        } catch (err) {
          console.error('Failed to load book data:', err);
        }
      })();
      return () => { cancelled = true; };
    }, [bookDataPath]);

    // Reflow whenever bookData, zoom, or container size changes
    const reflow = useCallback(() => {
      if (!bookData || !containerRef.current) return;

      const { width, height } = containerRef.current.getBoundingClientRect();
      if (width === 0 || height === 0) return;

      const fontSize = BASE_FONT_SIZE * zoom;
      const capacity = measureTextCapacity(width, height, fontSize);

      const fullText = fullTextRef.current;
      const viewOffsets = buildViewOffsets(fullText, capacity);
      viewOffsetsRef.current = viewOffsets;

      const currentOffset = charOffsetRef.current;
      const viewIndex = findViewIndex(currentOffset, viewOffsets);
      const viewStart = viewOffsets[viewIndex] ?? 0;
      const viewEnd = viewIndex + 1 < viewOffsets.length
        ? viewOffsets[viewIndex + 1]
        : fullText.length;
      const viewText = fullText.slice(viewStart, viewEnd);
      const originalPage = findOriginalPage(viewStart, pageMapRef.current);

      setState({
        viewText,
        viewIndex,
        totalViews: viewOffsets.length,
        originalPage,
        totalOriginalPages: bookData.total_pages,
        isLoading: false,
      });
    }, [bookData, zoom]);

    // Build full text and page map when bookData changes
    useEffect(() => {
      if (!bookData) return;
      fullTextRef.current = buildFullText(bookData.pages);
      pageMapRef.current = buildPageMap(bookData.pages);
    }, [bookData]);

    // Reflow on bookData / zoom changes
    useEffect(() => {
      if (!bookData) return;
      reflow();
    }, [bookData, zoom, reflow]);

    // Resize observer
    useEffect(() => {
      if (!containerRef.current) return;
      const observer = new ResizeObserver(() => reflow());
      observer.observe(containerRef.current);
      return () => observer.disconnect();
    }, [reflow]);

    const navigate = useCallback((newViewIndex: number) => {
      const viewOffsets = viewOffsetsRef.current;
      const fullText = fullTextRef.current;
      if (viewOffsets.length === 0) return;

      const clamped = Math.max(0, Math.min(newViewIndex, viewOffsets.length - 1));
      const viewStart = viewOffsets[clamped];
      const viewEnd = clamped + 1 < viewOffsets.length
        ? viewOffsets[clamped + 1]
        : fullText.length;
      const viewText = fullText.slice(viewStart, viewEnd);
      const originalPage = findOriginalPage(viewStart, pageMapRef.current);

      charOffsetRef.current = viewStart;

      setState((prev) => ({
        ...prev,
        viewText,
        viewIndex: clamped,
        originalPage,
      }));

      // Debounced save
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const progress = fullText.length > 0 ? viewStart / fullText.length : 0;
        onPositionChange?.(viewStart, progress, originalPage);
      }, 500);
    }, [onPositionChange]);

    // Sync PDF preview to current page whenever it changes
    useEffect(() => {
      if (showPdfPreview && pdfPreviewRef.current && state.originalPage) {
        pdfPreviewRef.current.goToPage(state.originalPage);
      }
    }, [state.originalPage, showPdfPreview]);

    // Internal helper to jump to an original PDF page (used by clickable page input)
    const goToOriginalPageInternal = useCallback((pageNum: number) => {
      const offset = getOffsetForPage(pageNum, pageMapRef.current);
      charOffsetRef.current = offset;
      const viewIndex = findViewIndex(offset, viewOffsetsRef.current);
      navigate(viewIndex);
    }, [navigate]);

    // Auto-focus the reader so arrow keys work immediately without clicking first
    const readerDivRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      readerDivRef.current?.focus();
    }, []);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        navigate(state.viewIndex + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        navigate(state.viewIndex - 1);
      } else if ((e.metaKey || e.ctrlKey) && e.key === '=') {
        e.preventDefault();
        e.stopPropagation();
        setZoom((z) => Math.min(MAX_ZOOM, parseFloat((z + ZOOM_STEP).toFixed(1))));
      } else if ((e.metaKey || e.ctrlKey) && e.key === '-') {
        e.preventDefault();
        e.stopPropagation();
        setZoom((z) => Math.max(MIN_ZOOM, parseFloat((z - ZOOM_STEP).toFixed(1))));
      }
    }, [navigate, state.viewIndex]);

    // Expose imperative API to parent
    useImperativeHandle(ref, () => ({
      goToOriginalPage: (pageNum: number) => {
        const offset = getOffsetForPage(pageNum, pageMapRef.current);
        charOffsetRef.current = offset;
        const viewIndex = findViewIndex(offset, viewOffsetsRef.current);
        navigate(viewIndex);
      },
      get currentOriginalPage() {
        return state.originalPage;
      },
    }), [navigate, state.originalPage]);

    // Compute which character range within the current page corresponds to this view.
    // Passed to PdfViewer so it can highlight the matching text items on the PDF canvas.
    const highlightRange = useMemo(() => {
      if (!showPdfPreview || !pdfPath || state.isLoading) return undefined;
      const viewOffsets = viewOffsetsRef.current;
      const pageMap = pageMapRef.current;
      if (viewOffsets.length === 0 || pageMap.length === 0) return undefined;

      const viewStart = viewOffsets[state.viewIndex] ?? 0;
      const viewEnd = state.viewIndex + 1 < viewOffsets.length
        ? viewOffsets[state.viewIndex + 1]
        : fullTextRef.current.length;

      const entry = pageMap.find(e => viewStart >= e.startOffset && viewStart < e.endOffset);
      if (!entry) return undefined;

      const charStart = viewStart - entry.startOffset;
      const charEnd = Math.min(viewEnd, entry.endOffset) - entry.startOffset;
      return { pageNum: entry.pageNum, charStart, charEnd };
    }, [state.viewIndex, state.isLoading, showPdfPreview, pdfPath]);

    // Split viewText into word/whitespace tokens with within-page char offsets for hover highlighting
    const wordSpans = useMemo(() => {
      if (!state.viewText || state.isLoading) return [];
      const viewOffsets = viewOffsetsRef.current;
      const pageMap = pageMapRef.current;
      const viewStart = viewOffsets[state.viewIndex] ?? 0;
      const entry = pageMap.find(e => viewStart >= e.startOffset && viewStart < e.endOffset);
      const pageStartOffset = entry ? entry.startOffset : 0;
      const spans: { text: string; isWord: boolean; pageCharStart: number; pageCharEnd: number }[] = [];
      const regex = /(\S+|\s+)/g;
      let match;
      while ((match = regex.exec(state.viewText)) !== null) {
        const text = match[0];
        const pageCharStart = (viewStart - pageStartOffset) + match.index;
        spans.push({
          text,
          isWord: /\S/.test(text),
          pageCharStart,
          pageCharEnd: pageCharStart + text.length,
        });
      }
      return spans;
    }, [state.viewText, state.viewIndex, state.isLoading]);

    // Derive word-level highlight range for PdfViewer when hovering
    const wordHighlightRange = useMemo(() => {
      if (!hoveredWordRange || !showPdfPreview || !pdfPath || state.isLoading) return undefined;
      const viewOffsets = viewOffsetsRef.current;
      const pageMap = pageMapRef.current;
      const viewStart = viewOffsets[state.viewIndex] ?? 0;
      const entry = pageMap.find(e => viewStart >= e.startOffset && viewStart < e.endOffset);
      if (!entry) return undefined;
      return { pageNum: entry.pageNum, charStart: hoveredWordRange.charStart, charEnd: hoveredWordRange.charEnd };
    }, [hoveredWordRange, state.viewIndex, state.isLoading, showPdfPreview, pdfPath]);

    const fontSize = BASE_FONT_SIZE * zoom;
    const progress = state.totalViews > 1
      ? (state.viewIndex / (state.totalViews - 1)) * 100
      : 100;

    // Always render containerRef so ResizeObserver fires and reflow can measure dimensions.
    // Loading state is shown as content inside the container, not as a replacement for it.
    return (
      <div
        ref={readerDivRef}
        className="h-full flex flex-col bg-amber-50/30 dark:bg-stone-900 select-none outline-none"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {/* Reading area — always mounted; splits horizontally when PDF preview is active */}
        <div className={`flex-1 overflow-hidden ${showPdfPreview && pdfPath ? 'flex flex-row' : ''}`}>
          {/* Reader text pane */}
          <div
            ref={containerRef}
            className={`overflow-hidden relative cursor-pointer ${showPdfPreview && pdfPath ? 'w-1/2 border-r border-stone-200/60 dark:border-stone-700/60' : 'w-full h-full'}`}
            onClick={(e) => {
              if (state.isLoading) return;
              const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
              const relX = e.clientX - rect.left;
              if (relX < rect.width * 0.3) {
                navigate(state.viewIndex - 1);
              } else if (relX > rect.width * 0.7) {
                navigate(state.viewIndex + 1);
              }
            }}
          >
            {state.isLoading ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-stone-400 dark:text-stone-500 text-sm">Loading book...</div>
              </div>
            ) : (
              <>
                {/* Left nav zone hint */}
                <div className="absolute left-0 top-0 bottom-0 w-[30%] flex items-center justify-start pl-3 opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
                  {state.viewIndex > 0 && (
                    <svg className="w-6 h-6 text-stone-400/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
                    </svg>
                  )}
                </div>

                {/* Right nav zone hint */}
                <div className="absolute right-0 top-0 bottom-0 w-[30%] flex items-center justify-end pr-3 opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
                  {state.viewIndex < state.totalViews - 1 && (
                    <svg className="w-6 h-6 text-stone-400/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </div>

                {/* Text content */}
                <div className="h-full flex items-center justify-center px-10 py-6">
                  <p
                    style={{
                      fontSize: `${fontSize}px`,
                      lineHeight: 1.8,
                      fontFamily: "Georgia, 'Palatino Linotype', serif",
                    }}
                    className="text-stone-800 dark:text-stone-200 max-w-prose transition-opacity duration-150"
                  >
                    {wordSpans.length > 0 ? wordSpans.map((span, idx) =>
                      span.isWord ? (
                        <span
                          key={idx}
                          className="rounded-sm transition-colors duration-100"
                          style={
                            hoveredWordRange && span.pageCharStart === hoveredWordRange.charStart
                              ? { backgroundColor: 'rgba(167, 139, 250, 0.35)' }
                              : undefined
                          }
                          onMouseEnter={() => setHoveredWordRange({ charStart: span.pageCharStart, charEnd: span.pageCharEnd })}
                          onMouseLeave={() => setHoveredWordRange(null)}
                        >
                          {span.text}
                        </span>
                      ) : (
                        <span key={idx}>{span.text}</span>
                      )
                    ) : (
                      <span className="text-stone-400 dark:text-stone-500 italic">No text on this view.</span>
                    )}
                  </p>
                </div>

                {/* Fade gradient at bottom edge */}
                <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-amber-50/60 dark:from-stone-900/60 to-transparent pointer-events-none" />
              </>
            )}
          </div>

          {/* PDF preview pane */}
          {showPdfPreview && pdfPath && (
            <div className="w-1/2 overflow-hidden">
              <PdfViewer
                ref={pdfPreviewRef}
                filePath={pdfPath}
                initialPage={state.originalPage}
                highlightRange={highlightRange}
                wordHighlightRange={wordHighlightRange}
              />
            </div>
          )}
        </div>

        {/* Status bar */}
        {!state.isLoading && (
          <div className="flex-none px-4 py-2 border-t border-stone-200/60 dark:border-stone-700/60 bg-amber-50/50 dark:bg-stone-900/80">
            {/* Progress bar */}
            <div className="w-full h-0.5 bg-stone-200 dark:bg-stone-700 rounded-full mb-2 overflow-hidden">
              <div
                className="h-full bg-violet-400 dark:bg-violet-500 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              {/* Page info — click to jump */}
              {isEditingPage ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const val = parseInt(pageInput, 10);
                    if (val >= 1 && val <= state.totalOriginalPages) {
                      goToOriginalPageInternal(val);
                    }
                    setIsEditingPage(false);
                  }}
                  className="flex items-center gap-1"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <span className="text-xs text-stone-500 dark:text-stone-400">Page</span>
                  <input
                    autoFocus
                    type="number"
                    value={pageInput}
                    onChange={(e) => setPageInput(e.target.value)}
                    onBlur={() => setIsEditingPage(false)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setIsEditingPage(false); e.stopPropagation(); }}
                    className="w-14 px-1 py-0 text-xs text-center tabular-nums bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded outline-none focus:ring-1 focus:ring-violet-500"
                    min={1}
                    max={state.totalOriginalPages}
                  />
                  <span className="text-xs text-stone-500 dark:text-stone-400">of {state.totalOriginalPages}</span>
                </form>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); setPageInput(String(state.originalPage)); setIsEditingPage(true); }}
                  className="text-xs text-stone-500 dark:text-stone-400 tabular-nums hover:text-violet-600 dark:hover:text-violet-400 transition-colors cursor-pointer"
                  title="Click to jump to page"
                >
                  Page {state.originalPage} of {state.totalOriginalPages}
                </button>
              )}

              {/* Zoom controls + PDF preview toggle */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.max(MIN_ZOOM, parseFloat((z - ZOOM_STEP).toFixed(1)))); }}
                  className="w-6 h-6 flex items-center justify-center rounded text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 hover:bg-stone-200/60 dark:hover:bg-stone-700/60 transition-colors text-sm font-medium"
                  title="Zoom out (⌘-)"
                >
                  −
                </button>
                <span className="text-xs text-stone-400 dark:text-stone-500 tabular-nums w-9 text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.min(MAX_ZOOM, parseFloat((z + ZOOM_STEP).toFixed(1)))); }}
                  className="w-6 h-6 flex items-center justify-center rounded text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 hover:bg-stone-200/60 dark:hover:bg-stone-700/60 transition-colors text-sm font-medium"
                  title="Zoom in (⌘=)"
                >
                  +
                </button>
                {pdfPath && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowPdfPreview((v) => !v); }}
                    className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${showPdfPreview ? 'text-violet-500 bg-violet-100 dark:bg-violet-900/40' : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 hover:bg-stone-200/60 dark:hover:bg-stone-700/60'}`}
                    title={showPdfPreview ? 'Hide PDF page' : 'Show PDF page'}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </button>
                )}
              </div>

              {/* View info — click to jump */}
              {isEditingView ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const val = parseInt(viewInput, 10);
                    if (val >= 1 && val <= state.totalViews) {
                      navigate(val - 1);
                    }
                    setIsEditingView(false);
                  }}
                  className="flex items-center gap-1"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <span className="text-xs text-stone-500 dark:text-stone-400">View</span>
                  <input
                    autoFocus
                    type="number"
                    value={viewInput}
                    onChange={(e) => setViewInput(e.target.value)}
                    onBlur={() => setIsEditingView(false)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setIsEditingView(false); e.stopPropagation(); }}
                    className="w-16 px-1 py-0 text-xs text-center tabular-nums bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded outline-none focus:ring-1 focus:ring-violet-500"
                    min={1}
                    max={state.totalViews}
                  />
                  <span className="text-xs text-stone-500 dark:text-stone-400">/ {state.totalViews}</span>
                </form>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); setViewInput(String(state.viewIndex + 1)); setIsEditingView(true); }}
                  className="text-xs text-stone-500 dark:text-stone-400 tabular-nums hover:text-violet-600 dark:hover:text-violet-400 transition-colors cursor-pointer"
                  title="Click to jump to view"
                >
                  View {state.viewIndex + 1} / {state.totalViews}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
);

BookReaderView.displayName = 'BookReaderView';
export default BookReaderView;
