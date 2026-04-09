import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFPageProxy } from 'pdfjs-dist';
import { usePDF } from '../hooks/usePDF';
import { theme } from '../styles/theme';

export function PdfViewer() {
  const { pdf, numPages, isLoading, error, loadPDF } = usePDF();
  const [currentPage, setCurrentPage] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        setCurrentPage(1);
        loadPDF(file);
      }
    },
    [loadPDF],
  );

  // ResizeObserverでコンテナ幅を追跡（ドックドラッグで連打されるので rAF で1フレームにまとめる）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let raf = 0;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setContainerWidth((prev) => (prev === w ? prev : w));
      });
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // canvasレンダリング
  useEffect(() => {
    if (!pdf || !canvasRef.current || containerWidth <= 0) return;

    let cancelled = false;

    const renderPage = async () => {
      if (renderTaskRef.current) {
        try {
          await renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
        renderTaskRef.current = null;
      }

      if (cancelled) return;

      try {
        const page: PDFPageProxy = await pdf.getPage(currentPage);
        if (cancelled) {
          page.cleanup();
          return;
        }

        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext('2d');
        if (!context) return;

        // パネル幅にフィットするスケール
        const unscaledViewport = page.getViewport({ scale: 1 });
        const scale = containerWidth / unscaledViewport.width;
        const viewport = page.getViewport({ scale });

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderTask = page.render({ canvasContext: context, viewport });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
      } catch (err: any) {
        if (err.name !== 'RenderingCancelledException' && !cancelled) {
          console.error('PDF render error:', err);
        }
      } finally {
        renderTaskRef.current = null;
      }
    };

    const timer = setTimeout(() => {
      if (!cancelled) renderPage();
    }, 50);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel().catch(() => {});
      }
    };
  }, [pdf, currentPage, containerWidth]);

  const goPrev = () => setCurrentPage((p) => Math.max(1, p - 1));
  const goNext = () => setCurrentPage((p) => Math.min(numPages, p + 1));

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: theme.bgBase,
        color: theme.textPrimary,
        overflow: 'hidden',
      }}
    >
      {/* ツールバー */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 8px',
          borderBottom: `1px solid ${theme.border}`,
          flexShrink: 0,
          fontSize: 11,
        }}
      >
        <label
          style={{
            padding: '2px 6px',
            background: theme.bgInput,
            border: `1px solid ${theme.border}`,
            cursor: 'pointer',
            fontSize: 11,
          }}
        >
          ファイルを開く
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </label>

        {pdf && (
          <>
            <div style={{ width: 1, height: 16, background: theme.border, margin: '0 2px' }} />
            <button
              onClick={goPrev}
              disabled={currentPage <= 1}
              style={{
                background: 'transparent',
                border: 'none',
                color: currentPage <= 1 ? theme.textMuted : theme.textPrimary,
                cursor: currentPage <= 1 ? 'default' : 'pointer',
                fontSize: 11,
                padding: '2px 4px',
              }}
            >
              ◀
            </button>
            <span style={{ color: theme.textSecondary }}>
              {currentPage} / {numPages}
            </span>
            <button
              onClick={goNext}
              disabled={currentPage >= numPages}
              style={{
                background: 'transparent',
                border: 'none',
                color: currentPage >= numPages ? theme.textMuted : theme.textPrimary,
                cursor: currentPage >= numPages ? 'default' : 'pointer',
                fontSize: 11,
                padding: '2px 4px',
              }}
            >
              ▶
            </button>
          </>
        )}
      </div>

      {/* コンテンツ */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center' }}>
        {isLoading && (
          <div style={{ padding: 16, color: theme.textMuted }}>読み込み中...</div>
        )}
        {error && (
          <div style={{ padding: 16, color: theme.danger }}>{error}</div>
        )}
        {!pdf && !isLoading && !error && (
          <div style={{ padding: 16, color: theme.textMuted }}>
            PDFファイルを選択してください
          </div>
        )}
        {pdf && !isLoading && (
          <canvas ref={canvasRef} style={{ display: 'block' }} />
        )}
      </div>
    </div>
  );
}
