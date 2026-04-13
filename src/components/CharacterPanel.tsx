import { useCallback, useState } from 'react';
import { Trash2, Plus, Eye, EyeOff, Copy } from 'lucide-react';
import type { DragEndEvent } from '@dnd-kit/core';
import { theme } from '../styles/theme';
import type { Character } from '../types/adrastea.types';
import { resolveAssetId } from '../hooks/useAssets';
import { SortableListPanel, SortableListItem, Tooltip, ConfirmModal, DropdownMenu, AdModal } from './ui';
import { shortcutLabel } from './ui/DropdownMenu';
import { useThrottledCallback } from '../hooks/useThrottledUpdate';
import { usePermission } from '../hooks/usePermission';
import { hasRole, canClipboardCopyCharacters } from '../config/permissions';

interface CharacterPanelProps {
  characters: Character[];
  currentUserId: string;
  selectedCharIds: string[];
  onAddCharacter: () => void;
  onSelectCharacter: (char: Character) => void;
  onDoubleClickCharacter?: (char: Character) => void;
  onSelectedCharIdsChange: (ids: string[]) => void;
  onRemoveCharacters: (ids: string[]) => void;
  onReorderCharacters?: (orderedIds: string[]) => void;
  onToggleBoardVisible: (charId: string) => void;
  onDuplicateCharacters?: (ids: string[]) => void;
  onCopy?: (ids: string[]) => void;
  onPaste?: () => void;
  members?: Array<{ user_id: string; role: string; display_name: string | null; avatar_url: string | null }>;
  onTransferCharacter?: (charId: string, newOwnerId: string) => void;
}

export function CharacterPanel({
  characters,
  currentUserId,
  selectedCharIds,
  onAddCharacter,
  onSelectCharacter,
  onDoubleClickCharacter,
  onSelectedCharIdsChange,
  onRemoveCharacters,
  onReorderCharacters,
  onToggleBoardVisible,
  onDuplicateCharacters,
  onCopy,
  onPaste,
  members,
  onTransferCharacter,
}: CharacterPanelProps) {
  const [pendingRemove, setPendingRemove] = useState<{ ids: string[]; msg: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; charId?: string } | null>(null);
  const [transferTarget, setTransferTarget] = useState<{ charId: string; charName: string } | null>(null);
  const { can, roomRole } = usePermission();
  const canEditChar = can('character_edit');
  const filteredCharacters = characters.filter(c => c.owner_id === currentUserId);
  const canDelete = selectedCharIds.length > 0;

  const throttledToggleBoardVisible = useThrottledCallback(onToggleBoardVisible);

  const iconBtnStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    color: theme.textSecondary,
    cursor: 'pointer',
    fontSize: '0.85rem',
    padding: '2px 4px',
    lineHeight: 1,
  };

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorderCharacters) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // 複数選択中なら選択アイテム全部、そうでなければドラッグしたもの1つ
    const dragIds = selectedCharIds.includes(activeId) && selectedCharIds.length > 1
      ? selectedCharIds
      : [activeId];
    const dragSet = new Set(dragIds);
    if (dragSet.has(overId)) return;

    // ドラッグ対象を除外した残りリスト
    const rest = filteredCharacters.filter(item => !dragSet.has(item.id));
    const draggedItems = filteredCharacters.filter(item => dragSet.has(item.id));

    // 挿入位置を計算
    const activeOrigIdx = filteredCharacters.findIndex(item => item.id === activeId);
    const overOrigIdx = filteredCharacters.findIndex(item => item.id === overId);
    const overIdx = rest.findIndex(item => item.id === overId);
    if (overIdx < 0) return;
    const insertIdx = activeOrigIdx < overOrigIdx ? overIdx + 1 : overIdx;

    rest.splice(insertIdx, 0, ...draggedItems);
    onReorderCharacters(rest.map(item => item.id));
  }, [filteredCharacters, selectedCharIds, onReorderCharacters]);

  const handleRowClick = useCallback((e: React.MouseEvent, char: Character) => {
    if (e.shiftKey && selectedCharIds.length > 0) {
      const lastSelected = selectedCharIds[selectedCharIds.length - 1];
      const anchorIdx = filteredCharacters.findIndex(c => c.id === lastSelected);
      const targetIdx = filteredCharacters.findIndex(c => c.id === char.id);
      if (anchorIdx >= 0 && targetIdx >= 0) {
        const start = Math.min(anchorIdx, targetIdx);
        const end = Math.max(anchorIdx, targetIdx);
        onSelectedCharIdsChange(filteredCharacters.slice(start, end + 1).map(c => c.id));
      }
    } else if (e.metaKey || e.ctrlKey) {
      onSelectedCharIdsChange(
        selectedCharIds.includes(char.id)
          ? selectedCharIds.filter(id => id !== char.id)
          : [...selectedCharIds, char.id]
      );
    } else {
      onSelectCharacter(char);
    }
  }, [filteredCharacters, selectedCharIds, onSelectedCharIdsChange, onSelectCharacter]);

  return (
    <>
    <div
      data-selection-panel
      onContextMenu={(e) => {
        e.preventDefault();
        const charEl = (e.target as HTMLElement).closest('[data-char-id]');
        const charId = charEl?.getAttribute('data-char-id') ?? undefined;
        if (charId && !selectedCharIds.includes(charId)) {
          onSelectedCharIdsChange([charId]);
          onSelectCharacter(filteredCharacters.find(c => c.id === charId)!);
        }
        setContextMenu({ x: e.clientX, y: e.clientY, charId });
      }}
      style={{ height: '100%' }}
    >
      <SortableListPanel
      layout="grid"
      title="キャラクター"
      onBackgroundClick={() => onSelectedCharIdsChange([])}
      headerActions={
        <div style={{ display: 'flex', alignItems: 'center', gap: '1px' }}>
          <Tooltip label={selectedCharIds.length > 1 ? `${selectedCharIds.length}件複製` : '複製'}>
            <button
              onClick={() => canDelete && canEditChar && onDuplicateCharacters?.(selectedCharIds)}
              style={{ ...iconBtnStyle, color: theme.textSecondary, opacity: (canDelete && canEditChar) ? 1 : 0.3, pointerEvents: (canDelete && canEditChar) ? 'auto' : 'none' }}
            >
              <Copy size={15} />
            </button>
          </Tooltip>
          <Tooltip label={selectedCharIds.length > 1 ? `${selectedCharIds.length}件削除` : '削除'}>
            <button
              onClick={() => canDelete && canEditChar && setPendingRemove({
                ids: selectedCharIds,
                msg: selectedCharIds.length > 1 ? `${selectedCharIds.length}件のキャラクターを削除しますか？` : 'このキャラクターを削除しますか？',
              })}
              style={{ ...iconBtnStyle, color: theme.danger, opacity: (canDelete && canEditChar) ? 1 : 0.3, pointerEvents: (canDelete && canEditChar) ? 'auto' : 'none' }}
            >
              <Trash2 size={15} />
            </button>
          </Tooltip>
          <Tooltip label="キャラクター追加">
            <button
              onClick={onAddCharacter}
              aria-label="キャラクター追加"
              style={{ ...iconBtnStyle, color: theme.accent }}
            >
              <Plus size={16} />
            </button>
          </Tooltip>
        </div>
      }
      items={filteredCharacters}
      onDragEnd={handleDragEnd}
      emptyMessage="キャラクターがありません"
    >
      {filteredCharacters.map((char) => (
        <SortableListItem
          key={char.id}
          id={char.id}
          layout="grid"
          dataAttributes={{ 'data-char-id': char.id }}
          onClick={(e: React.MouseEvent) => handleRowClick(e, char)}
          onDoubleClick={() => onDoubleClickCharacter?.(char)}
          isSelected={selectedCharIds.includes(char.id)}
          itemStyle={{
            borderLeft: `3px solid ${char.color || '#555555'}`,
          }}
          >
            {/* アバター */}
            {char.images[char.active_image_index]?.asset_id && resolveAssetId(char.images[char.active_image_index].asset_id) ? (
              <img
                src={resolveAssetId(char.images[char.active_image_index].asset_id) ?? undefined}
                alt={char.name}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: 0,
                  objectFit: 'cover',
                  objectPosition: 'top',
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: 0,
                  background: char.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '1rem',
                  flexShrink: 0,
                }}
              >
                {char.name.charAt(0)}
              </div>
            )}

            {/* コンテンツ */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: '12px',
                  color: theme.textPrimary,
                  display: 'block',
                }}
              >
                {char.name}
              </span>
            </div>

            {/* 表示/非表示ボタン */}
            <Tooltip label={char.board_visible !== false ? '非表示' : '表示'}>
              <button
                onClick={(e) => { e.stopPropagation(); throttledToggleBoardVisible(char.id); }}
                style={{
                  ...iconBtnStyle,
                  color: char.board_visible !== false ? theme.textSecondary : theme.textMuted,
                  display: 'flex',
                  alignItems: 'center',
                  opacity: char.board_visible !== false ? 1 : 0.4,
                }}
              >
                {char.board_visible !== false ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
            </Tooltip>
          </SortableListItem>
      ))}
      </SortableListPanel>
    </div>

    <DropdownMenu
      mode="context"
      open={contextMenu !== null}
      onOpenChange={(open) => { if (!open) setContextMenu(null); }}
      position={contextMenu ?? { x: 0, y: 0 }}
      items={[
        {
          label: '新規作成',
          onClick: () => {
            onAddCharacter();
            setContextMenu(null);
          },
        },
        'separator',
        {
          label: (() => {
            const ids = contextMenu?.charId && !selectedCharIds.includes(contextMenu.charId)
              ? [contextMenu.charId]
              : selectedCharIds;
            return ids.length > 1 ? `${ids.length}件コピー` : 'コピー';
          })(),
          shortcut: shortcutLabel('C'),
          disabled: (() => {
            const ids = contextMenu?.charId && !selectedCharIds.includes(contextMenu.charId)
              ? [contextMenu.charId]
              : selectedCharIds;
            if (ids.length === 0) return true;
            const targets = ids
              .map((id) => characters.find((ch) => ch.id === id))
              .filter((c): c is Character => Boolean(c));
            return !canClipboardCopyCharacters(roomRole, targets, currentUserId);
          })(),
          onClick: () => {
            const ids = contextMenu?.charId && !selectedCharIds.includes(contextMenu.charId)
              ? [contextMenu.charId]
              : selectedCharIds;
            if (ids.length > 0) {
              onCopy?.(ids);
            }
            setContextMenu(null);
          },
        },
        {
          label: (() => {
            const ids = contextMenu?.charId && !selectedCharIds.includes(contextMenu.charId)
              ? [contextMenu.charId]
              : selectedCharIds;
            return ids.length > 1 ? `${ids.length}件複製` : '複製';
          })(),
          shortcut: shortcutLabel('D'),
          disabled: (() => {
            const ids = contextMenu?.charId && !selectedCharIds.includes(contextMenu.charId)
              ? [contextMenu.charId]
              : selectedCharIds;
            if (ids.length === 0) return true;
            if (!canEditChar) return true;
            // sub_owner 以上なら全キャラ操作可能
            if (hasRole(roomRole, 'sub_owner')) return false;
            // user は自分のキャラのみ
            return ids.some(id => {
              const c = characters.find(ch => ch.id === id);
              return c && c.owner_id !== currentUserId;
            });
          })(),
          onClick: () => {
            const ids = contextMenu?.charId && !selectedCharIds.includes(contextMenu.charId)
              ? [contextMenu.charId]
              : selectedCharIds;
            if (ids.length > 0) {
              onDuplicateCharacters?.(ids);
            }
            setContextMenu(null);
          },
        },
        {
          label: (() => {
            const ids = contextMenu?.charId && !selectedCharIds.includes(contextMenu.charId)
              ? [contextMenu.charId]
              : selectedCharIds;
            return ids.length > 1 ? `${ids.length}件削除` : '削除';
          })(),
          shortcut: 'Del',
          danger: true,
          disabled: (() => {
            const ids = contextMenu?.charId && !selectedCharIds.includes(contextMenu.charId)
              ? [contextMenu.charId]
              : selectedCharIds;
            if (ids.length === 0) return true;
            if (!canEditChar) return true;
            // sub_owner 以上なら全キャラ操作可能
            if (hasRole(roomRole, 'sub_owner')) return false;
            // user は自分のキャラのみ
            return ids.some(id => {
              const c = characters.find(ch => ch.id === id);
              return c && c.owner_id !== currentUserId;
            });
          })(),
          onClick: () => {
            const ids = contextMenu?.charId && !selectedCharIds.includes(contextMenu.charId)
              ? [contextMenu.charId]
              : selectedCharIds;
            if (ids.length > 0) {
              setPendingRemove({
                ids,
                msg: ids.length > 1 ? `${ids.length}件のキャラクターを削除しますか？` : 'このキャラクターを削除しますか？',
              });
            }
            setContextMenu(null);
          },
        },
        {
          label: '譲渡',
          disabled: (() => {
            if (!contextMenu?.charId) return true;
            if (!members || members.length <= 1) return true;
            if (!onTransferCharacter) return true;
            // 自分のキャラのみ譲渡可能（sub_owner以上は全キャラ可）
            if (hasRole(roomRole, 'sub_owner')) return false;
            const c = characters.find(ch => ch.id === contextMenu.charId);
            return !c || c.owner_id !== currentUserId;
          })(),
          onClick: () => {
            if (!contextMenu?.charId) return;
            const c = characters.find(ch => ch.id === contextMenu.charId);
            if (c) {
              setTransferTarget({ charId: c.id, charName: c.name });
            }
            setContextMenu(null);
          },
        },
        'separator',
        {
          label: '貼り付け',
          shortcut: shortcutLabel('V'),
          disabled: !onPaste || !canEditChar,
          onClick: () => {
            onPaste?.();
            setContextMenu(null);
          },
        },
      ]}
    />

    {pendingRemove && (
      <ConfirmModal
        message={pendingRemove.msg}
        confirmLabel="削除"
        danger
        onConfirm={() => { onRemoveCharacters(pendingRemove.ids); setPendingRemove(null); }}
        onCancel={() => setPendingRemove(null)}
      />
    )}

    {transferTarget && members && (
      <AdModal
        title={`「${transferTarget.charName}」を譲渡`}
        width="320px"
        onClose={() => setTransferTarget(null)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {members
            .filter(m => m.user_id !== currentUserId)
            .map(m => (
              <button
                key={m.user_id}
                type="button"
                onClick={() => {
                  onTransferCharacter?.(transferTarget.charId, m.user_id);
                  setTransferTarget(null);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  background: 'none',
                  border: `1px solid ${theme.borderSubtle}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: theme.textPrimary,
                  fontSize: '13px',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = theme.bgHover ?? theme.bgInput;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'none';
                }}
              >
                {m.avatar_url ? (
                  <img
                    src={m.avatar_url}
                    alt=""
                    style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: theme.bgInput,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    color: theme.textMuted,
                  }}>
                    {(m.display_name ?? '?')[0]}
                  </div>
                )}
                <div>
                  <div style={{ fontWeight: 500 }}>{m.display_name ?? 'ユーザー'}</div>
                  <div style={{ fontSize: '10px', color: theme.textMuted }}>{m.role}</div>
                </div>
              </button>
            ))}
          {members.filter(m => m.user_id !== currentUserId).length === 0 && (
            <div style={{ color: theme.textMuted, fontSize: '12px', textAlign: 'center', padding: '16px 0' }}>
              他のメンバーがいません
            </div>
          )}
        </div>
      </AdModal>
    )}
    </>
  );
}
