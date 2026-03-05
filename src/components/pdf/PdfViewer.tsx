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
}

export interface PdfViewerHandle {
  currentPage: number;
  totalPages: number;
  goToPage: (page: number) => void;
}

interface PageDimension {
  width: number;
  height: number;
  cumulativeOffset: number;
}

const SCALE = 1.5;
const PAGE_GAP = 8;
const BUFFER_PAGES = 1;

const PdfViewer = forwardRef<PdfViewerHandle, PdfViewerProps>(
  ({ filePath, initialPage, onPageChange }, ref) => {
    const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
    const [currentPage, setCurrentPage] = useState(initialPage ?? 1);
    const [totalPages, setTotalPages] = useState(0);
    const [pageDimensions, setPageDimensions] = useState<PageDimension[]>([]);
    const [error, setError] = useState<string | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
    const renderedPages = useRef<Set<number>>(new Set());
    const renderingPages = useRef<Set<number>>(new Set());
    const scrollingToPage = useRef(false);

    // Load the PDF document via IPC (file:// URLs are blocked in Electron renderer)
    useEffect(() => {
      let cancelled = false;

      window.electronAPI.pdf.readFile(filePath).then((arrayBuffer) => {
        if (cancelled) return;
        const data = new Uint8Array(arrayBuffer);
        return pdfjsLib.getDocument({ data }).promise;
      }).then(async (doc) => {
        if (cancelled || !doc) return;
        if (cancelled) return;
        setPdfDoc(doc);
        setTotalPages(doc.numPages);

        // Pre-compute page dimensions
        const dims: PageDimension[] = [];
        let cumOffset = 0;
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale: SCALE });
          dims.push({
            width: viewport.width,
            height: viewport.height,
            cumulativeOffset: cumOffset,
          });
          cumOffset += viewport.height + PAGE_GAP;
        }
        if (!cancelled) {
          setPageDimensions(dims);
        }
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
        const viewport = page.getViewport({ scale: SCALE });
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
    }, [pdfDoc]);

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

    // goToPage method
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

    // Expose imperative handle
    useImperativeHandle(ref, () => ({
      currentPage,
      totalPages,
      goToPage,
    }), [currentPage, totalPages, goToPage]);

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
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Page {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="px-2 py-0.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 disabled:opacity-30"
          >
            Next &rarr;
          </button>
        </div>

        {/* Scrollable PDF container */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto bg-gray-200 dark:bg-gray-800 rounded-b-lg"
          style={{ position: 'relative' }}
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
                  style={{ width: '100%', height: '100%' }}
                  className="shadow-md"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
);

PdfViewer.displayName = 'PdfViewer';

export default PdfViewer;
