import { useState, useCallback, useRef } from 'react';
import type { Scene } from '../../types/adrastea.types';

export type DragMode = 'resize-start' | 'resize-end';

export interface ResizeState {
  blockId: string;
  mode: DragMode;
  startX: number;
  originalStartIdx: number;
  originalEndIdx: number;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

export function useTimelineResize(
  columnWidth: number,
  scenes: Scene[],
  onResize: (blockId: string, newStartId: string | null, newEndId: string | null) => void,
): {
  resizeState: ResizeState | null;
  getResizePreview: () => { startIdx: number; endIdx: number } | null;
  startResize: (
    blockId: string,
    mode: DragMode,
    startX: number,
    currentStartIdx: number,
    currentEndIdx: number,
  ) => void;
  handleMouseMove: (clientX: number) => void;
  handleMouseUp: () => void;
} {
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const deltaRef = useRef(0);
  const [, forceUpdate] = useState(0);

  const startResize = useCallback(
    (
      blockId: string,
      mode: DragMode,
      startX: number,
      currentStartIdx: number,
      currentEndIdx: number,
    ) => {
      setResizeState({
        blockId,
        mode,
        startX,
        originalStartIdx: currentStartIdx,
        originalEndIdx: currentEndIdx,
      });
      deltaRef.current = 0;
    },
    [],
  );

  const handleMouseMove = useCallback(
    (clientX: number) => {
      if (!resizeState) return;
      deltaRef.current = clientX - resizeState.startX;
      forceUpdate(n => n + 1);
    },
    [resizeState],
  );

  const calcPreview = useCallback((): { startIdx: number; endIdx: number } | null => {
    if (!resizeState) return null;

    const deltaCol = Math.round(deltaRef.current / columnWidth);
    const { originalStartIdx, originalEndIdx, mode } = resizeState;

    let startIdx = originalStartIdx;
    let endIdx = originalEndIdx;

    if (mode === 'resize-start') {
      startIdx = clamp(originalStartIdx + deltaCol, 0, originalEndIdx);
    } else {
      endIdx = clamp(originalEndIdx + deltaCol, originalStartIdx, scenes.length - 1);
    }

    return { startIdx, endIdx };
  }, [resizeState, columnWidth, scenes.length]);

  const getResizePreview = useCallback((): { startIdx: number; endIdx: number } | null => {
    return calcPreview();
  }, [calcPreview]);

  const handleMouseUp = useCallback(() => {
    if (!resizeState) return;

    const preview = calcPreview();
    if (!preview) {
      setResizeState(null);
      return;
    }

    const newStartId = scenes[preview.startIdx]?.id ?? null;
    const newEndId = scenes[preview.endIdx]?.id ?? null;

    onResize(resizeState.blockId, newStartId, newEndId);

    setResizeState(null);
    deltaRef.current = 0;
  }, [resizeState, calcPreview, scenes, onResize]);

  return {
    resizeState,
    getResizePreview,
    startResize,
    handleMouseMove,
    handleMouseUp,
  };
}
