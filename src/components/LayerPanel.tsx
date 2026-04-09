import React, { useState, useEffect, useCallback } from 'react';
import { useAdrasteaContext } from '../contexts/AdrasteaContext';
import { usePermission } from '../hooks/usePermission';
import type { BoardObjectType } from '../types/adrastea.types';
import { ConfirmModal, DropdownMenu, AdModal } from './ui';
import { theme } from '../styles/theme';
import { AssetLibraryModal } from './AssetLibraryModal';
import { useCharacterContextMenu } from './useCharacterContextMenu';
import { objectToClipboardJson } from '../utils/clipboardImport';
import { ObjectLayerList } from './ObjectLayerList';
import { CharacterLayerSection } from './CharacterLayerSection';
import { generateDuplicateName } from '../utils/nameUtils';

export function LayerPanel({ onPaste }: { onPaste?: () => void }) {
  const { can } = usePermission();
  const canEditObject = can('object_edit');
  const {
    activeObjects,
    addObject,
    activeScene,
    layerOrderedCharacters,
    panelSelection,
    showToast,
    selectedObjectIds,
    removeCharacter,
    setEditingCharacter,
    addCharacter,
    setCharacterToOpenModal,
    getBoardCenter,
    removeObject,
    keyboardActionsRef,
    members,
    updateCharacter,
    user,
  } = useAdrasteaContext();

  const [pendingRemove, setPendingRemove] = useState<{ msg: string; action: () => void } | null>(null);
  const [pendingImageAdd, setPendingImageAdd] = useState<{ global: boolean } | null>(null);
  const [charContextMenu, setCharContextMenu] = useState<{ charId: string; x: number; y: number } | null>(null);
  const [transferTarget, setTransferTarget] = useState<typeof contextChar>(null);

  const selectedCharIds = panelSelection?.panel === 'character' ? panelSelection.ids : [];

  // キャラクター右クリックメニュー
  const contextChar = charContextMenu
    ? layerOrderedCharacters.find(c => c.id === charContextMenu.charId) ?? null
    : null;
  const { items: charCtxMenuItems, confirmModal: charCtxConfirmModal } = useCharacterContextMenu(contextChar, {
    currentUserId: user?.uid ?? '',
    onClose: () => setCharContextMenu(null),
    onDuplicate: async (c) => {
      const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = c as any;
      await addCharacter({ ...rest, name: generateDuplicateName(c.name, layerOrderedCharacters.map(ch => ch.name)) });
    },
    onRemove: (charId) => {
      removeCharacter(charId);
      setEditingCharacter(undefined);
    },
    onPaste,
    onTransfer: (c) => setTransferTarget(c),
  });

  // グローバルキーボードショートカットにハンドラ登録
  useEffect(() => {
    if (selectedObjectIds.length > 0 && panelSelection?.panel === 'layer') {
      keyboardActionsRef.current = {
        copy: () => {
          const objs = activeObjects.filter(o =>
            selectedObjectIds.includes(o.id) && o.type !== 'characters_layer'
          );
          if (objs.length > 0) {
            navigator.clipboard.writeText(objectToClipboardJson(objs, activeScene));
            showToast(objs.length > 1 ? `${objs.length}件のオブジェクトをコピーしました` : `${objs[0].name} をコピーしました`, 'success');
          }
        },
        duplicate: canEditObject ? () => {
          const targets = activeObjects.filter(o =>
            selectedObjectIds.includes(o.id) && o.type !== 'background' && o.type !== 'foreground' && o.type !== 'characters_layer'
          );
          if (targets.length > 0) {
            Promise.all(targets.map(obj => {
              const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = obj as any;
              return addObject({
                ...rest,
                name: generateDuplicateName(obj.name, activeObjects.map(o => o.name)),
                sort_order: obj.sort_order + 1,
              });
            }));
          }
        } : undefined,
        delete: canEditObject ? () => {
          const targets = activeObjects.filter(o =>
            selectedObjectIds.includes(o.id) && o.type !== 'background' && o.type !== 'foreground' && o.type !== 'characters_layer'
          );
          if (targets.length > 0) {
            const msg = targets.length > 1 ? `${targets.length}件のオブジェクトを削除しますか？` : `「${targets[0].name}」を削除しますか？`;
            setPendingRemove({ msg, action: () => Promise.all(targets.map(o => removeObject(o.id))) });
          }
        } : undefined,
      };
    }
    return () => {
      if (panelSelection?.panel === 'layer') {
        keyboardActionsRef.current = {};
      }
    };
  }, [selectedObjectIds, activeObjects, addObject, removeObject, showToast, panelSelection, keyboardActionsRef, canEditObject]);

  const handleImageAdd = useCallback((global: boolean) => {
    if (!canEditObject) return;
    setPendingImageAdd({ global });
  }, [canEditObject]);

  const handleImageSelected = useCallback((_url: string, _assetId?: string, _title?: string, w?: number, h?: number) => {
    if (!pendingImageAdd) return;
    const center = getBoardCenter();
    // sort_order は addObject 内で allObjects の max + 1 を自動計算させる

    // 画像の比率からグリッド単位のサイズを算出
    let width = 4;
    let height = 4;
    if (w && h) {
      const maxGridSize = 10;
      const aspect = w / h;
      if (aspect >= 1) {
        width = maxGridSize;
        height = Math.max(1, Math.round(maxGridSize / aspect));
      } else {
        height = maxGridSize;
        width = Math.max(1, Math.round(maxGridSize * aspect));
      }
    }

    addObject({
      type: 'panel' as BoardObjectType,
      name: '新規オブジェクト',
      x: center.x,
      y: center.y,
      width,
      height,
      global: pendingImageAdd.global,
      scene_ids: pendingImageAdd.global ? [] : (activeScene?.id ? [activeScene.id] : []),
      image_asset_id: _assetId ?? null,
    });
    setPendingImageAdd(null);
  }, [pendingImageAdd, activeObjects, activeScene, addObject, getBoardCenter]);

  const handleRemoveRequest = useCallback((msg: string, action: () => void) => {
    setPendingRemove({ msg, action });
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    const charEl = (e.target as HTMLElement).closest('[data-char-id]');
    const charId = charEl?.getAttribute('data-char-id') ?? null;
    if (charId) {
      e.preventDefault();
      e.stopPropagation();
      setCharContextMenu({ charId, x: e.clientX, y: e.clientY });
      return;
    }
  }, []);

  const characterSectionNode = (
    <CharacterLayerSection
      characters={layerOrderedCharacters}
      selectedCharIds={selectedCharIds}
      onSelectCharacter={() => {}}
      onCharacterContextMenu={(charId, x, y) => {
        setCharContextMenu({ charId, x, y });
      }}
      onContextMenuClose={() => setCharContextMenu(null)}
      onDoubleClickCharacter={(charId) => {
        const char = layerOrderedCharacters.find(c => c.id === charId);
        if (char) setCharacterToOpenModal(char);
      }}
    />
  );

  return (
    <>
    <div
      onContextMenu={handleContextMenu}
      style={{ height: '100%', overflow: 'auto' }}
    >
      <ObjectLayerList
        onPaste={onPaste}
        onImageAdd={handleImageAdd}
        onRemoveRequest={handleRemoveRequest}
        characterSection={characterSectionNode}
      />
    </div>

    {pendingRemove && (
      <ConfirmModal
        message={pendingRemove.msg}
        confirmLabel="削除"
        danger
        onConfirm={() => { pendingRemove.action(); setPendingRemove(null); }}
        onCancel={() => setPendingRemove(null)}
      />
    )}
    <DropdownMenu
      mode="context"
      open={charContextMenu !== null}
      onOpenChange={(open) => { if (!open) setCharContextMenu(null); }}
      position={charContextMenu ?? { x: 0, y: 0 }}
      items={charCtxMenuItems}
    />
    {charCtxConfirmModal}
    {transferTarget && members && members.length > 1 && (
      <AdModal
        title={`「${transferTarget.name}」を譲渡`}
        width="320px"
        onClose={() => setTransferTarget(null)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {members
            .filter(m => m.user_id !== (user?.uid ?? ''))
            .map(m => (
              <button
                key={m.user_id}
                type="button"
                onClick={() => {
                  updateCharacter(transferTarget.id, { owner_id: m.user_id });
                  setTransferTarget(null);
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
                  background: 'none', border: `1px solid ${theme.borderSubtle}`, borderRadius: '6px',
                  cursor: 'pointer', color: theme.textPrimary, fontSize: '13px', textAlign: 'left',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = theme.bgHover ?? theme.bgInput; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
              >
                {m.avatar_url ? (
                  <img src={m.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', background: theme.bgInput,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '12px', color: theme.textMuted,
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
        </div>
      </AdModal>
    )}
    {pendingImageAdd && (
      <AssetLibraryModal
        initialTab="image"
        autoTags={['オブジェクト']}
        onClose={() => setPendingImageAdd(null)}
        onSelect={handleImageSelected}
      />
    )}
    </>
  );
}
