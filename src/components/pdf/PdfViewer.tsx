import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

interface PdfViewerProps {
  filePath: string;
  initialPage?: number;
  onPageChange?: (page: number) => void;
  pageOffset?: number;
  onCalibrateOffset?: (offset: number) => void;
  onScreenshotCapture?: (data: {
    imageData: ArrayBuffer;
    pageNumber: number;
    rect: { x: number; y: number; w: number; h: number };
  }) => void;
  highlightRange?: { pageNum: number; charStart: number; charEnd: number };
  wordHighlightRange?: { pageNum: number; charStart: number; charEnd: number };
}

export interface PdfViewerHandle {
  currentPage: number;
  totalPages: number;
  goToPage: (page: number) => void;
  pageOffset: number;
}

interface PageDimension {
  width: number;
  height: number;
  cumulativeOffset: number;
}

const PAGE_GAP = 8;
const BUFFER_PAGES = 1;
const MIN_SCALE = 0.5;
const MAX_SCALE = 3.0;
const SCALE_STEP = 0.25;
const DEFAULT_SCALE = 1.5;

const PdfViewer = forwardRef<PdfViewerHandle, PdfViewerProps>(
  ({ filePath, initialPage, onPageChange, pageOffset = 0, onCalibrateOffset, onScreenshotCapture, highlightRange, wordHighlightRange }, ref) => {
    const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
    const [currentPage, setCurrentPage] = useState(initialPage ?? 1);
    const [totalPages, setTotalPages] = useState(0);
    const [pageDimensions, setPageDimensions] = useState<PageDimension[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [scale, setScale] = useState(DEFAULT_SCALE);
    const [isEditingPage, setIsEditingPage] = useState(false);
    const [pageInput, setPageInput] = useState('');
    const [showCalibration, setShowCalibration] = useState(false);
    const [calibrationInput, setCalibrationInput] = useState('');
    const [screenshotMode, setScreenshotMode] = useState(false);
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectionStart, setSelectionStart] = useState<{ pageNum: number; x: number; y: number } | null>(null);
    const [selectionEnd, setSelectionEnd] = useState<{ x: number; y: number } | null>(null);
    const [highlightRects, setHighlightRects] = useState<{ pageNum: number; x: number; y: number; w: number; h: number }[]>([]);
    const [wordHighlightRects, setWordHighlightRects] = useState<{ pageNum: number; x: number; y: number; w: number; h: number }[]>([]);

    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
    const renderedPages = useRef<Set<number>>(new Set());
    const renderingPages = useRef<Set<number>>(new Set());
    const scrollingToPage = useRef(false);
    const restorePageOnZoom = useRef<number | null>(null);
    const calibrationRef = useRef<HTMLDivElement>(null);

    // Shared helper: walk TextItems and return viewport rects for a char range.
    // precise=true sub-divides each TextItem proportionally to isolate the exact
    // word within it (good for single-word highlights). precise=false highlights
    // the full TextItem (good for view-level highlights covering many words).
    const computeTextItemRects = useCallback(async (
      pageNum: number,
      charStart: number,
      charEnd: number,
      precise = false,
    ): Promise<{ pageNum: number; x: number; y: number; w: number; h: number }[]> => {
      if (!pdfDoc) return [];
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const textContent = await page.getTextContent();
      const rects: { pageNum: number; x: number; y: number; w: number; h: number }[] = [];
      let charOffset = 0;
      for (let i = 0; i < textContent.items.length; i++) {
        const item = textContent.items[i];
        if (!('str' in item)) continue;
        const str = (item as { str: string }).str;
        const tx = (item as { transform: number[] }).transform[4];
        const ty = (item as { transform: number[] }).transform[5];
        const iw = (item as { width: number }).width;
        const ih = (item as { height: number }).height;
        if (i > 0) charOffset += 1;
        const itemStart = charOffset;
        const itemEnd = charOffset + str.length;
        if (itemEnd > charStart && itemStart < charEnd) {
          let adjustedTx = tx;
          let adjustedIw = iw;
          if (precise && str.length > 0) {
            // Proportionally narrow the rect to just the overlapping chars within this item
            const localStart = Math.max(0, charStart - itemStart);
            const localEnd = Math.min(str.length, charEnd - itemStart);
            adjustedTx = tx + (localStart / str.length) * iw;
            adjustedIw = ((localEnd - localStart) / str.length) * iw;
          }
          const [vpX1, vpY1] = viewport.convertToViewportPoint(adjustedTx, ty + ih);
          const [vpX2, vpY2] = viewport.convertToViewportPoint(adjustedTx + adjustedIw, ty);
          rects.push({
            pageNum,
            x: Math.min(vpX1, vpX2),
            y: Math.min(vpY1, vpY2),
            w: Math.abs(vpX2 - vpX1),
            h: Math.abs(vpY2 - vpY1),
          });
        }
        charOffset = itemEnd;
      }
      return rects;
    }, [pdfDoc, scale]);

    // Compute view-level highlight rects
    useEffect(() => {
      if (!highlightRange || !pdfDoc) { setHighlightRects([]); return; }
      let cancelled = false;
      computeTextItemRects(highlightRange.pageNum, highlightRange.charStart, highlightRange.charEnd)
        .then(rects => { if (!cancelled) setHighlightRects(rects); })
        .catch(() => { if (!cancelled) setHighlightRects([]); });
      return () => { cancelled = true; };
    }, [highlightRange, pdfDoc, scale, computeTextItemRects]);

    // Compute word-level highlight rects on hover
    useEffect(() => {
      if (!wordHighlightRange || !pdfDoc) { setWordHighlightRects([]); return; }
      let cancelled = false;
      computeTextItemRects(wordHighlightRange.pageNum, wordHighlightRange.charStart, wordHighlightRange.charEnd, true)
        .then(rects => { if (!cancelled) setWordHighlightRects(rects); })
        .catch(() => { if (!cancelled) setWordHighlightRects([]); });
      return () => { cancelled = true; };
    }, [wordHighlightRange, pdfDoc, scale, computeTextItemRects]);

    // Offset conversion helpers
    const toBookPage = (pdfPage: number) => pdfPage - pageOffset;
    const toPdfPage = (bookPage: number) => bookPage + pageOffset;

    // Close calibration popover on outside click
    useEffect(() => {
      if (!showCalibration) return;
      const handleClick = (e: MouseEvent) => {
        if (calibrationRef.current && !calibrationRef.current.contains(e.target as Node)) {
          setShowCalibration(false);
        }
      };
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }, [showCalibration]);

    // Load the PDF document via IPC (file:// URLs are blocked in Electron renderer)
    useEffect(() => {
      let cancelled = false;

      window.electronAPI.pdf.readFile(filePath).then((arrayBuffer) => {
        if (cancelled) return;
        const data = new Uint8Array(arrayBuffer);
        return pdfjsLib.getDocument({ data }).promise;
      }).then((doc) => {
        if (cancelled || !doc) return;
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
      }).catch((err) => {
        if (!cancelled) {
          console.error('[PdfViewer] Failed to load PDF:', err);
          setError('Failed to load PDF file');
        }
      });

      return () => {
        cancelled = true;
      };
    }, [filePath]);

    // Compute page dimensions whenever pdfDoc or scale changes
    useEffect(() => {
      if (!pdfDoc) return;
      let cancelled = false;

      (async () => {
        const dims: PageDimension[] = [];
        let cumOffset = 0;
        for (let i = 1; i <= pdfDoc.numPages; i++) {
          const page = await pdfDoc.getPage(i);
          const viewport = page.getViewport({ scale });
          dims.push({
            width: viewport.width,
            height: viewport.height,
            cumulativeOffset: cumOffset,
          });
          cumOffset += viewport.height + PAGE_GAP;
        }
        if (!cancelled) {
          // Clear rendered pages so they re-render at the new scale
          renderedPages.current.clear();
          renderingPages.current.clear();
          setPageDimensions(dims);

          // Restore scroll position after zoom
          const pageToRestore = restorePageOnZoom.current;
          if (pageToRestore !== null && containerRef.current) {
            restorePageOnZoom.current = null;
            const offset = dims[pageToRestore - 1]?.cumulativeOffset;
            if (offset !== undefined) {
              requestAnimationFrame(() => {
                containerRef.current?.scrollTo({ top: offset, behavior: 'instant' });
              });
            }
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [pdfDoc, scale]);

    // Navigate to initial page after dimensions are ready
    useEffect(() => {
      if (initialPage && initialPage > 1 && pageDimensions.length > 0 && containerRef.current) {
        const idx = initialPage - 1;
        if (idx < pageDimensions.length) {
          containerRef.current.scrollTop = pageDimensions[idx].cumulativeOffset;
        }
      }
    }, [initialPage, pageDimensions]);

    // Render a single page
    const renderPage = useCallback(async (pageNum: number) => {
      if (!pdfDoc || renderedPages.current.has(pageNum) || renderingPages.current.has(pageNum)) return;

      const canvas = canvasRefs.current.get(pageNum);
      if (!canvas) return;

      renderingPages.current.add(pageNum);

      try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: ctx, viewport }).promise;
        renderedPages.current.add(pageNum);
      } catch (err) {
        console.error(`[PdfViewer] Failed to render page ${pageNum}:`, err);
      } finally {
        renderingPages.current.delete(pageNum);
      }
    }, [pdfDoc, scale]);

    // Determine current page from scroll position using binary search
    const getCurrentPageFromScroll = useCallback((scrollTop: number): number => {
      if (pageDimensions.length === 0) return 1;

      let low = 0;
      let high = pageDimensions.length - 1;

      while (low < high) {
        const mid = Math.floor((low + high + 1) / 2);
        if (pageDimensions[mid].cumulativeOffset <= scrollTop) {
          low = mid;
        } else {
          high = mid - 1;
        }
      }

      return low + 1; // 1-indexed
    }, [pageDimensions]);

    // Handle scroll — track current page and render visible pages
    const handleScroll = useCallback(() => {
      const container = containerRef.current;
      if (!container || pageDimensions.length === 0) return;

      const scrollTop = container.scrollTop;
      const viewportHeight = container.clientHeight;

      // Determine current page
      const page = getCurrentPageFromScroll(scrollTop);
      if (page !== currentPage && !scrollingToPage.current) {
        setCurrentPage(page);
        onPageChange?.(page);
      }

      // Render visible pages + buffer
      const scrollBottom = scrollTop + viewportHeight;
      for (let i = 0; i < pageDimensions.length; i++) {
        const dim = pageDimensions[i];
        const pageTop = dim.cumulativeOffset;
        const pageBottom = pageTop + dim.height;

        // Check if page is within visible range + buffer
        const bufferTop = scrollTop - (BUFFER_PAGES * viewportHeight);
        const bufferBottom = scrollBottom + (BUFFER_PAGES * viewportHeight);

        if (pageBottom >= bufferTop && pageTop <= bufferBottom) {
          renderPage(i + 1);
        }
      }
    }, [pageDimensions, currentPage, getCurrentPageFromScroll, onPageChange, renderPage]);

    // Attach scroll listener
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      container.addEventListener('scroll', handleScroll, { passive: true });
      // Initial render
      handleScroll();

      return () => container.removeEventListener('scroll', handleScroll);
    }, [handleScroll]);

    // goToPage method (takes PDF page number)
    const goToPage = useCallback((page: number) => {
      if (page < 1 || page > pageDimensions.length || !containerRef.current) return;

      scrollingToPage.current = true;
      setCurrentPage(page);
      onPageChange?.(page);

      const offset = pageDimensions[page - 1].cumulativeOffset;
      containerRef.current.scrollTo({ top: offset, behavior: 'smooth' });

      // Reset flag after scroll completes
      setTimeout(() => {
        scrollingToPage.current = false;
      }, 500);
    }, [pageDimensions, onPageChange]);

    // Zoom in/out while preserving current page position
    const handleZoom = useCallback((direction: 'in' | 'out') => {
      const newScale = direction === 'in'
        ? Math.min(scale + SCALE_STEP, MAX_SCALE)
        : Math.max(scale - SCALE_STEP, MIN_SCALE);
      if (newScale === scale) return;

      restorePageOnZoom.current = currentPage;
      setScale(newScale);
    }, [scale, currentPage]);

    // Hit-test: given mouse event, find which page and normalized coords
    const hitTestPage = useCallback((e: React.MouseEvent): { pageNum: number; normX: number; normY: number } | null => {
      const container = containerRef.current;
      if (!container || pageDimensions.length === 0) return null;

      const containerRect = container.getBoundingClientRect();
      const scrollTop = container.scrollTop;
      const scrollLeft = container.scrollLeft;
      // Y position in the total document space
      const docY = e.clientY - containerRect.top + scrollTop;
      // X position relative to container viewport
      const viewX = e.clientX - containerRect.left + scrollLeft;

      for (let i = 0; i < pageDimensions.length; i++) {
        const dim = pageDimensions[i];
        const pageTop = dim.cumulativeOffset;
        const pageBottom = pageTop + dim.height;

        if (docY >= pageTop && docY < pageBottom) {
          // Pages are centered: left = containerScrollWidth/2 - dim.width/2
          const containerScrollWidth = container.scrollWidth;
          const pageLeft = containerScrollWidth / 2 - dim.width / 2;
          const localX = viewX - pageLeft;
          const localY = docY - pageTop;

          if (localX < 0 || localX > dim.width || localY < 0 || localY > dim.height) return null;

          return {
            pageNum: i + 1,
            normX: localX / dim.width,
            normY: localY / dim.height,
          };
        }
      }
      return null;
    }, [pageDimensions]);

    // Screenshot mouse handlers
    const handleScreenshotMouseDown = useCallback((e: React.MouseEvent) => {
      if (!screenshotMode || e.button !== 0) return;
      const hit = hitTestPage(e);
      if (!hit || !renderedPages.current.has(hit.pageNum)) return;
      e.preventDefault();
      setSelectionStart({ pageNum: hit.pageNum, x: hit.normX, y: hit.normY });
      setSelectionEnd({ x: hit.normX, y: hit.normY });
      setIsSelecting(true);
    }, [screenshotMode, hitTestPage]);

    const handleScreenshotMouseMove = useCallback((e: React.MouseEvent) => {
      if (!isSelecting || !selectionStart) return;
      const hit = hitTestPage(e);
      if (!hit || hit.pageNum !== selectionStart.pageNum) return;
      setSelectionEnd({ x: hit.normX, y: hit.normY });
    }, [isSelecting, selectionStart, hitTestPage]);

    const handleScreenshotMouseUp = useCallback((_e: React.MouseEvent) => {
      if (!isSelecting || !selectionStart || !selectionEnd || !onScreenshotCapture) {
        setIsSelecting(false);
        setSelectionStart(null);
        setSelectionEnd(null);
        return;
      }

      const x = Math.min(selectionStart.x, selectionEnd.x);
      const y = Math.min(selectionStart.y, selectionEnd.y);
      const w = Math.abs(selectionEnd.x - selectionStart.x);
      const h = Math.abs(selectionEnd.y - selectionStart.y);

      // Ignore tiny selections (likely accidental clicks)
      if (w < 0.01 || h < 0.01) {
        setIsSelecting(false);
        setSelectionStart(null);
        setSelectionEnd(null);
        return;
      }

      const pageNum = selectionStart.pageNum;
      const canvas = canvasRefs.current.get(pageNum);
      if (!canvas) {
        setIsSelecting(false);
        setSelectionStart(null);
        setSelectionEnd(null);
        return;
      }

      // Crop from the canvas
      const sx = x * canvas.width;
      const sy = y * canvas.height;
      const sw = w * canvas.width;
      const sh = h * canvas.height;
      const crop = document.createElement('canvas');
      crop.width = sw;
      crop.height = sh;
      const ctx = crop.getContext('2d');
      if (ctx) {
        ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
        crop.toBlob((blob) => {
          if (blob) {
            blob.arrayBuffer().then((buf) => {
              onScreenshotCapture({ imageData: buf, pageNumber: pageNum, rect: { x, y, w, h } });
            });
          }
        }, 'image/png');
      }

      setIsSelecting(false);
      setSelectionStart(null);
      setSelectionEnd(null);
    }, [isSelecting, selectionStart, selectionEnd, onScreenshotCapture]);

    // Expose imperative handle
    useImperativeHandle(ref, () => ({
      currentPage,
      totalPages,
      goToPage,
      pageOffset,
    }), [currentPage, totalPages, goToPage, pageOffset]);

    if (error) {
      return (
        <div className="flex items-center justify-center h-full text-red-500 dark:text-red-400">
          <p>{error}</p>
        </div>
      );
    }

    if (!pdfDoc || pageDimensions.length === 0) {
      return (
        <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
          Loading PDF...
        </div>
      );
    }

    // Total height of all pages
    const lastDim = pageDimensions[pageDimensions.length - 1];
    const totalHeight = lastDim.cumulativeOffset + lastDim.height;

    // Display values
    const hasOffset = pageOffset !== 0;
    const displayPage = hasOffset ? `p.${toBookPage(currentPage)}` : `Page ${currentPage}`;

    return (
      <div className="flex flex-col h-full">
        {/* Page indicator bar */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-gray-100 dark:bg-dark-hover rounded-t-lg border-b border-gray-200 dark:border-dark-border">
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            className="px-2 py-0.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 disabled:opacity-30"
          >
            &larr; Prev
          </button>
          {isEditingPage ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const inputVal = parseInt(pageInput, 10);
                if (hasOffset) {
                  // Input is book page, convert to PDF page
                  const pdfPage = toPdfPage(inputVal);
                  if (pdfPage >= 1 && pdfPage <= totalPages) goToPage(pdfPage);
                } else {
                  if (inputVal >= 1 && inputVal <= totalPages) goToPage(inputVal);
                }
                setIsEditingPage(false);
              }}
              className="flex items-center gap-1"
            >
              {hasOffset && <span className="text-sm text-gray-700 dark:text-gray-300">p.</span>}
              {!hasOffset && <span className="text-sm text-gray-700 dark:text-gray-300">Page</span>}
              <input
                autoFocus
                type="number"
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onBlur={() => setIsEditingPage(false)}
                onKeyDown={(e) => { if (e.key === 'Escape') setIsEditingPage(false); }}
                className="w-14 px-1 py-0 text-sm text-center font-medium bg-white dark:bg-dark-bg border border-gray-300 dark:border-dark-border rounded outline-none focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">/ {totalPages}</span>
            </form>
          ) : (
            <button
              onClick={() => {
                setPageInput(String(hasOffset ? toBookPage(currentPage) : currentPage));
                setIsEditingPage(true);
              }}
              className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
            >
              {displayPage} / {totalPages}
            </button>
          )}
          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="px-2 py-0.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 disabled:opacity-30"
          >
            Next &rarr;
          </button>
          <div className="flex items-center gap-1 ml-2 pl-2 border-l border-gray-300 dark:border-dark-border">
            <button
              onClick={() => handleZoom('out')}
              disabled={scale <= MIN_SCALE}
              className="w-6 h-6 flex items-center justify-center text-sm font-bold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 disabled:opacity-30 rounded hover:bg-gray-200 dark:hover:bg-dark-bg"
            >
              &minus;
            </button>
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-10 text-center">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={() => handleZoom('in')}
              disabled={scale >= MAX_SCALE}
              className="w-6 h-6 flex items-center justify-center text-sm font-bold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 disabled:opacity-30 rounded hover:bg-gray-200 dark:hover:bg-dark-bg"
            >
              +
            </button>
          </div>
          {/* Screenshot toggle button */}
          {onScreenshotCapture && (
            <div className="ml-2 pl-2 border-l border-gray-300 dark:border-dark-border">
              <button
                onClick={() => setScreenshotMode(!screenshotMode)}
                className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                  screenshotMode
                    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-dark-bg'
                }`}
                title={screenshotMode ? 'Exit screenshot mode' : 'Screenshot region'}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          )}
          {/* Calibration button */}
          {onCalibrateOffset && (
            <div className="relative ml-2 pl-2 border-l border-gray-300 dark:border-dark-border" ref={calibrationRef}>
              <button
                onClick={() => {
                  setCalibrationInput('');
                  setShowCalibration(!showCalibration);
                }}
                className={`px-1.5 py-0.5 text-xs font-medium rounded transition-colors ${
                  hasOffset
                    ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900/60'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-dark-bg'
                }`}
                title="Calibrate page offset"
              >
                {hasOffset ? (
                  <span>{`\u00B1${pageOffset}`}</span>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
              {/* Calibration popover */}
              {showCalibration && (
                <div className="absolute right-0 top-full mt-1 z-50 w-64 p-3 bg-white dark:bg-dark-surface rounded-lg shadow-lg border border-gray-200 dark:border-dark-border">
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                    What book page is this?
                    <br />
                    <span className="text-gray-400 dark:text-gray-500">
                      (viewing PDF page {currentPage})
                    </span>
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const bookPage = parseInt(calibrationInput, 10);
                      if (!isNaN(bookPage)) {
                        const newOffset = currentPage - bookPage;
                        onCalibrateOffset(newOffset);
                        setShowCalibration(false);
                      }
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      autoFocus
                      type="number"
                      value={calibrationInput}
                      onChange={(e) => setCalibrationInput(e.target.value)}
                      placeholder="Book page #"
                      className="flex-1 px-2 py-1 text-sm bg-gray-50 dark:bg-dark-bg border border-gray-300 dark:border-dark-border rounded outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      type="submit"
                      className="px-2 py-1 text-xs font-medium bg-indigo-500 text-white rounded hover:bg-indigo-600"
                    >
                      Set
                    </button>
                  </form>
                  {hasOffset && (
                    <button
                      onClick={() => {
                        onCalibrateOffset(0);
                        setShowCalibration(false);
                      }}
                      className="mt-2 text-xs text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                    >
                      Reset offset
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Scrollable PDF container */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto bg-gray-200 dark:bg-gray-800 rounded-b-lg"
          style={{ position: 'relative', cursor: screenshotMode ? 'crosshair' : undefined }}
          onMouseDown={screenshotMode ? handleScreenshotMouseDown : undefined}
          onMouseMove={screenshotMode ? handleScreenshotMouseMove : undefined}
          onMouseUp={screenshotMode ? handleScreenshotMouseUp : undefined}
        >
          <div style={{ height: totalHeight, position: 'relative' }}>
            {pageDimensions.map((dim, i) => (
              <div
                key={i + 1}
                style={{
                  position: 'absolute',
                  top: dim.cumulativeOffset,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: dim.width,
                  height: dim.height,
                }}
              >
                <canvas
                  ref={(el) => {
                    if (el) canvasRefs.current.set(i + 1, el);
                    else canvasRefs.current.delete(i + 1);
                  }}
                  style={{ width: '100%', height: '100%', pointerEvents: screenshotMode ? 'none' : undefined }}
                  className="shadow-md"
                />
                {/* Highlight overlay for reader view correspondence */}
                {highlightRects
                  .filter(r => r.pageNum === i + 1)
                  .map((r, ri) => (
                    <div
                      key={`hl-${ri}`}
                      className="absolute pointer-events-none"
                      style={{
                        left: r.x,
                        top: r.y,
                        width: r.w,
                        height: r.h,
                        backgroundColor: 'rgba(167, 139, 250, 0.3)',
                        borderRadius: 2,
                      }}
                    />
                  ))}
                {/* Word-level hover highlight */}
                {wordHighlightRects
                  .filter(r => r.pageNum === i + 1)
                  .map((r, ri) => (
                    <div
                      key={`whl-${ri}`}
                      className="absolute pointer-events-none"
                      style={{
                        left: r.x,
                        top: r.y,
                        width: r.w,
                        height: r.h,
                        backgroundColor: 'rgba(167, 139, 250, 0.55)',
                        borderRadius: 2,
                        transition: 'opacity 100ms',
                      }}
                    />
                  ))}
              </div>
            ))}
            {/* Selection overlay while dragging */}
            {isSelecting && selectionStart && selectionEnd && (() => {
              const dim = pageDimensions[selectionStart.pageNum - 1];
              if (!dim) return null;
              const containerScrollWidth = containerRef.current?.scrollWidth ?? 0;
              const pageLeft = containerScrollWidth / 2 - dim.width / 2;
              const x = Math.min(selectionStart.x, selectionEnd.x);
              const y = Math.min(selectionStart.y, selectionEnd.y);
              const w = Math.abs(selectionEnd.x - selectionStart.x);
              const h = Math.abs(selectionEnd.y - selectionStart.y);
              return (
                <div
                  style={{
                    position: 'absolute',
                    top: dim.cumulativeOffset + y * dim.height,
                    left: pageLeft + x * dim.width,
                    width: w * dim.width,
                    height: h * dim.height,
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    border: '2px solid rgba(59, 130, 246, 0.7)',
                    pointerEvents: 'none',
                    zIndex: 10,
                  }}
                />
              );
            })()}
          </div>
        </div>
      </div>
    );
  }
);

PdfViewer.displayName = 'PdfViewer';

export default PdfViewer;
