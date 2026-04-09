import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors, KeyboardSensor,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { useAdrasteaContext } from '../contexts/AdrasteaContext';
import type { Character } from '../types/adrastea.types';
import { theme } from '../styles/theme';
import { resolveAssetId } from '../hooks/useAssets';
import { Users, ChevronRight, ChevronDown, Eye, EyeOff } from 'lucide-react';
import { SortableListItem, Tooltip } from './ui';
import { useCharacterContextMenu } from './useCharacterContextMenu';
import { useLayerOperations } from '../hooks/useLayerOperations';
import { generateDuplicateName } from '../utils/nameUtils';

interface CharacterLayerSectionProps {
  characters: Character[];
  selectedCharIds: string[];
  onSelectCharacter?: (charId: string, e: React.MouseEvent) => void;
  onCharacterContextMenu?: (charId: string, x: number, y: number) => void;
  onContextMenuClose?: () => void;
  onDoubleClickCharacter?: (charId: string) => void;
}

export function CharacterLayerSection({
  characters,
  selectedCharIds,
  onSelectCharacter,
  onCharacterContextMenu,
  onContextMenuClose,
  onDoubleClickCharacter,
}: CharacterLayerSectionProps) {
  const {
    layerOrderedCharacters,
    reorderLayerCharacters,
    clearAllEditing,
    setEditingCharacter,
    removeCharacter,
    setPanelSelection,
    addCharacter,
  } = useAdrasteaContext();

  const {
    handleToggleCharVisible,
  } = useLayerOperations();

  const [isCharLayerOpen, setIsCharLayerOpen] = useState(() => {
    try { return localStorage.getItem('adrastea-char-layer-open') !== 'false'; } catch { return true; }
  });
  const setIsCharLayerOpenPersist = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    setIsCharLayerOpen((prev) => {
      const next = typeof v === 'function' ? v(prev) : v;
      try { localStorage.setItem('adrastea-char-layer-open', String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);
  const [localChars, setLocalChars] = useState<Character[]>(characters);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [grabOffset, setGrabOffset] = useState<{ x: number; y: number }>({ x: 16, y: 14 });
  const [draggedHtml, setDraggedHtml] = useState<string>('');
  const containerRef = useRef<HTMLDivElement>(null);

  // 外部から characters が変わった時に同期（新規追加・削除等）
  const prevCharsRef = useRef(characters);
  useEffect(() => {
    if (prevCharsRef.current !== characters) {
      prevCharsRef.current = characters;
      setLocalChars(characters);
    }
  }, [characters]);

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = localChars.findIndex(c => c.id === active.id);
    const newIndex = localChars.findIndex(c => c.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const newOrder = arrayMove(localChars, oldIndex, newIndex);
    setLocalChars(newOrder);
    void reorderLayerCharacters(newOrder.map(c => c.id));
  }, [localChars, reorderLayerCharacters]);

  const iconBtnStyle: React.CSSProperties = {
    border: 'none',
    color: theme.textSecondary,
    cursor: 'pointer',
    fontSize: '0.85rem',
    padding: '2px 4px',
    lineHeight: 1,
  };

  // キャラクター選択ハンドラ
  const handleCharacterSelect = useCallback((charId: string, e: React.MouseEvent) => {
    const char = layerOrderedCharacters.find(c => c.id === charId);
    if (!char) return;

    if (e.shiftKey && selectedCharIds.length > 0) {
      // Shift: 範囲選択
      const lastSelected = selectedCharIds[selectedCharIds.length - 1];
      const anchorIdx = layerOrderedCharacters.findIndex(c => c.id === lastSelected);
      const targetIdx = layerOrderedCharacters.findIndex(c => c.id === charId);
      if (anchorIdx >= 0 && targetIdx >= 0) {
        const start = Math.min(anchorIdx, targetIdx);
        const end = Math.max(anchorIdx, targetIdx);
        const ids = layerOrderedCharacters.slice(start, end + 1).map(c => c.id);
        setPanelSelection({ panel: 'character', ids });
      }
    } else if (e.metaKey || e.ctrlKey) {
      // Ctrl/Cmd: トグル
      const newIds = selectedCharIds.includes(charId)
        ? selectedCharIds.filter(id => id !== charId)
        : [...selectedCharIds, charId];
      setPanelSelection(newIds.length > 0 ? { panel: 'character', ids: newIds } : null);
    } else {
      // 通常クリック: 単一選択
      clearAllEditing();
      setEditingCharacter(char);
      setPanelSelection({ panel: 'character', ids: [charId] });
    }
    onSelectCharacter?.(charId, e);
  }, [layerOrderedCharacters, selectedCharIds, clearAllEditing, setEditingCharacter, setPanelSelection, onSelectCharacter]);

  // キャラクター用コンテキストメニュー
  const selectedChar = selectedCharIds.length === 1
    ? layerOrderedCharacters.find(c => c.id === selectedCharIds[0]) ?? null
    : null;
  const { confirmModal: charCtxConfirmModal } = useCharacterContextMenu(selectedChar, {
    currentUserId: '',
    onClose: onContextMenuClose ?? (() => {}),
    onDuplicate: async (c) => {
      const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = c as any;
      await addCharacter({ ...rest, name: generateDuplicateName(c.name, characters.map(ch => ch.name)) });
    },
    onRemove: (charId) => {
      removeCharacter(charId);
      setEditingCharacter(undefined);
    },
  });

  return (
    <>
    <div ref={containerRef}>
      {/* ヘッダー行 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 8px',
          paddingLeft: '20px',
          fontSize: '12px',
          color: theme.textPrimary,
          borderBottom: `1px solid ${theme.border}`,
          cursor: 'pointer',
          background: theme.bgDeep,
        }}
        onClick={() => setIsCharLayerOpenPersist(v => !v)}
      >
        <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', color: theme.textMuted }}>
          {isCharLayerOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        <span style={{
          flexShrink: 0, width: '20px', height: '20px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: '2px',
          background: 'rgba(166,227,161,0.2)',
        }}>
          <Users size={12} />
        </span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          キャラクター
        </span>
      </div>

      {/* キャラサブリスト */}
      {isCharLayerOpen && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(event) => {
            const id = String(event.active.id);
            setActiveId(id);
            const target = (event.activatorEvent as Event)?.target as HTMLElement | null;
            const sortableEl = target?.closest?.('[aria-roledescription="sortable"]') as HTMLElement | null;
            if (sortableEl) {
              setDraggedHtml(sortableEl.outerHTML);
            }
            // dnd-kit の rect.initial はネスト DnD 等でビューポート座標とずれることがある。
            // clientX/Y と整合する getBoundingClientRect() で掴みオフセットを取る（SortableListPanel と同じ）。
            const activatorEvent = event.activatorEvent as PointerEvent | null;
            const elRect = sortableEl?.getBoundingClientRect();
            if (activatorEvent && elRect) {
              setGrabOffset({
                x: activatorEvent.clientX - elRect.left,
                y: activatorEvent.clientY - elRect.top,
              });
              setCursorPos({ x: activatorEvent.clientX, y: activatorEvent.clientY });
            } else if (activatorEvent) {
              setGrabOffset({ x: 16, y: 14 });
              setCursorPos({ x: activatorEvent.clientX, y: activatorEvent.clientY });
            }
          }}
          onDragEnd={(event) => {
            setActiveId(null);
            setDraggedHtml('');
            handleDragEnd(event);
          }}
        >
          <SortableContext items={localChars.map(c => c.id)} strategy={verticalListSortingStrategy}>
          {localChars.map((char) => (
            <div key={char.id} data-char-id={char.id} style={{ display: 'contents' }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onCharacterContextMenu?.(char.id, e.clientX, e.clientY);
              }}
            >
            <SortableListItem
              id={char.id}
              isSelected={selectedCharIds.includes(char.id)}
              onClick={(e: React.MouseEvent) => handleCharacterSelect(char.id, e)}
            >
              {/* インデント */}
              <span style={{ flexShrink: 0, width: '20px' }} />
              {/* アバター + 名前 */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {/* アバター（画像 or カラードット） */}
                <div style={{
                  flexShrink: 0,
                  width: '18px', height: '18px',
                  borderRadius: '50%',
                  background: char.color ?? theme.textMuted,
                  overflow: 'hidden',
                }}>
                  {char.images[char.active_image_index]?.asset_id && resolveAssetId(char.images[char.active_image_index].asset_id) ? (
                    <img
                      src={resolveAssetId(char.images[char.active_image_index].asset_id) ?? undefined}
                      alt={char.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', display: 'block' }}
                    />
                  ) : null}
                </div>
                {/* 名前 */}
                <span style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  opacity: char.board_visible !== false ? 1 : 0.4,
                }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    onDoubleClickCharacter?.(char.id);
                  }}
                >
                  {char.name}
                </span>
              </div>
              {/* 目アイコン */}
              <Tooltip label={char.board_visible !== false ? '非表示にする' : '表示する'}>
                <button
                  type="button"
                  className="adra-btn adra-btn--ghost adra-btn--ghost-on-bg"
                  style={{
                    ...iconBtnStyle,
                    opacity: char.board_visible !== false ? 1 : 0.4,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  onClick={(e) => { e.stopPropagation(); handleToggleCharVisible(char.id); }}
                >
                  {char.board_visible !== false ? <Eye size={12} /> : <EyeOff size={12} />}
                </button>
              </Tooltip>
            </SortableListItem>
            </div>
          ))}
          <DragOverlay dropAnimation={null}>
            <div style={{ visibility: 'hidden', position: 'fixed', pointerEvents: 'none' }} />
          </DragOverlay>
          </SortableContext>
          {activeId && cursorPos && draggedHtml && createPortal(
            <div style={{
              position: 'fixed',
              top: cursorPos.y - grabOffset.y,
              left: cursorPos.x - grabOffset.x,
              width: containerRef.current?.closest?.('[style*="overflow"]')?.clientWidth ?? containerRef.current?.offsetWidth ?? 240,
              zIndex: 9999,
              pointerEvents: 'none',
              opacity: 0.85,
            }}>
              <div dangerouslySetInnerHTML={{ __html: draggedHtml }} />
            </div>,
            document.body
          )}
        </DndContext>
      )}
    </div>
    {charCtxConfirmModal}
    </>
  );
}
