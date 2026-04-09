import { useState, useCallback } from 'react';
import type React from 'react';
import type { DropdownMenuEntry } from './ui/DropdownMenu';
import { shortcutLabel } from './ui/DropdownMenu';
import type { Character } from '../types/adrastea.types';
import { usePermission } from '../hooks/usePermission';
import { hasRole, canClipboardCopyCharacters } from '../config/permissions';
import { characterToClipboardJson } from '../utils/clipboardImport';
import { useAdrasteaContext } from '../contexts/AdrasteaContext';
import { ConfirmModal } from './ui';

interface UseCharacterContextMenuOptions {
  currentUserId: string;
  onClose: () => void;
  onDuplicate?: (char: Character) => void;
  onRemove?: (charId: string) => void;
  onPaste?: () => void;
  onTransfer?: (char: Character) => void;
  showUndoRedo?: boolean;
}

interface UseCharacterContextMenuResult {
  items: DropdownMenuEntry[];
  confirmModal: React.ReactNode;
}

/**
 * キャラクター右クリックメニューのロジック。
 * 複製・削除・コピー・貼り付けを権限チェック付きで提供する。
 */
export function useCharacterContextMenu(
  char: Character | null,
  { currentUserId, onClose, onDuplicate, onRemove, onPaste, onTransfer, showUndoRedo = false }: UseCharacterContextMenuOptions
): UseCharacterContextMenuResult {
  const { can, roomRole } = usePermission();
  const { undoRedo } = useAdrasteaContext();
  const [pendingRemove, setPendingRemove] = useState(false);

  const canEditChar = can('character_edit');
  const isMyChar = char?.owner_id === currentUserId;
  const isSubOwnerPlus = hasRole(roomRole, 'sub_owner');
  // 自分のキャラクター、または sub_owner 以上なら操作可能
  const canModify = canEditChar && (isMyChar || isSubOwnerPlus);

  const items: DropdownMenuEntry[] = [];

  // コピー（user / guest は本人キャラのみ）
  items.push({
    label: 'コピー',
    shortcut: shortcutLabel('C'),
    disabled: !char || !canClipboardCopyCharacters(roomRole, [char], currentUserId),
    onClick: () => {
      if (char && canClipboardCopyCharacters(roomRole, [char], currentUserId)) {
        navigator.clipboard.writeText(characterToClipboardJson(char));
      }
      onClose();
    },
  });

  // 複製
  items.push({
    label: '複製',
    shortcut: shortcutLabel('D'),
    disabled: !char || !canModify,
    onClick: () => {
      if (char && onDuplicate) onDuplicate(char);
      onClose();
    },
  });

  // 削除
  items.push({
    label: '削除',
    shortcut: 'Del',
    danger: true,
    disabled: !char || !canModify,
    onClick: () => {
      setPendingRemove(true);
      onClose();
    },
  });

  // 譲渡
  items.push({
    label: '譲渡',
    disabled: !char || !canModify || !onTransfer,
    onClick: () => {
      if (char && onTransfer) onTransfer(char);
      onClose();
    },
  });

  items.push('separator');

  // 貼り付け
  items.push({
    label: '貼り付け',
    shortcut: shortcutLabel('V'),
    disabled: !onPaste || !canEditChar,
    onClick: () => {
      onPaste?.();
      onClose();
    },
  });

  if (showUndoRedo) {
    items.push('separator');
    items.push({
      label: '元に戻す',
      shortcut: shortcutLabel('Z'),
      disabled: !undoRedo.canUndo || !isSubOwnerPlus,
      onClick: () => { undoRedo.undo(); onClose(); },
    });
    items.push({
      label: 'やり直し',
      shortcut: shortcutLabel('⇧Z'),
      disabled: !undoRedo.canRedo || !isSubOwnerPlus,
      onClick: () => { undoRedo.redo(); onClose(); },
    });
  }

  const handleConfirmRemove = useCallback(() => {
    if (char) {
      onRemove?.(char.id);
    }
    setPendingRemove(false);
  }, [char, onRemove]);

  const confirmModal = pendingRemove && char ? (
    <ConfirmModal
      message={`キャラクター「${char.name}」を削除しますか？`}
      confirmLabel="削除"
      danger
      onConfirm={handleConfirmRemove}
      onCancel={() => setPendingRemove(false)}
    />
  ) : null;

  return { items, confirmModal };
}
