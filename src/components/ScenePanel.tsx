
import { useState, useCallback } from 'react';
import type { DragEndEvent } from '@dnd-kit/core';
import { theme } from '../styles/theme';
import type { Scene, BgmTrack } from '../types/adrastea.types';
import { Plus, Copy, Trash2 } from 'lucide-react';
import { SortableListPanel, SortableListItem, ConfirmModal, DropdownMenu, Tooltip } from './ui';
import { shortcutLabel } from './ui/DropdownMenu';
import { resolveAssetId } from '../hooks/useAssets';

interface ScenePanelProps {
  scenes: Scene[];
  activeSceneId: string | null;
  selectedSceneIds: string[];
  onSelectedSceneIdsChange: (ids: string[]) => void;
  onActivateScene: (sceneId: string | null) => void;
  onAddScene: (count: number) => void;
  onDuplicateScenes?: (sceneIds: string[]) => void;
  onUpdateSceneName: (sceneId: string, name: string) => void;
  onRemoveScenes: (sceneIds: string[]) => void;
  onReorderScenes?: (orderedIds: string[]) => void;
  onCopy?: (sceneIds: string | string[]) => void;
  onPaste?: () => void;
  bgms?: BgmTrack[];
}

export function ScenePanel({
  scenes,
  activeSceneId,
  selectedSceneIds,
  onSelectedSceneIdsChange,
  onActivateScene,
  onAddScene,
  onDuplicateScenes,
  onUpdateSceneName,
  onRemoveScenes,
  onReorderScenes,
  onCopy,
  onPaste,
  bgms,
}: ScenePanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameValue, setNameValue] = useState('');
  const [pendingRemove, setPendingRemove] = useState<{ ids: string[]; msg: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sceneId?: string } | null>(null);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorderScenes) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // 複数選択中なら選択アイテム全部、そうでなければドラッグしたもの1つ
    const dragIds = selectedSceneIds.includes(activeId) && selectedSceneIds.length > 1
      ? selectedSceneIds
      : [activeId];
    const dragSet = new Set(dragIds);
    if (dragSet.has(overId)) return;

    // ドラッグ対象を除外した残りリスト
    const rest = scenes.filter(item => !dragSet.has(item.id));
    const draggedItems = scenes.filter(item => dragSet.has(item.id));

    // 挿入位置を計算
    const activeOrigIdx = scenes.findIndex(item => item.id === activeId);
    const overOrigIdx = scenes.findIndex(item => item.id === overId);
    const overIdx = rest.findIndex(item => item.id === overId);
    if (overIdx < 0) return;
    const insertIdx = activeOrigIdx < overOrigIdx ? overIdx + 1 : overIdx;

    rest.splice(insertIdx, 0, ...draggedItems);
    onReorderScenes(rest.map(item => item.id));
  }, [scenes, selectedSceneIds, onReorderScenes]);

  const startEdit = (scene: Scene) => {
    setEditingId(scene.id);
    setNameValue(scene.name);
  };

  const commitEdit = () => {
    if (editingId && nameValue.trim()) {
      onUpdateSceneName(editingId, nameValue.trim());
    }
    setEditingId(null);
  };

  const handleRowClick = useCallback((e: React.MouseEvent, scene: Scene) => {
    if (e.shiftKey && selectedSceneIds.length > 0) {
      const lastSelected = selectedSceneIds[selectedSceneIds.length - 1];
      const anchorIdx = scenes.findIndex(s => s.id === lastSelected);
      const targetIdx = scenes.findIndex(s => s.id === scene.id);
      if (anchorIdx >= 0 && targetIdx >= 0) {
        const start = Math.min(anchorIdx, targetIdx);
        const end = Math.max(anchorIdx, targetIdx);
        onSelectedSceneIdsChange(scenes.slice(start, end + 1).map(s => s.id));
      }
    } else if (e.metaKey || e.ctrlKey) {
      onSelectedSceneIdsChange(
        selectedSceneIds.includes(scene.id)
          ? selectedSceneIds.filter(id => id !== scene.id)
          : [...selectedSceneIds, scene.id]
      );
    } else {
      onSelectedSceneIdsChange([scene.id]);
      onActivateScene(scene.id);
    }
  }, [scenes, selectedSceneIds, onSelectedSceneIdsChange, onActivateScene]);

  const canDuplicate = onDuplicateScenes && selectedSceneIds.length > 0;
  const canDelete = selectedSceneIds.length > 0 && selectedSceneIds.length < scenes.length;

  return (
    <>
    <div
      data-selection-panel
      onContextMenu={(e) => {
        e.preventDefault();
        const sceneEl = (e.target as HTMLElement).closest('[data-scene-id]');
        const sceneId = sceneEl?.getAttribute('data-scene-id') ?? undefined;
        if (sceneId && !selectedSceneIds.includes(sceneId)) {
          onSelectedSceneIdsChange([sceneId]);
        }
        setContextMenu({ x: e.clientX, y: e.clientY, sceneId });
      }}
      style={{ height: '100%' }}
    >
    <SortableListPanel
      title="シーン"
      onBackgroundClick={() => onSelectedSceneIdsChange([])}
      headerActions={
        <div style={{ display: 'flex', alignItems: 'center', gap: '1px' }}>
          {onDuplicateScenes && (
            <Tooltip label="選択中のシーンを複製">
              <button
                onClick={() => onDuplicateScenes(selectedSceneIds)}
                disabled={!canDuplicate}
                aria-label="シーンを複製"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: theme.textSecondary,
                  cursor: canDuplicate ? 'pointer' : 'default',
                  padding: '2px 4px',
                  display: 'flex',
                  alignItems: 'center',
                  opacity: canDuplicate ? 1 : 0.3,
                }}
              >
                <Copy size={15} />
              </button>
            </Tooltip>
          )}
          <Tooltip label="選択中のシーンを削除">
            <button
              onClick={() => {
                if (canDelete) {
                  const msg = selectedSceneIds.length > 1
                    ? `${selectedSceneIds.length}件のシーンを削除しますか？`
                    : 'このシーンを削除しますか？';
                  setPendingRemove({ ids: selectedSceneIds, msg });
                }
              }}
              disabled={!canDelete}
              aria-label="シーンを削除"
              style={{
                background: 'transparent',
                border: 'none',
                color: theme.danger,
                cursor: canDelete ? 'pointer' : 'default',
                padding: '2px 4px',
                display: 'flex',
                alignItems: 'center',
                opacity: canDelete ? 1 : 0.3,
              }}
            >
              <Trash2 size={15} />
            </button>
          </Tooltip>
          <Tooltip label={selectedSceneIds.length > 1 ? `シーンを${selectedSceneIds.length}件追加` : 'シーンを追加'}>
            <button
              onClick={() => onAddScene(Math.max(1, selectedSceneIds.length))}
              aria-label="シーンを追加"
              style={{
                background: 'transparent',
                border: 'none',
                color: theme.accent,
                cursor: 'pointer',
                padding: '2px 4px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Plus size={15} />
            </button>
          </Tooltip>
        </div>
      }
      items={scenes}
      onDragEnd={handleDragEnd}
      emptyMessage="シーンがありません"
    >
      {scenes.map((scene) => {
        const isSelected = selectedSceneIds.includes(scene.id);
        const sceneBgms = (bgms ?? []).filter(b => {
          if (b.is_global) return true;
          if (!b.scene_start_id || !b.scene_end_id) return false;
          const startPos = scenes.find(s => s.id === b.scene_start_id)?.position;
          const endPos = scenes.find(s => s.id === b.scene_end_id)?.position;
          if (startPos === undefined || endPos === undefined) return false;
          return startPos <= scene.position && scene.position <= endPos;
        });
        const bgmNames = sceneBgms.map(b => b.name);
        const bgmLabel = bgmNames.length === 0
          ? 'なし'
          : bgmNames.length <= 3
            ? bgmNames.join(', ')
            : `${bgmNames.slice(0, 3).join(', ')}...`;
        const tooltip = [
          `背景ぼかし: ${scene.bg_blur ? 'あり' : 'なし'}`,
          `背景フェードイン: ${scene.bg_transition === 'fade' ? `${scene.bg_transition_duration}ms` : 'なし'}`,
          `前景フェードイン: ${scene.fg_transition === 'fade' ? `${scene.fg_transition_duration}ms` : 'なし'}`,
          `BGM: ${bgmLabel}`,
        ].join('\n');
        return (
        <Tooltip key={scene.id} label={tooltip}>
          <div data-scene-id={scene.id} style={{ display: 'contents' }}>
          <SortableListItem
          id={scene.id}
          isActive={activeSceneId === scene.id}
          isSelected={isSelected}
          onClick={(e) => handleRowClick(e, scene)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '0px' }}>
            {/* サムネイル: 斜め分割（左2/3 前景、右1/3 背景） */}
            {(() => {
              const bgSolidColor = scene.bg_color_enabled ? (scene.bg_color || null) : null;
              const fgSolidColor = scene.fg_color_enabled ? (scene.fg_color || null) : null;
              const bgBackground = bgSolidColor
                ? bgSolidColor
                : scene.background_asset_id
                  ? `url(${resolveAssetId(scene.background_asset_id)}) center/cover`
                  : undefined;
              const fgBackground = fgSolidColor
                ? fgSolidColor
                : scene.foreground_asset_id
                  ? `url(${resolveAssetId(scene.foreground_asset_id)}) center/cover`
                  : undefined;
              return (
                <div style={{ height: '40px', position: 'relative', overflow: 'hidden', background: theme.bgInput, cursor: 'pointer' }}>
                  {bgBackground && (
                    <div style={{
                      position: 'absolute', inset: 0,
                      background: bgBackground,
                      clipPath: 'polygon(75% 0, 100% 0, 100% 100%, 55% 100%)',
                      filter: scene.bg_blur ? 'blur(3px)' : undefined,
                    }} />
                  )}
                  {fgBackground && (
                    <div style={{
                      position: 'absolute', inset: 0,
                      background: fgBackground,
                      clipPath: 'polygon(0 0, 75% 0, 55% 100%, 0 100%)',
                    }} />
                  )}
                </div>
              );
            })()}

            {/* 情報 */}
            <div
              style={{
                padding: '4px 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                minWidth: 0,
              }}
            >
              {editingId === scene.id ? (
                <input
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  autoFocus
                  maxLength={128}
                  style={{
                    flex: 1, minWidth: 0,
                    background: theme.bgInput, border: `1px solid ${theme.border}`,
                    color: theme.textPrimary, fontSize: '12px', padding: '1px 4px',
                    outline: 'none',
                  }}
                />
              ) : (
                <span
                  onDoubleClick={(e) => { e.stopPropagation(); startEdit(scene); }}
                  style={{
                    color: theme.textPrimary,
                    fontSize: '12px',
                    cursor: 'pointer',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {scene.name}
                </span>
              )}
            </div>
          </div>
        </SortableListItem>
          </div>
        </Tooltip>
        );
      })}
    </SortableListPanel>
    </div>

    <DropdownMenu
      mode="context"
      open={contextMenu !== null}
      onOpenChange={(open) => { if (!open) setContextMenu(null); }}
      position={contextMenu ?? { x: 0, y: 0 }}
      items={(() => {
        // 右クリック対象 or 単一選択中のシーン
        const singleTargetId = contextMenu?.sceneId
          ?? (selectedSceneIds.length === 1 ? selectedSceneIds[0] : undefined);
        return [
        {
          label: '新規作成',
          onClick: () => {
            onAddScene(1);
            setContextMenu(null);
          },
        },
        'separator',
        {
          label: 'このシーンに切り替え',
          disabled: !singleTargetId || singleTargetId === activeSceneId,
          onClick: () => {
            if (singleTargetId) {
              onActivateScene(singleTargetId);
            }
            setContextMenu(null);
          },
        },
        'separator',
        {
          label: '名前を変更',
          disabled: !singleTargetId,
          onClick: () => {
            if (singleTargetId) {
              const scene = scenes.find(s => s.id === singleTargetId);
              if (scene) {
                startEdit(scene);
              }
            }
            setContextMenu(null);
          },
        },
        {
          label: 'コピー',
          shortcut: shortcutLabel('C'),
          disabled: !contextMenu?.sceneId && selectedSceneIds.length === 0,
          onClick: () => {
            const ids = contextMenu?.sceneId && !selectedSceneIds.includes(contextMenu.sceneId)
              ? [contextMenu.sceneId]
              : selectedSceneIds;
            if (ids.length > 0) onCopy?.(ids);
            setContextMenu(null);
          },
        },
        {
          label: (() => {
            const ids = contextMenu?.sceneId && !selectedSceneIds.includes(contextMenu.sceneId)
              ? [contextMenu.sceneId]
              : selectedSceneIds;
            return ids.length > 1 ? `${ids.length}件複製` : '複製';
          })(),
          shortcut: shortcutLabel('D'),
          disabled: !onDuplicateScenes || (!contextMenu?.sceneId && selectedSceneIds.length === 0),
          onClick: () => {
            const ids = contextMenu?.sceneId && !selectedSceneIds.includes(contextMenu.sceneId)
              ? [contextMenu.sceneId]
              : selectedSceneIds;
            if (ids.length > 0) onDuplicateScenes?.(ids);
            setContextMenu(null);
          },
        },
        {
          label: (() => {
            const ids = contextMenu?.sceneId && !selectedSceneIds.includes(contextMenu.sceneId)
              ? [contextMenu.sceneId]
              : selectedSceneIds;
            return ids.length > 1 ? `${ids.length}件削除` : '削除';
          })(),
          shortcut: 'Del',
          disabled: !contextMenu?.sceneId && selectedSceneIds.length === 0,
          onClick: () => {
            const ids = contextMenu?.sceneId && !selectedSceneIds.includes(contextMenu.sceneId)
              ? [contextMenu.sceneId]
              : selectedSceneIds;
            if (ids.length > 0 && ids.length < scenes.length) {
              setPendingRemove({
                ids,
                msg: ids.length > 1 ? `${ids.length}件のシーンを削除しますか？` : 'このシーンを削除しますか？',
              });
            }
            setContextMenu(null);
          },
        },
        'separator',
        {
          label: '貼り付け',
          shortcut: shortcutLabel('V'),
          disabled: !onPaste,
          onClick: () => {
            onPaste?.();
            setContextMenu(null);
          },
        },
      ]; })()}
    />

    {pendingRemove && (
      <ConfirmModal
        message={pendingRemove.msg}
        confirmLabel="削除"
        danger
        onConfirm={() => { onRemoveScenes(pendingRemove.ids); setPendingRemove(null); }}
        onCancel={() => setPendingRemove(null)}
      />
    )}
    </>
  );
}
