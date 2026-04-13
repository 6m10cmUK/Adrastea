import { useCallback } from 'react';
import { useThrottledCallback } from './useThrottledUpdate';
import { useAdrasteaContext } from '../contexts/AdrasteaContext';
import type { BoardObject, BoardObjectType } from '../types/adrastea.types';
import { isObjectActiveInScene } from './useObjects';
import { generateDuplicateName } from '../utils/nameUtils';

export function useLayerOperations() {
  const {
    activeObjects,
    allObjects,
    scenes,
    addObject,
    batchUpdateSort,
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

    // 空きトラック検索: アクティブシーンで OBJ が居ない sort_order を探す
    // ただし BG/FG/CL のトラック、is_global OBJ のトラックは使えない
    const findVacantTrack = (): number | null => {
      if (global || !activeScene) return null; // ルームOBJは常に新トラック
      const allSortOrders = new Set(allObjects.map(o => o.sort_order));
      for (const sortOrder of allSortOrders) {
        // BG/FG/CL のトラックはスキップ
        const occupants = allObjects.filter(o => o.sort_order === sortOrder);
        if (occupants.some(o => o.type === 'background' || o.type === 'foreground' || o.type === 'characters_layer')) continue;
        // is_global OBJ がいるトラックはスキップ
        if (occupants.some(o => o.is_global)) continue;
        // アクティブシーンで OBJ が居ないか確認
        const hasObjInScene = occupants.some(o => isObjectActiveInScene(o, activeScene.id, scenes));
        if (!hasObjInScene) return sortOrder;
      }
      return null;
    };

    let sortOrder: number;
    const vacantTrack = findVacantTrack();
    if (vacantTrack !== null) {
      sortOrder = vacantTrack;
    } else {
      // 空きトラックなし → 新トラック作成
      // 挿入位置を決定し、それ以降の sort_order を +1 シフト
      const cl = allObjects.find(o => o.type === 'characters_layer');
      const fg = allObjects.find(o => o.type === 'foreground');
      let insertAt: number;
      if (editingObjectId) {
        const selected = activeObjects.find(o => o.id === editingObjectId && o.type !== 'background' && o.type !== 'foreground' && o.type !== 'characters_layer');
        insertAt = selected ? selected.sort_order + 1 : (cl ? cl.sort_order : (fg ? fg.sort_order + 1 : 1));
      } else {
        // CL の直下に挿入
        insertAt = cl ? cl.sort_order : (fg ? fg.sort_order + 1 : 1);
      }
      // insertAt 以降の既存 OBJ の sort_order を +1 シフト
      const toShift = allObjects
        .filter(o => o.sort_order >= insertAt)
        .sort((a, b) => b.sort_order - a.sort_order); // 降順でシフト（衝突回避）
      if (toShift.length > 0) {
        const shiftUpdates = toShift.map(o => ({ id: o.id, sort: o.sort_order + 1 }));
        await batchUpdateSort(shiftUpdates);
      }
      sortOrder = insertAt;
    }

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
      is_global: global,
      scene_start_id: global ? null : (activeScene?.id ?? null),
      scene_end_id: global ? null : (activeScene?.id ?? null),
      ...(imageData?.assetId ? { image_asset_id: imageData.assetId } : {}),
    });
    if (newObjId) {
      setSelectedObjectIds([newObjId]);
      setEditingObjectId(newObjId);
      showToast(type === 'text' ? 'テキストを追加しました' : 'オブジェクトを追加しました', 'success');
    }
  }, [activeObjects, allObjects, scenes, editingObjectId, getBoardCenter, activeScene, addObject, batchUpdateSort, setSelectedObjectIds, setEditingObjectId, showToast]);

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
