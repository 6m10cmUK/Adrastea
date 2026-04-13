import React, { useCallback } from 'react';
import { theme } from '../../styles/theme';

export interface TimelineBlockProps {
  rowId: string;
  name: string;
  startIdx: number;      // scenes配列での開始インデックス
  endIdx: number;        // 終了インデックス（inclusive）
  rowIdx: number;
  columnWidth: number;
  rowHeight: number;
  isSelected: boolean;
  isGlobal: boolean;     // ルームオブジェクト（全シーン占有）
  rowType: 'object' | 'bgm';
  onSelect: (id: string, multiselect: boolean) => void;
  onDragStart: (rowId: string, edge: 'start' | 'end', startX: number) => void;
}

/**
 * TimelineBlock
 * タイムライン上の1つのブロック（OBJ/BGMの連続区間表示）
 */
export const TimelineBlock: React.FC<TimelineBlockProps> = ({
  rowId,
  name,
  startIdx,
  endIdx,
  rowIdx,
  columnWidth,
  rowHeight,
  isSelected,
  isGlobal,
  rowType,
  onSelect,
  onDragStart,
}) => {
  const left = startIdx * columnWidth;
  const width = (endIdx - startIdx + 1) * columnWidth;
  const top = rowIdx * rowHeight;

  // 背景色の決定
  const getBackgroundColor = () => {
    if (isGlobal) {
      // ルームオブジェクト: 薄い背景
      return rowType === 'object'
        ? 'rgba(var(--ad-accent-rgb-fallback, 200, 140, 255), 0.15)'
        : 'rgba(var(--ad-green-rgb-fallback, 100, 200, 100), 0.15)';
    }
    // 通常: 濃い背景
    return rowType === 'object'
      ? theme.accent
      : theme.green;
  };

  const handleBlockClick = useCallback(
    (e: React.MouseEvent) => {
      // ドラッグハンドルではないことを確認
      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      // 左右端 6px 以外ならクリック扱い
      if (clickX > 6 && clickX < rect.width - 6) {
        onSelect(rowId, e.ctrlKey || e.metaKey);
      }
    },
    [rowId, onSelect]
  );

  const handleMouseDown = useCallback(
    (edge: 'start' | 'end') => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onDragStart(rowId, edge, e.clientX);
    },
    [rowId, onDragStart]
  );

  return (
    <div
      style={{
        position: 'absolute',
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${rowHeight}px`,
        backgroundColor: getBackgroundColor(),
        border: isSelected
          ? `2px solid ${theme.accentHighlight}`
          : `1px solid ${theme.borderSubtle}`,
        borderRadius: '2px',
        padding: '2px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        overflow: 'hidden',
        boxSizing: 'border-box',
        transition: 'all 0.1s ease-out',
      }}
      onClick={handleBlockClick}
    >
      {/* ブロック内の名前表示 */}
      <div
        style={{
          position: 'absolute',
          left: '8px',
          right: '8px',
          top: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          fontSize: '10px',
          color: isGlobal ? theme.textMuted : theme.textOnAccent,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {name}
      </div>

      {/* 左端ドラッグハンドル */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '6px',
          height: '100%',
          cursor: 'col-resize',
          backgroundColor: 'transparent',
        }}
        onMouseDown={handleMouseDown('start')}
      />

      {/* 右端ドラッグハンドル */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          width: '6px',
          height: '100%',
          cursor: 'col-resize',
          backgroundColor: 'transparent',
        }}
        onMouseDown={handleMouseDown('end')}
      />
    </div>
  );
};
