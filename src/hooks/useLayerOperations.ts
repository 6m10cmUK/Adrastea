import { useCallback } from 'react';
import { useThrottledCallback } from './useThrottledUpdate';
import { useAdrasteaContext } from '../contexts/AdrasteaContext';
import type { BoardObject, BoardObjectType } from '../types/adrastea.types';
import { generateDuplicateName } from '../utils/nameUtils';

export function useLayerOperations() {
  const {
    activeObjects,
    allObjects,
    addObject,
    updateObject,
    removeObject,
    selectedObjectIds,
    setSelectedObjectIds,
    setEditingObjectId,
    editingObjectId,
    clearAllEditing,
    getBoardCenter,
    activeScene,
    layerOrderedCharacters,
    updateCharacter,
    addCharacter,
    removeCharacter,
    setEditingCharacter,
    editingCharacter,
    showToast,
  } = useAdrasteaContext();

  /** 指定値以上で衝突しない sort_order を返す。global なら 1000 の倍数に切り上げる */
  const nextAvailableSort = useCallback((desired: number, global: boolean): number => {
    const used = new Set(allObjects.map(o => o.sort_order));
    let v = global ? Math.ceil(desired / 1000) * 1000 : desired;
    if (v === 0 && global) v = 1000; // 0 は避ける
    while (used.has(v)) v += global ? 1000 : 1;
    return v;
  }, [allObjects]);

  // 削除可能なIDリスト（複数選択時は対象全体、単一時はそのIDのみ）
  const getDeletableIds = useCallback((triggerObjId: string): string[] => {
    if (selectedObjectIds.length > 1 && selectedObjectIds.includes(triggerObjId)) {
      return selectedObjectIds.filter(id => {
        const o = activeObjects.find(o => o.id === id);
        return o && o.type !== 'background' && o.type !== 'foreground' && o.type !== 'characters_layer';
      });
    }
    return [triggerObjId];
  }, [selectedObjectIds, activeObjects]);

  // 複製可能判定
  const canDuplicate = useCallback((id: string) => {
    const o = activeObjects.find(o => o.id === id);
    return o && o.type !== 'background' && o.type !== 'foreground' && o.type !== 'characters_layer';
  }, [activeObjects]);

  // オブジェクト削除
  const handleRemoveObjectRaw = useCallback((obj: BoardObject) => {
    if (obj.type === 'background') return;
    const ids = getDeletableIds(obj.id);
    if (ids.length === 0) return;
    return {
      msg: ids.length > 1 ? `${ids.length}件のオブジェクトを削除しますか？` : 'このオブジェクトを削除しますか？',
      action: () => {
        for (const id of ids) removeObject(id);
        if (ids.length > 1 || editingObjectId === obj.id) clearAllEditing();
      },
    };
  }, [getDeletableIds, removeObject, editingObjectId, clearAllEditing]);

  // オブジェクト複製
  const handleDuplicate = useCallback(async () => {
    // キャラクター選択中かつオブジェクトが選択されていない場合
    if (editingCharacter && selectedObjectIds.length === 0 && !editingObjectId) {
      const { id, created_at, updated_at, ...rest } = editingCharacter;
      await addCharacter({ ...rest, name: generateDuplicateName(editingCharacter.name, layerOrderedCharacters.map(c => c.name)) });
      return;
    }

    const targets = selectedObjectIds.length > 0
      ? activeObjects.filter(o => selectedObjectIds.includes(o.id) && o.type !== 'background' && o.type !== 'foreground' && o.type !== 'characters_layer')
      : editingObjectId
        ? activeObjects.filter(o => o.id === editingObjectId && o.type !== 'background' && o.type !== 'foreground' && o.type !== 'characters_layer')
        : [];
    if (targets.length === 0) return;
    const newIds: string[] = [];
    for (const obj of targets) {
      const { id, created_at, updated_at, ...rest } = obj;
      const newObjId = await addObject({
        ...rest,
        name: generateDuplicateName(obj.name, activeObjects.map(o => o.name)),
        sort_order: obj.sort_order + 1,
      });
      if (newObjId) newIds.push(newObjId);
    }
    if (newIds.length > 0) {
      setSelectedObjectIds(newIds);
      setEditingObjectId(newIds[newIds.length - 1]);
    }
  }, [selectedObjectIds, editingObjectId, activeObjects, addObject, setSelectedObjectIds, setEditingObjectId, editingCharacter, addCharacter]);

  // 表示切替（オブジェクト）
  const handleToggleVisibleRaw = useCallback((obj: BoardObject) => {
    if (selectedObjectIds.length > 1 && selectedObjectIds.includes(obj.id)) {
      const newVisible = !obj.visible;
      for (const id of selectedObjectIds) {
        const o = activeObjects.find(o => o.id === id);
        if (o) updateObject(id, { visible: newVisible });
      }
    } else {
      updateObject(obj.id, { visible: !obj.visible });
    }
  }, [selectedObjectIds, activeObjects, updateObject]);
  const handleToggleVisible = useThrottledCallback(handleToggleVisibleRaw);

  // 表示切替（キャラクター）
  const handleToggleCharVisibleRaw = useCallback((charId: string) => {
    const char = layerOrderedCharacters.find(c => c.id === charId);
    if (char) updateCharacter(charId, { board_visible: char.board_visible !== false ? false : true });
  }, [layerOrderedCharacters, updateCharacter]);
  const handleToggleCharVisible = useThrottledCallback(handleToggleCharVisibleRaw);

  // オブジェクト追加
  const handleAdd = useCallback(async (global: boolean, type: BoardObjectType, imageData?: { assetId?: string; width?: number; height?: number }) => {
    const center = getBoardCenter();
    // 前景(FG)とキャラクター(CL)の間にあるオブジェクト
    const LANDMARK_FG = 1_000_000;
    const LANDMARK_CL = 2_000_000;
    const betweenFgCl = activeObjects.filter(o =>
      o.type !== 'background' && o.type !== 'foreground' && o.type !== 'characters_layer'
      && o.sort_order > LANDMARK_FG && o.sort_order < LANDMARK_CL
    );
    let desired: number;
    if (editingObjectId) {
      const selected = activeObjects.find(o => o.id === editingObjectId && o.type !== 'background' && o.type !== 'foreground' && o.type !== 'characters_layer');
      desired = selected ? selected.sort_order + 1 : LANDMARK_FG + 1;
    } else {
      // 前景とキャラの間の一番上（= sort_order が最大のもの + 1）
      desired = betweenFgCl.length > 0
        ? Math.max(...betweenFgCl.map(o => o.sort_order)) + 1
        : LANDMARK_FG + 1;
    }
    const sortOrder = nextAvailableSort(desired, global);

    // 画像の比率からグリッド単位のサイズを算出
    let width = 4;
    let height = 4;
    if (imageData?.width && imageData?.height) {
      const maxGridSize = 10; // 最大10マス
      const aspect = imageData.width / imageData.height;
      if (aspect >= 1) {
        width = maxGridSize;
        height = Math.max(1, Math.round(maxGridSize / aspect));
      } else {
        height = maxGridSize;
        width = Math.max(1, Math.round(maxGridSize * aspect));
      }
    }

    const newObjId = await addObject({
      type,
      name: type === 'text' ? '新規テキスト' : '新規オブジェクト',
      x: center.x,
      y: center.y,
      width,
      height,
      sort_order: sortOrder,
      global,
      scene_ids: global ? [] : (activeScene?.id ? [activeScene.id] : []),
      ...(imageData?.assetId ? { image_asset_id: imageData.assetId } : {}),
    });
    if (newObjId) {
      setSelectedObjectIds([newObjId]);
      setEditingObjectId(newObjId);
      showToast(type === 'text' ? 'テキストを追加しました' : 'オブジェクトを追加しました', 'success');
    }
  }, [activeObjects, editingObjectId, getBoardCenter, activeScene, addObject, setSelectedObjectIds, setEditingObjectId, showToast]);

  // キャラクター削除確認用（複製と同じく確認メッセージを返す）
  const handleRemoveCharacter = useCallback((charId: string) => {
    const char = layerOrderedCharacters.find(c => c.id === charId);
    if (!char) return null;
    return {
      msg: `キャラクター「${char.name}」を削除しますか？`,
      action: () => {
        removeCharacter(charId);
        setEditingCharacter(undefined);
      },
    };
  }, [layerOrderedCharacters, removeCharacter, setEditingCharacter]);

  return {
    getDeletableIds,
    canDuplicate,
    handleRemoveObject: handleRemoveObjectRaw,
    handleDuplicate,
    handleToggleVisible,
    handleToggleCharVisible,
    handleAdd,
    handleRemoveCharacter,
  };
}
