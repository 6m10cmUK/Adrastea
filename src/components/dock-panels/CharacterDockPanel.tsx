import { useState, useEffect, useRef, useCallback } from 'react';
import { useAdrasteaContext } from '../../contexts/AdrasteaContext';
import { handleClipboardImport } from '../../hooks/usePasteHandler';
import { characterToClipboardJson } from '../../utils/clipboardImport';
import { useThrottledCallback } from '../../hooks/useThrottledUpdate';
import { CharacterPanel } from '../CharacterPanel';
import { CharacterEditor, type CharacterEditorHandle } from '../CharacterEditor';
import { AdModal, ConfirmModal } from '../ui';
import type { Character } from '../../types/adrastea.types';
import { canClipboardCopyCharacters } from '../../config/permissions';
export function CharacterDockPanel() {
  const ctx = useAdrasteaContext();
  const [modalChar, setModalChar] = useState<Character | null | undefined>(undefined);
  const selectedCharIds = ctx.panelSelection?.panel === 'character' ? ctx.panelSelection.ids : [];
  const setSelectedCharIds = useCallback((ids: string[]) => {
    ctx.setPanelSelection(ids.length > 0 ? { panel: 'character', ids } : null);
  }, [ctx.setPanelSelection]);
  const editorRef = useRef<CharacterEditorHandle>(null);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(null);

  useEffect(() => {
    if (ctx.characterToOpenModal) {
      setModalChar(ctx.characterToOpenModal);
      ctx.setCharacterToOpenModal(null);
    }
  }, [ctx.characterToOpenModal, ctx]);

  const handleAddCharacter = async () => {
    ctx.clearAllEditing();
    const center = ctx.getBoardCenter();
    const newChar = await ctx.addCharacter({
      owner_id: ctx.user?.uid ?? '',
      board_visible: true,
      board_x: center?.x ?? 0,
      board_y: center?.y ?? 0,
    });
    ctx.setEditingCharacter(newChar);
    setSelectedCharIds([newChar.id]);
    setModalChar(newChar);
  };

  const handleSelectCharacter = (char: Character) => {
    ctx.clearAllEditing();
    ctx.setEditingCharacter(char);
    setSelectedCharIds([char.id]);
  };

  const handleModalClose = () => {
    setModalChar(undefined);
    // editingCharacter はクリアしない（プロパティパネルに表示を維持）
  };

  const handleModalCloseWithSave = () => {
    editorRef.current?.save();
    handleModalClose();
  };

  // CharacterEditor が内部で削除を処理するため、現在は使用されていないが、
  // 将来的に他の削除UX（コンテキストメニューなど）で使用される可能性がある
  // @ts-expect-error: 将来的な削除UX対応のため保持
  const handleDelete = () => {
    if (modalChar) {
      ctx.removeCharacter(modalChar.id);
      // editingCharacter もクリア
      if (ctx.editingCharacter?.id === modalChar.id) {
        ctx.setEditingCharacter(undefined);
      }
      handleModalClose();
    }
  };

  const handleRemoveCharacters = async (ids: string[]) => {
    try {
      await Promise.all(ids.map(id => ctx.removeCharacter(id)));
    } catch (err) {
      console.error('キャラクター削除失敗:', err);
    }
    setSelectedCharIds([]);
    if (ctx.editingCharacter && ids.includes(ctx.editingCharacter.id)) {
      ctx.setEditingCharacter(undefined);
    }
  };

  const handleDuplicateCharacters = async (ids: string[]) => {
    const chars = ctx.characters.filter(c => ids.includes(c.id));
    try {
      await Promise.all(chars.map(char => {
        const { id, _id, _creationTime, ...rest } = char as any;
        return ctx.addCharacter({
          ...rest,
          owner_id: ctx.user?.uid ?? '',
          name: `${char.name} (コピー)`,
        });
      }));
    } catch (err) {
      console.error('キャラクター複製失敗:', err);
    }
  };

  const handleToggleBoardVisibleRaw = useCallback((charId: string) => {
    const char = ctx.characters.find(c => c.id === charId);
    if (!char) return;
    ctx.updateCharacter(charId, { board_visible: char.board_visible !== false ? false : true });
  }, [ctx]);

  const handleToggleBoardVisible = useThrottledCallback(handleToggleBoardVisibleRaw);

  const handleCopy = useCallback((ids: string[]) => {
    const chars = ctx.characters.filter(c => ids.includes(c.id));
    if (chars.length === 0) return;
    if (!canClipboardCopyCharacters(ctx.roomRole, chars, ctx.user?.uid ?? '')) {
      ctx.showToast('自分のキャラクターのみコピーできます', 'error');
      return;
    }
    const json = characterToClipboardJson(chars);
    navigator.clipboard.writeText(json).then(() => {
      ctx.showToast(chars.length > 1 ? `${chars.length}件のキャラクターをコピーしました` : `${chars[0].name} をコピーしました`, 'success');
    }).catch(() => {
      ctx.showToast('コピーに失敗しました', 'error');
    });
  }, [ctx]);

  // グローバルキーボードショートカットにハンドラ登録
  useEffect(() => {
    if (selectedCharIds.length > 0) {
      ctx.keyboardActionsRef.current = {
        copy: () => handleCopy(selectedCharIds),
        duplicate: () => handleDuplicateCharacters(selectedCharIds),
        delete: () => {
          if (selectedCharIds.length > 0) {
            setPendingDeleteIds(selectedCharIds);
          }
        },
      };
    }
    return () => {
      if (ctx.panelSelection?.panel === 'character') {
        ctx.keyboardActionsRef.current = {};
      }
    };
  }, [selectedCharIds, handleCopy, handleDuplicateCharacters, ctx.panelSelection]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      await handleClipboardImport(
        text,
        (data) => ctx.addCharacter({ ...data, owner_id: ctx.user?.uid ?? '' }),
        ctx.showToast,
        async (data) => {
          const { sort_order: _so, ...rest } = data;
          return ctx.addObject({ ...rest, scene_ids: rest.global ? [] : (ctx.activeScene ? [ctx.activeScene.id] : []) });
        },
        undefined,
        undefined,
        ctx.updateObject,
        ctx.activeObjects,
        ctx.activeScene?.id ?? null,
        undefined,
        ctx.characters?.map(c => c.name),
        ctx.scenarioTexts?.map(t => t.title),
        ctx.updateScene,
      );
    } catch {
      ctx.showToast('クリップボードの読み取りに失敗しました', 'error');
    }
  }, [ctx]);

  return (
    <>
      <CharacterPanel
        characters={ctx.characters}
        currentUserId={ctx.user?.uid ?? ''}
        selectedCharIds={selectedCharIds}
        onAddCharacter={handleAddCharacter}
        onSelectCharacter={handleSelectCharacter}
        onDoubleClickCharacter={(char) => setModalChar(char)}
        onSelectedCharIdsChange={setSelectedCharIds}
        onRemoveCharacters={handleRemoveCharacters}
        onDuplicateCharacters={handleDuplicateCharacters}
        onReorderCharacters={ctx.reorderCharacters}
        onToggleBoardVisible={handleToggleBoardVisible}
        onPaste={handlePaste}
        onCopy={handleCopy}
        members={ctx.members}
        onTransferCharacter={(charId, newOwnerId) => {
          ctx.updateCharacter(charId, { owner_id: newOwnerId });
        }}
      />
      {modalChar !== undefined && ctx.roomId && (
        <AdModal
          title={modalChar?.id ? 'キャラクター編集' : 'キャラクター追加'}
          width="500px"
          onClose={handleModalCloseWithSave}
        >
          <CharacterEditor
            ref={editorRef}
            key={modalChar?.id ?? 'new'}
            character={modalChar}
            roomId={ctx.roomId}
            currentUserId={ctx.user?.uid ?? ''}
            onDuplicate={(data) => {
              ctx.addCharacter({ ...data, owner_id: ctx.user?.uid ?? '' });
              handleModalClose();
            }}
            onClose={handleModalClose}
          />
        </AdModal>
      )}
      {pendingDeleteIds && (
        <ConfirmModal
          message={pendingDeleteIds.length > 1 ? `${pendingDeleteIds.length}件のキャラクターを削除しますか？` : 'このキャラクターを削除しますか？'}
          confirmLabel="削除"
          danger
          onConfirm={() => { handleRemoveCharacters(pendingDeleteIds); setPendingDeleteIds(null); }}
          onCancel={() => setPendingDeleteIds(null)}
        />
      )}
    </>
  );
}
