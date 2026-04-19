import React, { useCallback } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { theme } from '../../styles/theme';
import type { BoardObjectType } from '../../types/adrastea.types';
import type { DragMode } from './useTimelineResize';
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
  onResizeStart: (blockId: string, mode: DragMode, startX: number) => void;
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
  onResizeStart,
}) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: rowId,
    disabled: !!isDragPreview,
  });

  const left = startIdx * columnWidth;
  const width = (endIdx - startIdx + 1) * columnWidth;
  const top = rowIdx * rowHeight;

  const showGhostStyle = !!isDragPreview || isDragging;

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

  const handleEdgePointerDown = useCallback(
    (mode: DragMode) => (e: React.PointerEvent) => {
      if (isDragPreview) return;
      e.preventDefault();
      e.stopPropagation();
      onResizeStart(rowId, mode, e.clientX);
    },
    [rowId, onResizeStart, isDragPreview]
  );

  const IconComponent = objectType ? TYPE_ICONS[objectType] ?? Image : null;
  const iconBgColor = objectType === 'background' || objectType === 'foreground'
    ? theme.bgInput
    : objectType === 'characters_layer'
      ? theme.accentBgSubtle
      : 'transparent';

  // DragOverlay がプレビューを表示するので、元ブロックは transform を適用しない（ゴーストとして元の位置に残す）
  const dndTransformStyle: React.CSSProperties = {};

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...(isDragPreview ? {} : listeners)}
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
        cursor: isDragPreview ? 'default' : isDragging ? 'grabbing' : 'grab',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '0 8px',
        overflow: 'hidden',
        boxSizing: 'border-box',
        opacity: showGhostStyle ? 0.5 : 1,
        pointerEvents: isDragPreview ? 'none' : 'auto',
        zIndex: isDragPreview ? 10 : isDragging ? 20 : 1,
        touchAction: 'none',
        ...dndTransformStyle,
      }}
      onClick={handleClick}
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
          onPointerDown={handleEdgePointerDown('resize-start')}
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
          onPointerDown={handleEdgePointerDown('resize-end')}
        />
      )}
    </div>
  );
};
