import { useEffect, useCallback } from 'react';
import { parseClipboardData } from '../utils/clipboardImport';
import type { ScenarioTextClipData } from '../utils/clipboardImport';
import type { Character, BoardObject, Scene, BgmTrack } from '../types/adrastea.types';
import { generateDuplicateName } from '../utils/nameUtils';

export interface UsePasteHandlerOptions {
  addCharacter: (data: Partial<Character>) => Promise<any>;
  addObject?: (data: Partial<BoardObject>) => Promise<any>;
  addScene?: (data: { scene: Partial<Scene>; objects: Partial<BoardObject>[]; bgms: Partial<BgmTrack>[] }[]) => Promise<any>;
  addBgm?: (data: Partial<BgmTrack>) => Promise<any>;
  addScenarioText?: (data: ScenarioTextClipData) => Promise<any>;
  showToast: (message: string, type: 'success' | 'error') => void;
  updateObject?: (id: string, data: Partial<BoardObject>) => Promise<void>;
  updateScene?: (sceneId: string, data: Partial<Scene>) => Promise<void>;
  allObjects?: BoardObject[];
  activeSceneId?: string | null;
  existingCharacterNames?: string[];
  existingScenarioTitles?: string[];
}

/**
 * クリップボードのテキスト内容をハンドルする共通ロジック
 * paste イベントハンドラ、またはコンテキストメニューからの呼び出し用
 */
export async function handleClipboardImport(
  text: string,
  addCharacter: (data: Partial<Character>) => Promise<any>,
  showToast: (message: string, type: 'success' | 'error') => void,
  addObject?: (data: Partial<BoardObject>) => Promise<any>,
  addScene?: (data: { scene: Partial<Scene>; objects: Partial<BoardObject>[]; bgms: Partial<BgmTrack>[] }[]) => Promise<any>,
  addBgm?: (data: Partial<BgmTrack>) => Promise<any>,
  _updateObject?: (id: string, data: Partial<BoardObject>) => Promise<void>,
  allObjects?: BoardObject[],
  activeSceneId?: string | null,
  addScenarioText?: (data: ScenarioTextClipData) => Promise<any>,
  existingCharacterNames?: string[],
  existingScenarioTitles?: string[],
  updateScene?: (sceneId: string, data: Partial<Scene>) => Promise<void>,
): Promise<void> {
  const result = parseClipboardData(text);

  if (result === null) {
    // 対応フォーマットではない（JSON ではない、kind プロパティなし）
    // 何もしない
    return;
  }

  if (result.type === 'unknown') {
    showToast('対応していない形式です', 'error');
    return;
  }

  if (result.type === 'character') {
    try {
      await Promise.all(result.data.map(d => addCharacter({ ...d, name: d.name ? generateDuplicateName(d.name, existingCharacterNames) : undefined })));
      const count = result.data.length;
      showToast(count > 1 ? `${count}件のキャラクターをインポートしました` : `キャラクター "${result.data[0]?.name ?? '不明'}" をインポートしました`, 'success');
    } catch {
      showToast('インポートに失敗しました', 'error');
    }
  }

  if (result.type === 'object') {
    if (!addObject) return;
    try {
      for (const d of result.data) {
        if ((d.type === 'foreground' || d.type === 'background') && updateScene && activeSceneId) {
          // 前景/背景は scenes テーブルを上書き
          const sceneUpdates: Partial<Scene> = {};
          if (d.type === 'background') {
            if (d.image_asset_id !== undefined) sceneUpdates.background_asset_id = d.image_asset_id;
            if ((d as any).bg_color !== undefined) sceneUpdates.bg_color = (d as any).bg_color;
            if ((d as any).bg_color_enabled !== undefined) sceneUpdates.bg_color_enabled = (d as any).bg_color_enabled;
          } else {
            if (d.image_asset_id !== undefined) sceneUpdates.foreground_asset_id = d.image_asset_id;
            if ((d as any).fg_color !== undefined) sceneUpdates.fg_color = (d as any).fg_color;
            if ((d as any).fg_color_enabled !== undefined) sceneUpdates.fg_color_enabled = (d as any).fg_color_enabled;
            if (d.opacity !== undefined) sceneUpdates.foreground_opacity = d.opacity;
          }
          if (Object.keys(sceneUpdates).length > 0) {
            await updateScene(activeSceneId, sceneUpdates);
            showToast(`${d.type === 'foreground' ? '前景' : '背景'}を上書きしました`, 'success');
          }
          continue;
        }
        const objToAdd = { ...d, name: d.name ? generateDuplicateName(d.name, allObjects?.map(o => o.name)) : undefined };
        await addObject(objToAdd);
      }
      const nonFgBg = result.data.filter(d => d.type !== 'foreground' && d.type !== 'background');
      if (nonFgBg.length > 0) {
        showToast(nonFgBg.length > 1 ? `${nonFgBg.length}件のオブジェクトをインポートしました` : `オブジェクト "${nonFgBg[0]?.name ?? 'オブジェクト'}" をインポートしました`, 'success');
      }
    } catch {
      showToast('インポートに失敗しました', 'error');
    }
  }

  if (result.type === 'scene') {
    if (!addScene) return;
    try {
      await addScene(result.data);
      const count = result.data.length;
      showToast(count > 1 ? `${count}件のシーンをインポートしました` : `シーン "${result.data[0]?.scene.name ?? 'シーン'}" をインポートしました`, 'success');
    } catch {
      showToast('インポートに失敗しました', 'error');
    }
  }

  if (result.type === 'bgm') {
    if (!addBgm) return;
    try {
      await Promise.all(result.data.map(d => addBgm(d)));
      const count = result.data.length;
      showToast(count > 1 ? `${count}件のBGMをインポートしました` : `BGM "${result.data[0]?.name ?? 'BGM'}" をインポートしました`, 'success');
    } catch {
      showToast('インポートに失敗しました', 'error');
    }
  }

  if (result.type === 'scenario_text') {
    if (!addScenarioText) return;
    try {
      await Promise.all(result.data.map(d => addScenarioText({
        title: d.title ? generateDuplicateName(d.title, existingScenarioTitles) : '新規テキストメモ',
        content: d.content ?? '',
        speaker_character_id: d.speaker_character_id ?? null,
        speaker_name: d.speaker_name ?? null,
        channel_id: d.channel_id ?? null,
      })));
      const count = result.data.length;
      showToast(count > 1 ? `${count}件のテキストメモをインポートしました` : 'テキストメモを貼り付けました', 'success');
    } catch {
      showToast('インポートに失敗しました', 'error');
    }
  }
}

/**
 * グローバル paste イベントを監視し、
 * クリップボード内容に応じてキャラクターインポートやトースト表示を行うフック
 */
export function usePasteHandler({ addCharacter, addObject, addScene, addBgm, addScenarioText, showToast, updateObject, updateScene, allObjects, activeSceneId, existingCharacterNames, existingScenarioTitles }: UsePasteHandlerOptions): void {
  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      // テキスト入力中はスキップ（通常のペースト動作を妨げない）
      const activeElement = document.activeElement as HTMLElement | null;
      if (activeElement) {
        const tagName = activeElement.tagName;
        if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
          return;
        }
        if (activeElement.contentEditable === 'true') {
          return;
        }
      }

      const text = e.clipboardData?.getData('text/plain');
      if (!text) {
        return;
      }

      // フォーマット判定を同期的に行い、対象なら preventDefault
      const result = parseClipboardData(text);
      if (result === null) {
        return;
      }
      e.preventDefault();

      // 非同期でインポート処理
      handleClipboardImport(text, addCharacter, showToast, addObject, addScene, addBgm, updateObject, allObjects, activeSceneId, addScenarioText, existingCharacterNames, existingScenarioTitles, updateScene);
    },
    [addCharacter, addObject, addScene, addBgm, addScenarioText, showToast, updateObject, updateScene, allObjects, activeSceneId, existingCharacterNames, existingScenarioTitles],
  );

  useEffect(() => {
    document.addEventListener('paste', handlePaste as EventListener);
    return () => {
      document.removeEventListener('paste', handlePaste as EventListener);
    };
  }, [handlePaste]);
}
