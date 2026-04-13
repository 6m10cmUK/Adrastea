import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import {
  DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors, KeyboardSensor,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { useAdrasteaContext } from '../contexts/AdrasteaContext';
import type { BoardObject, BoardObjectType } from '../types/adrastea.types';
import { theme } from '../styles/theme';
import { resolveAssetId } from '../hooks/useAssets';
import { usePermission } from '../hooks/usePermission';
import {
  Image, Type, Layers, Mountain,
  Eye, EyeOff,
  Trash2, Copy, Plus,
} from 'lucide-react';
import { SortableListPanel, SortableListItem, DropdownMenu, Tooltip } from './ui';
import { useObjectContextMenu } from './useObjectContextMenu';
import { useLayerOperations } from '../hooks/useLayerOperations';
import { isLayerSortDebug } from '../utils/debugFlags';


const TYPE_ICON_COMPONENTS: Record<BoardObjectType, React.FC<{ size?: number }>> = {
  panel: ({ size = 14 }) => <Image size={size} />,
  text: ({ size = 14 }) => <Type size={size} />,
  foreground: ({ size = 14 }) => <Layers size={size} />,
  background: ({ size = 14 }) => <Mountain size={size} />,
  characters_layer: () => null,
};

interface ObjectLayerListProps {
  onPaste?: () => void;
  onImageAdd?: (global: boolean) => void;
  onRemoveRequest?: (msg: string, action: () => void) => void;
  characterSection?: React.ReactNode;
}

export function ObjectLayerList({
  onPaste,
  onImageAdd,
  onRemoveRequest,
  characterSection,
}: ObjectLayerListProps) {
  const {
    activeObjects,
    activeScene,
    batchUpdateSort,
    editingObjectId,
    setEditingObjectId,
    selectedObjectIds,
    setSelectedObjectIds,
    clearAllEditing,
    setEditingCharacter,
    removeObject,
    panelSelection,
  } = useAdrasteaContext();

  const { can } = usePermission();
  const canEditObject = can('object_edit');

  const {
    handleToggleVisible,
    canDuplicate,
    getDeletableIds,
    handleDuplicate,
    handleAdd,
    handleRemoveCharacter,
  } = useLayerOperations();

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [localOrderOverride, setLocalOrderOverride] = useState<Map<string, number> | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; objId?: string } | null>(null);

  // Supabase 等で objects が更新されたらローカルオーバーライドをクリア
  const activeObjectsRef = useRef(activeObjects);
  useEffect(() => {
    if (activeObjects !== activeObjectsRef.current) {
      if (isLayerSortDebug()) {
        const prev = activeObjectsRef.current;
        const brief = (arr: BoardObject[]) =>
          [...arr]
            .filter((o) => o.type !== 'background')
            .sort((a, b) => b.sort_order - a.sort_order)
            .map((o) => `${String(o.id).slice(0, 8)}:${o.type}:${o.sort_order}`)
            .join(' → ');
        console.log('[LayerSortDebug] activeObjects 参照変化 → localOrderOverride クリア', {
          prevTopDown: brief(prev),
          nextTopDown: brief(activeObjects),
        });
      }
      activeObjectsRef.current = activeObjects;
      setLocalOrderOverride(null);
    }
  }, [activeObjects]);

  // 背景を末尾に固定。それ以外はsort_order降順
  const sortedObjects = useMemo(() => {
    const bg = activeObjects.filter(o => o.type === 'background');
    const rest = activeObjects.filter(o => o.type !== 'background').map(o => {
      if (localOrderOverride?.has(o.id)) {
        return { ...o, sort_order: localOrderOverride.get(o.id)! };
      }
      return o;
    });
    return [...rest.sort((a, b) => b.sort_order - a.sort_order), ...bg];
  }, [activeObjects, localOrderOverride]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = event.active.id as string;
    const obj = sortedObjects.find(o => o.id === id);
    // foreground / characters_layer / background はドラッグ開始不可
    if (obj && (obj.type === 'foreground' || obj.type === 'characters_layer' || obj.type === 'background')) {
      return;
    }
    setActiveDragId(id);
    if (!selectedObjectIds.includes(id)) {
      setSelectedObjectIds([id]);
      setEditingObjectId(id);
    }
  }, [selectedObjectIds, setSelectedObjectIds, setEditingObjectId, sortedObjects]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const dragIds = selectedObjectIds.includes(activeId) && selectedObjectIds.length > 1
      ? selectedObjectIds
      : [activeId];
    const dragSet = new Set(dragIds);

    if (dragSet.has(overId)) return;

    // background のみ完全固定（最下、DnD不可、ドロップ先にもならない）
    // foreground / characters_layer は DnD 不可だがドロップ先にはなる（オブジェクトがその上下に入れる）
    const allMovable = sortedObjects.filter(o => o.type !== 'background');
    const draggedItems = allMovable.filter(o => dragSet.has(o.id));
    const rest = allMovable.filter(o => !dragSet.has(o.id));

    const overObj = sortedObjects.find(o => o.id === overId);
    if (overObj?.type === 'background') return;
    const overIdx = rest.findIndex(o => o.id === overId);
    if (overIdx < 0) return;

    const activeOrigIdx = allMovable.findIndex(o => o.id === activeId);
    const overOrigIdx = allMovable.findIndex(o => o.id === overId);
    const insertIdx = activeOrigIdx < overOrigIdx ? overIdx + 1 : overIdx;

    rest.splice(insertIdx, 0, ...draggedItems);

    // 連番で sort_order を振り直す
    const bg = sortedObjects.find(o => o.type === 'background');

    const updates: { id: string; sort: number }[] = [];
    const overrideMap = new Map<string, number>();

    if (isLayerSortDebug()) {
      console.log('[LayerSortDebug] dragEnd 新しい順序（降順: 先頭=前面）', {
        restTopDown: rest.map((o) => `${String(o.id).slice(0, 8)}:${o.type}`),
      });
    }

    // rest を昇順に反転（index 0 = 最背面）
    const ascending = [...rest].reverse();

    // FG < CL の制約チェック
    const fgIdx = ascending.findIndex(o => o.type === 'foreground');
    const clIdx = ascending.findIndex(o => o.type === 'characters_layer');
    if (fgIdx >= 0 && clIdx >= 0 && fgIdx > clIdx) {
      // FG が CL より上に来てしまう場合は操作を拒否
      if (isLayerSortDebug()) {
        console.log('[LayerSortDebug] dragEnd 拒否: FG < CL 制約違反', { fgIdx, clIdx });
      }
      return;
    }

    // sort_order を連番で振り直し（BG=0、rest は 1 から）
    if (bg) {
      overrideMap.set(bg.id, 0);
      if (bg.sort_order !== 0) updates.push({ id: bg.id, sort: 0 });
    }

    for (let i = 0; i < ascending.length; i++) {
      const newOrder = i + 1;  // BG が 0 なので 1 から
      overrideMap.set(ascending[i].id, newOrder);
      if (ascending[i].sort_order !== newOrder) {
        updates.push({ id: ascending[i].id, sort: newOrder });
      }
    }

    if (isLayerSortDebug()) {
      console.log('[LayerSortDebug] dragEnd batchUpdateSort 予定', {
        updates,
        updateCount: updates.length,
        overrideMap: Array.from(overrideMap.entries()).map(([id, sort]) => ({
          id: String(id).slice(0, 8),
          sort,
        })),
      });
    }

    setLocalOrderOverride(overrideMap);

    if (updates.length > 0) {
      batchUpdateSort(updates);
    }
  }, [selectedObjectIds, sortedObjects, batchUpdateSort]);

  const handleRowClick = useCallback((e: React.MouseEvent, obj: BoardObject) => {
    if (obj.type === 'characters_layer') return;
    // オブジェクト選択時はキャラクター選択をクリア
    setEditingCharacter(undefined);
    if (e.shiftKey && selectedObjectIds.length > 0) {
      const lastSelected = selectedObjectIds[selectedObjectIds.length - 1];
      const anchorIdx = sortedObjects.findIndex(o => o.id === lastSelected);
      const targetIdx = sortedObjects.findIndex(o => o.id === obj.id);
      if (anchorIdx >= 0 && targetIdx >= 0) {
        const start = Math.min(anchorIdx, targetIdx);
        const end = Math.max(anchorIdx, targetIdx);
        const rangeIds = sortedObjects.slice(start, end + 1).map(o => o.id);
        setSelectedObjectIds(rangeIds);
        setEditingObjectId(obj.id);
      }
    } else if (e.metaKey || e.ctrlKey) {
      setSelectedObjectIds(prev => {
        const exists = prev.includes(obj.id);
        return exists ? prev.filter(id => id !== obj.id) : [...prev, obj.id];
      });
      setEditingObjectId(obj.id);
    } else {
      clearAllEditing();
      setSelectedObjectIds([obj.id]);
      setEditingObjectId(obj.id);
    }
  }, [selectedObjectIds, sortedObjects, setSelectedObjectIds, setEditingObjectId, setEditingCharacter, clearAllEditing]);

  // コンテキストメニューの targets 計算
  const ctxTargets = (() => {
    if (contextMenu?.objId) {
      const ctxObj = activeObjects.find(o => o.id === contextMenu.objId);
      if (!ctxObj) return [];
      // 右クリックしたオブジェクトが選択中に含まれていれば選択中全体を対象にする
      if (selectedObjectIds.includes(contextMenu.objId) && selectedObjectIds.length > 1) {
        return activeObjects.filter(o => selectedObjectIds.includes(o.id));
      }
      return [ctxObj];
    }
    // 空白エリア右クリック: 選択中オブジェクトがあればそれを対象にする
    if (selectedObjectIds.length > 0) {
      return activeObjects.filter(o => selectedObjectIds.includes(o.id));
    }
    return [];
  })();

  // useObjectContextMenu hook
  const { items: ctxMenuItems, confirmModal: ctxConfirmModal } = useObjectContextMenu(ctxTargets, {
    onClose: () => setContextMenu(null),
    onAfterDuplicate: (newIds) => {
      setSelectedObjectIds(newIds);
      setEditingObjectId(newIds[newIds.length - 1]);
    },
    onPaste,
  });

  const selectedCharIds = panelSelection?.panel === 'character' ? panelSelection.ids : [];
  const hasCharSelection = selectedCharIds.length > 0;

  const hasDuplicateTargets = hasCharSelection
    || (selectedObjectIds.length > 0 ? selectedObjectIds.every(canDuplicate) : editingObjectId ? canDuplicate(editingObjectId) : false);

  const hasRemoveTargets = hasCharSelection
    || (selectedObjectIds.length > 0 ? selectedObjectIds.every(canDuplicate) : editingObjectId ? canDuplicate(editingObjectId) : false);

  const iconBtnStyle: React.CSSProperties = {
    border: 'none',
    color: theme.textSecondary,
    cursor: 'pointer',
    fontSize: '0.85rem',
    padding: '2px 4px',
    lineHeight: 1,
  };

  const onDuplicate = async () => {
    if (!canEditObject) return;
    await handleDuplicate();
  };

  const onRemove = () => {
    // キャラクター選択中
    if (hasCharSelection) {
      const charId = selectedCharIds[0];
      const result = handleRemoveCharacter(charId);
      if (result && onRemoveRequest) {
        onRemoveRequest(result.msg, result.action);
      }
      return;
    }
    // オブジェクト削除側に権限チェック
    if (!canEditObject) return;
    // オブジェクト選択中
    const target = selectedObjectIds.length > 0
      ? activeObjects.find(o => selectedObjectIds.includes(o.id) && o.type !== 'background' && o.type !== 'foreground' && o.type !== 'characters_layer')
      : editingObjectId
        ? activeObjects.find(o => o.id === editingObjectId && o.type !== 'background' && o.type !== 'foreground' && o.type !== 'characters_layer')
        : null;
    if (target && onRemoveRequest) {
      const ids = getDeletableIds(target.id);
      const msg = ids.length > 1 ? `${ids.length}件のオブジェクトを削除しますか？` : 'このオブジェクトを削除しますか？';
      onRemoveRequest(msg, () => {
        for (const id of ids) {
          removeObject(id);
        }
      });
    }
  };

  return (
    <div
      data-selection-panel
      style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      onContextMenu={(e) => {
        const objEl = (e.target as HTMLElement).closest('[data-obj-id]');
        const objId = objEl?.getAttribute('data-obj-id');
        if (objId) {
          e.preventDefault();
          e.stopPropagation();
          if (!selectedObjectIds.includes(objId)) {
            setSelectedObjectIds([objId]);
            setEditingObjectId(objId);
          }
          setContextMenu({ x: e.clientX, y: e.clientY, objId });
          return;
        }
        const charEl = (e.target as HTMLElement).closest('[data-char-id]');
        if (charEl) return;
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY });
      }}
    >
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
    <SortableListPanel
      title="レイヤー"
      onBackgroundClick={() => {
        setSelectedObjectIds([]);
        setEditingObjectId(undefined);
      }}
      onBackgroundContextMenu={(e) => {
        setContextMenu({ x: e.clientX, y: e.clientY });
      }}
      headerActions={
        <div style={{ display: 'flex', alignItems: 'center', gap: '1px' }}>
          <Tooltip label="複製">
            <button
              type="button"
              onClick={onDuplicate}
              disabled={!hasDuplicateTargets}
              style={{
                background: 'transparent',
                border: 'none',
                color: theme.textSecondary,
                cursor: hasDuplicateTargets ? 'pointer' : 'default',
                padding: '2px 4px',
                display: canEditObject ? 'flex' : 'none',
                alignItems: 'center',
                opacity: hasDuplicateTargets ? 1 : 0.3,
              }}
            >
              <Copy size={15} />
            </button>
          </Tooltip>
          <Tooltip label="削除">
            <button
              type="button"
              onClick={onRemove}
              disabled={!hasRemoveTargets}
              style={{
                background: 'transparent',
                border: 'none',
                color: theme.danger,
                cursor: hasRemoveTargets ? 'pointer' : 'default',
                padding: '2px 4px',
                display: canEditObject ? 'flex' : 'none',
                alignItems: 'center',
                opacity: hasRemoveTargets ? 1 : 0.3,
              }}
            >
              <Trash2 size={15} />
            </button>
          </Tooltip>
          {canEditObject && (
            <DropdownMenu
              trigger={
                <Tooltip label="追加">
                  <button
                    type="button"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: theme.accent,
                      cursor: 'pointer',
                      padding: '2px 4px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    aria-label="オブジェクト追加"
                  >
                    <Plus size={15} />
                  </button>
                </Tooltip>
              }
              items={[
                { icon: <Image size={15} />, label: 'シーン画像追加', onClick: () => onImageAdd?.(false) },
                { icon: <Type size={15} />, label: 'シーンテキスト追加', onClick: () => handleAdd(false, 'text') },
                'separator',
                { icon: <Image size={15} />, label: 'ルーム画像追加', onClick: () => onImageAdd?.(true) },
                { icon: <Type size={15} />, label: 'ルームテキスト追加', onClick: () => handleAdd(true, 'text') },
              ]}
            />
          )}
        </div>
      }
      items={sortedObjects}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      emptyMessage="オブジェクトがありません"
    >
      <SortableContext items={sortedObjects.filter(o => o.type !== 'background').map(o => o.id)} strategy={verticalListSortingStrategy}>
      {sortedObjects.map((obj) => {
        const isSelected = obj.type !== 'characters_layer' && selectedObjectIds.includes(obj.id);
        const isDragGroupMember = activeDragId != null
          && selectedObjectIds.includes(activeDragId)
          && isSelected
          && obj.id !== activeDragId;
        const iconBgColor = obj.is_global ? 'rgba(166,227,161,0.2)' : theme.accentHighlight;

        // characters_layer の位置にキャラクターセクションを描画（DnDドロップターゲットとして機能させる）
        if (obj.type === 'characters_layer') {
          return (
            <SortableListItem
              key={obj.id}
              id={obj.id}
              disabled
              isSelected={false}
              itemStyle={{ padding: 0 }}
            >
              <div style={{ width: '100%' }}>
                {characterSection}
              </div>
            </SortableListItem>
          );
        }

        return (
          <SortableListItem
            key={obj.id}
            id={obj.id}
            dataAttributes={{ 'data-obj-id': obj.id }}
            disabled={obj.type === 'background' || obj.type === 'foreground'}
            isSelected={isSelected}
            isGroupDrag={isDragGroupMember}
            onClick={(e) => handleRowClick(e, obj)}
            itemStyle={
              (obj.type === 'background' || obj.type === 'foreground')
                ? { background: theme.bgInput }
                : undefined
            }
          >
            <span style={{
              flexShrink: 0, width: '20px', height: '20px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '2px',
              background: iconBgColor,
            }}>
              {React.createElement(TYPE_ICON_COMPONENTS[obj.type], { size: 12 })}
            </span>
            {(() => {
              // bg/fg は activeScene から画像を参照
              const assetId = obj.type === 'background' ? activeScene?.background_asset_id
                : obj.type === 'foreground' ? activeScene?.foreground_asset_id
                : obj.image_asset_id;
              const imgUrl = assetId ? resolveAssetId(assetId) : null;
              // bg/fg の色設定も activeScene から取得
              const colorEnabled = obj.type === 'background' ? activeScene?.bg_color_enabled
                : obj.type === 'foreground' ? activeScene?.fg_color_enabled
                : obj.color_enabled;
              const bgColor = obj.type === 'background' ? activeScene?.bg_color
                : obj.type === 'foreground' ? activeScene?.fg_color
                : obj.background_color;
              if (colorEnabled) {
                return (
                  <div style={{
                    flexShrink: 0, width: '20px', height: '20px',
                    borderRadius: '2px', border: `1px solid ${theme.border}`,
                    background: bgColor,
                  }} />
                );
              }
              if (imgUrl) {
                return (
                  <img
                    src={imgUrl}
                    alt=""
                    style={{
                      flexShrink: 0, width: '20px', height: '20px',
                      objectFit: 'contain', objectPosition: 'center center',
                      borderRadius: '2px', border: `1px solid ${theme.border}`,
                    }}
                  />
                );
              }
              return null;
            })()}
            {renamingId === obj.id ? (
              <input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => {
                  setRenamingId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setRenamingId(null);
                  }
                  if (e.key === 'Escape') setRenamingId(null);
                }}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                maxLength={128}
                style={{
                  flex: 1, minWidth: 0,
                  background: theme.bgDeep, border: `1px solid ${theme.border}`,
                  color: theme.textPrimary, fontSize: '12px', padding: '1px 4px',
                  outline: 'none',
                }}
              />
            ) : (
              <span
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  opacity: obj.visible ? 1 : 0.4,
                }}
                onDoubleClick={(e) => {
                  if (obj.type === 'background' || obj.type === 'foreground') return;
                  e.stopPropagation();
                  setRenamingId(obj.id);
                  setRenameValue(obj.name);
                }}
              >
                {obj.name}
              </span>
            )}
            {obj.type !== 'background' && (
              <Tooltip label={obj.visible ? '非表示にする' : '表示する'}>
                <button
                  type="button"
                  className="adra-btn adra-btn--ghost adra-btn--ghost-on-bg"
                  style={{ ...iconBtnStyle, opacity: obj.visible ? 1 : 0.4, display: 'flex', alignItems: 'center' }}
                  onClick={(e) => { e.stopPropagation(); handleToggleVisible(obj); }}
                >
                  {obj.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                </button>
              </Tooltip>
            )}
          </SortableListItem>
        );
      })}
      <DragOverlay dropAnimation={null}>
        <div style={{ visibility: 'hidden', position: 'fixed', pointerEvents: 'none' }} />
      </DragOverlay>
      </SortableContext>
    </SortableListPanel>

    <DropdownMenu
      mode="context"
      open={contextMenu !== null}
      onOpenChange={(open) => { if (!open) setContextMenu(null); }}
      position={contextMenu ?? { x: 0, y: 0 }}
      items={(() => {
        // 右クリック対象 or 単一選択中のオブジェクト
        const renameTargetId = contextMenu?.objId
          ?? (selectedObjectIds.length === 1 ? selectedObjectIds[0] : undefined);
        const renameTarget = renameTargetId ? activeObjects.find(o => o.id === renameTargetId) : undefined;
        const canRename = renameTarget && renameTarget.type !== 'background' && renameTarget.type !== 'foreground' && renameTarget.type !== 'characters_layer';
        return [
          {
            label: '新規作成',
            disabled: !canEditObject,
            onClick: () => {},
            children: [
              { label: 'シーン画像', onClick: () => { onImageAdd?.(false); setContextMenu(null); } },
              { label: 'シーンテキスト', onClick: () => { handleAdd(false, 'text'); setContextMenu(null); } },
              'separator',
              { label: 'ルーム画像', onClick: () => { onImageAdd?.(true); setContextMenu(null); } },
              { label: 'ルームテキスト', onClick: () => { handleAdd(true, 'text'); setContextMenu(null); } },
            ],
          },
          'separator',
          {
            label: '名前を変更',
            disabled: !canRename,
            onClick: () => {
              if (renameTarget && canRename) {
                setRenamingId(renameTarget.id);
                setRenameValue(renameTarget.name);
              }
              setContextMenu(null);
            },
          },
          ...ctxMenuItems,
        ];
      })()}
    />

    {ctxConfirmModal}
    </DndContext>
    </div>
  );
}
