import React, { useCallback } from 'react';
import { theme } from '../../styles/theme';
import type { BoardObjectType } from '../../types/adrastea.types';
import type { DragMode } from './useTimelineBlockDrag';
import {
  Image, Type, Layers, Mountain,
} from 'lucide-react';

const TYPE_ICONS: Record<string, React.FC<{ size?: number }>> = {
  panel: Image,
  text: Type,
  foreground: Mountain,
  background: Mountain,
  characters_layer: Layers,
};

export interface TimelineBlockProps {
  rowId: string;
  name: string;
  imageUrl?: string | null;
  objectType?: BoardObjectType;
  startIdx: number;
  endIdx: number;
  rowIdx: number;
  columnWidth: number;
  rowHeight: number;
  isSelected: boolean;
  isGlobal: boolean;
  rowType: 'object' | 'bgm';
  isDragPreview?: boolean;
  onSelect: (id: string, multiselect: boolean) => void;
  onDragStart: (blockId: string, mode: DragMode, startX: number, startY: number) => void;
}

export const TimelineBlock: React.FC<TimelineBlockProps> = ({
  rowId,
  name,
  imageUrl,
  objectType,
  startIdx,
  endIdx,
  rowIdx,
  columnWidth,
  rowHeight,
  isSelected,
  isGlobal,
  rowType,
  isDragPreview,
  onSelect,
  onDragStart,
}) => {
  const left = startIdx * columnWidth;
  const width = (endIdx - startIdx + 1) * columnWidth;
  const top = rowIdx * rowHeight;

  const getBackgroundColor = () => {
    if (isDragPreview) return 'rgba(100, 150, 255, 0.3)';
    if (isGlobal) {
      return rowType === 'object'
        ? 'rgba(var(--ad-accent-rgb-fallback, 200, 140, 255), 0.15)'
        : 'rgba(var(--ad-green-rgb-fallback, 100, 200, 100), 0.15)';
    }
    return rowType === 'object' ? theme.accent : theme.green;
  };

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (isDragPreview) return;
      onSelect(rowId, e.ctrlKey || e.metaKey);
    },
    [rowId, onSelect, isDragPreview]
  );

  const handleCenterMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isDragPreview) return;
      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
      const relX = e.clientX - rect.left;
      if (relX <= 6 || relX >= rect.width - 6) return;
      e.preventDefault();
      onDragStart(rowId, 'move', e.clientX, e.clientY);
    },
    [rowId, onDragStart, isDragPreview]
  );

  const handleEdgeMouseDown = useCallback(
    (mode: DragMode) => (e: React.MouseEvent) => {
      if (isDragPreview) return;
      e.preventDefault();
      e.stopPropagation();
      onDragStart(rowId, mode, e.clientX, e.clientY);
    },
    [rowId, onDragStart, isDragPreview]
  );

  const IconComponent = objectType ? TYPE_ICONS[objectType] ?? Image : null;
  const iconBgColor = objectType === 'background' || objectType === 'foreground'
    ? theme.bgInput
    : objectType === 'characters_layer'
      ? theme.accentBgSubtle
      : 'transparent';

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
        cursor: isDragPreview ? 'default' : 'grab',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '0 8px',
        overflow: 'hidden',
        boxSizing: 'border-box',
        opacity: isDragPreview ? 0.5 : 1,
        pointerEvents: isDragPreview ? 'none' : 'auto',
        zIndex: isDragPreview ? 10 : 1,
      }}
      onClick={handleClick}
      onMouseDown={handleCenterMouseDown}
    >
      {/* タイプアイコン */}
      {IconComponent && (
        <span style={{
          flexShrink: 0, width: '16px', height: '16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: '2px',
          background: iconBgColor,
        }}>
          {React.createElement(IconComponent, { size: 10 })}
        </span>
      )}

      {/* サムネイル */}
      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          style={{
            flexShrink: 0, width: '18px', height: '18px',
            objectFit: 'contain', objectPosition: 'center center',
            borderRadius: '2px', border: `1px solid ${theme.border}`,
          }}
        />
      )}

      {/* 名前 */}
      <span
        style={{
          flex: 1,
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
      </span>

      {/* 左端リサイズハンドル */}
      {!isDragPreview && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '6px',
            height: '100%',
            cursor: 'col-resize',
          }}
          onMouseDown={handleEdgeMouseDown('resize-start')}
        />
      )}

      {/* 右端リサイズハンドル */}
      {!isDragPreview && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            width: '6px',
            height: '100%',
            cursor: 'col-resize',
          }}
          onMouseDown={handleEdgeMouseDown('resize-end')}
        />
      )}
    </div>
  );
};
