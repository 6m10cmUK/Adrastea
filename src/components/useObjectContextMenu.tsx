import { useState, useCallback } from 'react';
import type React from 'react';
import { useAdrasteaContext } from '../contexts/AdrasteaContext';
import { usePermission } from '../hooks/usePermission';
import { ConfirmModal } from './ui';
import type { DropdownMenuEntry } from './ui/DropdownMenu';
import { shortcutLabel } from './ui/DropdownMenu';
import type { BoardObject } from '../types/adrastea.types';
import { objectToClipboardJson } from '../utils/clipboardImport';
import { generateDuplicateName } from '../utils/nameUtils';

interface UseObjectContextMenuOptions {
  onClose: () => void;
  onAfterDuplicate?: (newIds: string[]) => void;
  onPaste?: () => void;
  showUndoRedo?: boolean;
}

interface UseObjectContextMenuResult {
  items: DropdownMenuEntry[];
  confirmModal: React.ReactNode;
}

/**
 * オブジェクト右クリックメニュー（複製・削除・非表示）の共通hook。
 * targets に操作対象 BoardObject[] を渡す。単体でも複数選択でも対応。
 */
export function useObjectContextMenu(
  targets: BoardObject[],
  { onClose, onAfterDuplicate, onPaste, showUndoRedo = false }: UseObjectContextMenuOptions
): UseObjectContextMenuResult {
  const { addObject, updateObject, removeObject, undoRedo, allObjects, activeScene } = useAdrasteaContext();
  const { can } = usePermission();
  const canEdit = can('object_edit');
  const [pendingRemove, setPendingRemove] = useState<BoardObject[] | null>(null);

  const deletableTargets = targets.filter(
    (o) => o.type !== 'background' && o.type !== 'foreground' && o.type !== 'characters_layer'
  );
  const canDupOrDel = deletableTargets.length > 0;

  const handleDuplicate = useCallback(async () => {
    const newIds = await Promise.all(
      deletableTargets.map(obj => {
        const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = obj as any;
        return addObject({
          ...rest,
          name: generateDuplicateName(obj.name, allObjects?.map(o => o.name) ?? []),
          sort_order: obj.sort_order + 1,
        });
      })
    );
    const validIds = newIds.filter(Boolean);
    if (validIds.length > 0) onAfterDuplicate?.(validIds);
    onClose();
  }, [deletableTargets, addObject, onAfterDuplicate, onClose]);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingRemove) return;
    await Promise.all(pendingRemove.map(obj => removeObject(obj.id)));
    setPendingRemove(null);
  }, [pendingRemove, removeObject]);

  const dupLabel = deletableTargets.length > 1 ? `${deletableTargets.length}件複製` : '複製';
  const delLabel = deletableTargets.length > 1 ? `${deletableTargets.length}件削除` : '削除';

  const items: DropdownMenuEntry[] = [];

  // 単体のみのメニュー
  if (targets.length === 1) {
    const obj = targets[0];
    // 前景は表示/非表示のみ許可、背景・characters_layer はスキップ
    if (obj.type !== 'background' && obj.type !== 'characters_layer') {
      items.push({
        label: obj.visible !== false ? '非表示にする' : '表示する',
        disabled: !canEdit,
        onClick: () => {
          updateObject(obj.id, { visible: obj.visible !== false ? false : true });
          onClose();
        },
      });
    }
    if (canDupOrDel) {
      items.push({
        label: obj.position_locked ? '位置固定を解除' : '位置を固定',
        disabled: !canEdit,
        onClick: () => {
          updateObject(obj.id, { position_locked: !obj.position_locked });
          onClose();
        },
      });
      items.push({
        label: obj.size_locked ? 'サイズ固定を解除' : 'サイズを固定',
        disabled: !canEdit,
        onClick: () => {
          updateObject(obj.id, { size_locked: !obj.size_locked });
          onClose();
        },
      });
    }
    if (items.length > 0) items.push('separator');
  }

  items.push(
    {
      label: targets.length > 1 ? `${targets.length}件コピー` : 'コピー',
      shortcut: shortcutLabel('C'),
      disabled: targets.length === 0 || !canEdit,
      onClick: () => {
        if (targets.length > 0) {
          navigator.clipboard.writeText(objectToClipboardJson(targets, activeScene));
        }
        onClose();
      },
    },
    {
      label: dupLabel,
      shortcut: shortcutLabel('D'),
      disabled: !canDupOrDel || !canEdit,
      onClick: handleDuplicate,
    },
    {
      label: delLabel,
      shortcut: 'Del',
      disabled: !canDupOrDel || !canEdit,
      danger: true,
      onClick: () => {
        setPendingRemove([...deletableTargets]);
        onClose();
      },
    },
    'separator',
    {
      label: '貼り付け',
      shortcut: shortcutLabel('V'),
      disabled: !onPaste || !canEdit,
      onClick: () => {
        onPaste?.();
        onClose();
      },
    },
  );

  if (showUndoRedo) {
    items.push(
      'separator',
      {
        label: '元に戻す',
        shortcut: shortcutLabel('Z'),
        disabled: !undoRedo.canUndo || !canEdit,
        onClick: () => { undoRedo.undo(); onClose(); },
      },
      {
        label: 'やり直し',
        shortcut: shortcutLabel('⇧Z'),
        disabled: !undoRedo.canRedo || !canEdit,
        onClick: () => { undoRedo.redo(); onClose(); },
      }
    );
  }

  const deleteMsg = pendingRemove
    ? pendingRemove.length > 1
      ? `${pendingRemove.length}件のオブジェクトを削除しますか？`
      : `「${pendingRemove[0]?.name ?? 'オブジェクト'}」を削除しますか？`
    : '';

  const confirmModal = pendingRemove ? (
    <ConfirmModal
      message={deleteMsg}
      confirmLabel="削除"
      danger
      onConfirm={handleConfirmDelete}
      onCancel={() => setPendingRemove(null)}
    />
  ) : null;

  return { items, confirmModal };
}
