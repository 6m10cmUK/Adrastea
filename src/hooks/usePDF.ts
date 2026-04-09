import { useState, useEffect, useCallback, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';

// PDF.js workerの設定
// CDNから読み込む（より確実）
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

/**
 * ローカル File を PDF.js の range 読みに載せる（ファイル全体を一度に arrayBuffer しない）
 */
class FileRangeTransport extends pdfjsLib.PDFDataRangeTransport {
  private readonly file: File;
  private aborted = false;

  constructor(length: number, file: File) {
    super(length, null, false);
    this.file = file;
  }

  override requestDataRange(begin: number, end: number): void {
    if (this.aborted || end <= begin) return;
    const slice = this.file.slice(begin, end);
    void slice.arrayBuffer().then(
      (buffer) => {
        if (this.aborted) return;
        this.onDataRange(begin, new Uint8Array(buffer));
      },
      () => {
        if (this.aborted) return;
        this.onDataRange(begin, new Uint8Array());
      }
    );
  }

  override abort(): void {
    this.aborted = true;
    super.abort();
  }
}

interface UsePDFResult {
  pdf: PDFDocumentProxy | null;
  numPages: number;
  isLoading: boolean;
  error: string | null;
  loadPDF: (file: File) => Promise<void>;
}

export const usePDF = (): UsePDFResult => {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transportRef = useRef<FileRangeTransport | null>(null);

  const loadPDF = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);
    transportRef.current?.abort();
    transportRef.current = null;

    try {
      const transport = new FileRangeTransport(file.size, file);
      transportRef.current = transport;

      const loadingTask = pdfjsLib.getDocument({
        range: transport,
        length: file.size,
        /** 先読みを抑え、必要範囲の range 読みに寄せる（ストリーミング無効が前提） */
        disableAutoFetch: true,
        disableStream: true,
      });

      const pdfDocument = await loadingTask.promise;
      setPdf(pdfDocument);
      setNumPages(pdfDocument.numPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDFの読み込みに失敗しました');
      setPdf(null);
      setNumPages(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // クリーンアップ
  useEffect(() => {
    return () => {
      transportRef.current?.abort();
      transportRef.current = null;
      if (pdf) {
        pdf.destroy();
      }
    };
  }, [pdf]);

  return {
    pdf,
    numPages,
    isLoading,
    error,
    loadPDF,
  };
};
