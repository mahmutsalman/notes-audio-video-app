import * as pdfjs from 'pdfjs-dist';
import { BookData, BookPage, ExtractionProgress } from '../types';
// Bundle the worker and core locally to avoid CDN fetches blocked by CSP
import tesseractWorkerUrl from 'tesseract.js/dist/worker.min.js?url';
import tesseractCoreUrl from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url';

// pdfjs worker is already configured by PdfViewer — no need to re-set here,
// but set a fallback in case this service is used before PdfViewer is mounted.
if (!pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
}

const MIN_TEXT_CHARS = 50;

export async function extractTextFromPdf(
  pdfBuffer: ArrayBuffer,
  onProgress?: (progress: ExtractionProgress) => void
): Promise<BookData> {
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBuffer) });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;

  const pages: BookPage[] = [];
  let totalWords = 0;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.({
      percent: Math.round(((pageNum - 1) / totalPages) * 100),
      page: pageNum,
      totalPages,
      phase: 'Extracting text',
    });

    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    let bookPage: BookPage;

    if (text.length >= MIN_TEXT_CHARS) {
      bookPage = {
        page_num: pageNum,
        text,
        extraction_method: 'text',
        confidence: null,
      };
    } else {
      // OCR fallback for scanned pages
      onProgress?.({
        percent: Math.round(((pageNum - 1) / totalPages) * 100),
        page: pageNum,
        totalPages,
        phase: `OCR scanning page ${pageNum}`,
      });
      bookPage = await ocrPage(page, pageNum);
    }

    const wordCount = bookPage.text.split(/\s+/).filter((w) => w.length > 0).length;
    totalWords += wordCount;
    pages.push(bookPage);
  }

  onProgress?.({ percent: 100, page: totalPages, totalPages, phase: 'Done' });

  return {
    pages,
    total_pages: totalPages,
    total_words: totalWords,
    extracted_at: new Date().toISOString(),
  };
}

async function ocrPage(
  page: pdfjs.PDFPageProxy,
  pageNum: number
): Promise<BookPage> {
  try {
    // Render page to canvas at 2x scale for better OCR accuracy
    const scale = 2.0;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const imageDataUrl = canvas.toDataURL('image/png');

    const { createWorker } = await import('tesseract.js');
    // workerPath and corePath are served locally (Vite ?url imports) to avoid CDN script-src CSP violations.
    // Language data (.traineddata) is fetched from cdn.jsdelivr.net — allowed by connect-src CSP — and
    // cached to IndexedDB by tesseract.js (cacheMethod: 'readWrite') so subsequent scans are offline.
    const worker = await createWorker('eng', 1, {
      workerPath: tesseractWorkerUrl,
      corePath: tesseractCoreUrl,
      cacheMethod: 'readWrite',
    });
    const result = await worker.recognize(imageDataUrl);
    await worker.terminate();

    const text = result.data.text.trim();
    const confidence = result.data.confidence / 100;
    return { page_num: pageNum, text, extraction_method: 'ocr', confidence };
  } catch {
    return { page_num: pageNum, text: '', extraction_method: 'ocr', confidence: null };
  }
}
