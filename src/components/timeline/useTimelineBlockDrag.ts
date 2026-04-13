import { useState, useCallback, useRef } from 'react';
import type { Scene } from '../../types/adrastea.types';

export type DragMode = 'move' | 'resize-start' | 'resize-end';

export interface DragState {
  blockId: string;
  mode: DragMode;
  startX: number;
  startY: number;
  originalStartIdx: number;
  originalEndIdx: number;
  originalRowIdx: number;
}

export interface DragPreview {
  startIdx: number;
  endIdx: number;
  rowIdx: number;
}

export function useTimelineBlockDrag(
  columnWidth: number,
  rowHeight: number,
  scenes: Scene[],
  totalTracks: number,
  onMove: (blockId: string, newStartId: string | null, newEndId: string | null, newSortOrder: number | null) => void,
): {
  dragState: DragState | null;
  getDragPreview: () => DragPreview | null;
  handleDragStart: (
    blockId: string,
    mode: DragMode,
    startX: number,
    startY: number,
    currentStartIdx: number,
    currentEndIdx: number,
    currentRowIdx: number,
  ) => void;
  handleMouseMove: (clientX: number, clientY: number) => void;
  handleMouseUp: () => void;
} {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const deltaRef = useRef({ dx: 0, dy: 0 });
  const [, forceUpdate] = useState(0);

  const handleDragStart = useCallback(
    (
      blockId: string,
      mode: DragMode,
      startX: number,
      startY: number,
      currentStartIdx: number,
      currentEndIdx: number,
      currentRowIdx: number,
    ) => {
      setDragState({
        blockId,
        mode,
        startX,
        startY,
        originalStartIdx: currentStartIdx,
        originalEndIdx: currentEndIdx,
        originalRowIdx: currentRowIdx,
      });
      deltaRef.current = { dx: 0, dy: 0 };
    },
    []
  );

  const handleMouseMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!dragState) return;
      deltaRef.current = {
        dx: clientX - dragState.startX,
        dy: clientY - dragState.startY,
      };
      forceUpdate(n => n + 1);
    },
    [dragState]
  );

  const calcPreview = useCallback((): DragPreview | null => {
    if (!dragState) return null;

    const { dx, dy } = deltaRef.current;
    const deltaCol = Math.round(dx / columnWidth);
    const deltaRow = Math.round(dy / rowHeight);

    let startIdx = dragState.originalStartIdx;
    let endIdx = dragState.originalEndIdx;
    let rowIdx = dragState.originalRowIdx;

    switch (dragState.mode) {
      case 'move': {
        const blockLen = endIdx - startIdx;
        startIdx = Math.max(0, Math.min(startIdx + deltaCol, scenes.length - 1 - blockLen));
        endIdx = startIdx + blockLen;
        rowIdx = Math.max(0, Math.min(rowIdx + deltaRow, totalTracks - 1));
        break;
      }
      case 'resize-start': {
        startIdx = Math.max(0, Math.min(startIdx + deltaCol, endIdx));
        break;
      }
      case 'resize-end': {
        endIdx = Math.min(scenes.length - 1, Math.max(endIdx + deltaCol, startIdx));
        break;
      }
    }

    return { startIdx, endIdx, rowIdx };
  }, [dragState, columnWidth, rowHeight, scenes.length, totalTracks]);

  const getDragPreview = useCallback((): DragPreview | null => {
    return calcPreview();
  }, [calcPreview]);

  const handleMouseUp = useCallback(() => {
    if (!dragState) return;

    const preview = calcPreview();
    if (!preview) {
      setDragState(null);
      return;
    }

    const newStartId = scenes[preview.startIdx]?.id ?? null;
    const newEndId = scenes[preview.endIdx]?.id ?? null;

    // 縦移動があった場合は新しい sort_order を通知（null = 変更なし）
    const newSortOrder = preview.rowIdx !== dragState.originalRowIdx ? preview.rowIdx : null;

    onMove(dragState.blockId, newStartId, newEndId, newSortOrder);

    setDragState(null);
    deltaRef.current = { dx: 0, dy: 0 };
  }, [dragState, calcPreview, scenes, onMove]);

  return {
    dragState,
    getDragPreview,
    handleDragStart,
    handleMouseMove,
    handleMouseUp,
  };
}
