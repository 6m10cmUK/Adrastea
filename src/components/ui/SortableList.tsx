import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { theme } from '../../styles/theme';

// --- SortableListPanel ---
interface SortableListPanelProps {
  title: string;
  subtitle?: string;
  titleIcon?: React.ReactNode;
  headerActions?: React.ReactNode;
  footerActions?: React.ReactNode;
  items: { id: string }[];
  onDragEnd?: (event: DragEndEvent) => void;
  onDragStart?: (event: DragStartEvent) => void;
  onBackgroundClick?: () => void;
  onBackgroundContextMenu?: (e: React.MouseEvent) => void;
  emptyMessage?: string;
  layout?: 'list' | 'grid';
  children: React.ReactNode;
}

export function SortableListPanel({
  title,
  subtitle,
  titleIcon,
  headerActions,
  footerActions,
  items,
  onDragEnd,
  onDragStart,
  onBackgroundClick,
  onBackgroundContextMenu,
  emptyMessage,
  layout = 'list',
  children,
}: SortableListPanelProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [grabOffset, setGrabOffset] = useState<{ x: number; y: number }>({ x: 16, y: 14 });
  const [draggedHtml, setDraggedHtml] = useState<string>('');
  const containerRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const hasItems = items.length > 0;

  // ポインター追跡
  useEffect(() => {
    if (!activeId) {
      setCursorPos(null);
      return;
    }
    const handleMove = (e: PointerEvent) => {
      setCursorPos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('pointermove', handleMove, { passive: true });
    return () => window.removeEventListener('pointermove', handleMove);
  }, [activeId]);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: theme.bgBase,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      color: theme.textPrimary,
    }}>
      {/* Header */}
      <div style={{
        padding: '6px 8px',
        borderBottom: `1px solid ${theme.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{
          color: theme.textPrimary,
          fontWeight: 600,
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          minWidth: 0,
          flexShrink: 1,
        }}>
          {titleIcon}
          {title}
          {subtitle && <span style={{ fontWeight: 400, color: theme.textMuted, fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</span>}
        </span>
        {headerActions && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
            {headerActions}
          </div>
        )}
      </div>

      {/* List */}
      <div
        ref={containerRef}
        style={layout === 'grid' ? {
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gridAutoRows: 'min-content',
          gap: '4px',
          padding: '4px 8px',
          alignContent: 'start',
          overflowY: 'auto',
        } : {
          flex: 1,
          overflowY: 'auto',
        }}
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest?.('[data-sortable-item]') && onBackgroundClick) {
            onBackgroundClick();
          }
        }}
        onContextMenu={(e) => {
          if (!(e.target as HTMLElement).closest?.('[data-sortable-item]') && onBackgroundContextMenu) {
            e.preventDefault();
            onBackgroundContextMenu(e);
          }
        }}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(event) => {
            const id = String(event.active.id);
            setActiveId(id);
            // DOM クローンをキャプチャ（activatorEvent.target から sortable 要素を探す）
            const target = (event.activatorEvent as Event)?.target as HTMLElement | null;
            const sortableEl = target?.closest?.('[aria-roledescription="sortable"]') as HTMLElement | null;
            if (sortableEl) {
              setDraggedHtml(sortableEl.outerHTML);
            }
            // 掴んだ位置を計算（DOM の実際の rect を使用）
            const activatorEvent = event.activatorEvent as PointerEvent | null;
            const elRect = sortableEl?.getBoundingClientRect();
            if (activatorEvent && elRect) {
              setGrabOffset({
                x: activatorEvent.clientX - elRect.left,
                y: activatorEvent.clientY - elRect.top,
              });
              setCursorPos({ x: activatorEvent.clientX, y: activatorEvent.clientY });
            } else {
              setGrabOffset({ x: 16, y: 14 });
            }
            onDragStart?.(event);
          }}
          onDragEnd={(event) => {
            setActiveId(null);
            setDraggedHtml('');
            onDragEnd?.(event);
          }}
        >
          <SortableContext items={items.map(i => i.id)} strategy={layout === 'grid' ? rectSortingStrategy : verticalListSortingStrategy}>
            {children}
          </SortableContext>
          <DragOverlay dropAnimation={null}>
            <div style={{ visibility: 'hidden', position: 'fixed', pointerEvents: 'none' }} />
          </DragOverlay>
        </DndContext>
        {!hasItems && emptyMessage && (
          <div style={{
            padding: '24px',
            textAlign: 'center',
            color: theme.textMuted,
            fontSize: '12px',
          }}>
            {emptyMessage}
          </div>
        )}
      </div>

      {/* Portal overlay for cursor tracking */}
      {activeId && cursorPos && draggedHtml && createPortal(
        <div style={{
          position: 'fixed',
          top: cursorPos.y - grabOffset.y,
          left: cursorPos.x - grabOffset.x,
          width: layout === 'grid' ? 220 : (containerRef.current?.offsetWidth ?? 240),
          zIndex: 9999,
          pointerEvents: 'none',
          opacity: 0.85,
        }}>
          <div dangerouslySetInnerHTML={{ __html: draggedHtml }} />
        </div>,
        document.body
      )}

      {/* Footer */}
      {footerActions && (
        <div style={{
          padding: '8px 12px',
          borderTop: `1px solid ${theme.border}`,
          flexShrink: 0,
        }}>
          {footerActions}
        </div>
      )}
    </div>
  );
}

// --- SortableListItem ---
interface SortableListItemProps {
  id: string;
  disabled?: boolean;
  isSelected?: boolean;
  isActive?: boolean;
  isGroupDrag?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  leadingSlot?: React.ReactNode;
  children: React.ReactNode;
  itemStyle?: React.CSSProperties;
  layout?: 'list' | 'grid';
  dataAttributes?: Record<string, string>;
}

export function SortableListItem({
  id,
  disabled,
  isSelected,
  isActive,
  isGroupDrag,
  onClick,
  onDoubleClick,
  leadingSlot,
  children,
  itemStyle,
  layout = 'list',
  dataAttributes,
}: SortableListItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  // attributes から aria-disabled を除外（DnD disabled ≠ インタラクション disabled）
  const { 'aria-disabled': _ariaDisabled, ...safeAttributes } = attributes;

  const style: React.CSSProperties = layout === 'grid' ? {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 8px',
    fontSize: '12px',
    color: theme.textPrimary,
    background: isSelected ? theme.accentBgSubtle : theme.bgElevated,
    border: `1px solid ${theme.border}`,
    borderRadius: '3px',
    overflow: 'hidden',
    minWidth: 0,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : isGroupDrag ? 0.4 : 1,
    boxShadow: isDragging ? theme.shadowSm : undefined,
    zIndex: isDragging ? 10 : undefined,
    position: 'relative',
    touchAction: 'none',
    ...itemStyle,
    // isSelected は itemStyle より優先
    ...(isSelected ? { background: theme.accentBgSubtle } : {}),
  } : {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 8px',
    fontSize: '12px',
    color: theme.textPrimary,
    borderBottom: `1px solid ${theme.border}`,
    borderLeft: isActive ? `5px solid ${theme.accent}` : '5px solid transparent',
    background: isSelected ? theme.accentBgSubtle : 'transparent',
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : isGroupDrag ? 0.4 : 1,
    boxShadow: isDragging ? theme.shadowSm : undefined,
    zIndex: isDragging ? 10 : undefined,
    position: 'relative',
    touchAction: 'none',
    ...itemStyle,
    // isSelected は itemStyle より優先
    ...(isSelected ? { background: theme.accentBgSubtle } : {}),
  };

  return (
    <div
      data-sortable-item
      ref={setNodeRef}
      style={{ ...style, cursor: disabled ? 'default' : 'grab' }}
      {...safeAttributes}
      {...(!disabled ? listeners : {})}
      {...dataAttributes}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {leadingSlot}
      {children}
    </div>
  );
}
