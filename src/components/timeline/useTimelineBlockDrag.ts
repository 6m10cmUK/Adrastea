import { useState, useCallback } from 'react';
import type { Scene } from '../../types/adrastea.types';

export interface DragState {
  rowId: string;
  edge: 'start' | 'end';
  startX: number;
  originalStartIdx: number;
  originalEndIdx: number;
}

/**
 * useTimelineBlockDrag
 * ブロック端ドラッグで伸縮するカスタムhook。
 *
 * ドラッグ開始 → プレビュー更新 → 確定のフロー。
 * getDragPreview で現在のドラッグ予測位置を取得可能。
 */
export function useTimelineBlockDrag(
  columnWidth: number,
  scenes: Scene[],
  onUpdateRange: (rowId: string, newStartId: string | null, newEndId: string | null) => void
): {
  dragState: DragState | null;
  handleDragStart: (
    rowId: string,
    edge: 'start' | 'end',
    startX: number,
    currentStartIdx: number,
    currentEndIdx: number
  ) => void;
  handleMouseMove: (clientX: number) => void;
  handleMouseUp: () => void;
  getDragPreview: () => { startIdx: number; endIdx: number } | null;
} {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [currentDragDelta, setCurrentDragDelta] = useState(0);

  const handleDragStart = useCallback(
    (
      rowId: string,
      edge: 'start' | 'end',
      startX: number,
      currentStartIdx: number,
      currentEndIdx: number
    ) => {
      setDragState({
        rowId,
        edge,
        startX,
        originalStartIdx: currentStartIdx,
        originalEndIdx: currentEndIdx,
      });
      setCurrentDragDelta(0);
    },
    []
  );

  const handleMouseMove = useCallback(
    (clientX: number) => {
      if (!dragState) return;

      const deltaX = clientX - dragState.startX;
      setCurrentDragDelta(deltaX);
    },
    [dragState]
  );

  const handleMouseUp = useCallback(() => {
    if (!dragState) return;

    const deltaIdx = Math.round(currentDragDelta / columnWidth);

    let newStartIdx = dragState.originalStartIdx;
    let newEndIdx = dragState.originalEndIdx;

    if (dragState.edge === 'start') {
      newStartIdx = Math.max(
        0,
        Math.min(dragState.originalStartIdx + deltaIdx, dragState.originalEndIdx)
      );
    } else {
      newEndIdx = Math.min(
        scenes.length - 1,
        Math.max(dragState.originalEndIdx + deltaIdx, dragState.originalStartIdx)
      );
    }

    // 確定: scene id を取得してコールバック
    const newStartId = scenes[newStartIdx]?.id ?? null;
    const newEndId = scenes[newEndIdx]?.id ?? null;

    onUpdateRange(dragState.rowId, newStartId, newEndId);

    setDragState(null);
    setCurrentDragDelta(0);
  }, [dragState, currentDragDelta, columnWidth, scenes, onUpdateRange]);

  const getDragPreview = useCallback((): { startIdx: number; endIdx: number } | null => {
    if (!dragState) return null;

    const deltaIdx = Math.round(currentDragDelta / columnWidth);

    let startIdx = dragState.originalStartIdx;
    let endIdx = dragState.originalEndIdx;

    if (dragState.edge === 'start') {
      startIdx = Math.max(
        0,
        Math.min(dragState.originalStartIdx + deltaIdx, dragState.originalEndIdx)
      );
    } else {
      endIdx = Math.min(
        scenes.length - 1,
        Math.max(dragState.originalEndIdx + deltaIdx, dragState.originalStartIdx)
      );
    }

    return { startIdx, endIdx };
  }, [dragState, currentDragDelta, columnWidth, scenes.length]);

  return {
    dragState,
    handleDragStart,
    handleMouseMove,
    handleMouseUp,
    getDragPreview,
  };
}
