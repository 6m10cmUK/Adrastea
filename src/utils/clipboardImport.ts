import type { Character, BoardObject, Scene, BgmTrack } from '../types/adrastea.types';

export interface ScenarioTextClipData {
  title?: string;
  content?: string;
  speaker_character_id?: string | null;
  speaker_name?: string | null;
  channel_id?: string | null;
}

export type ClipboardParseResult =
  | { type: 'character'; data: Partial<Character>[]; }
  | { type: 'object'; data: Partial<BoardObject>[]; }
  | { type: 'scene'; data: { scene: Partial<Scene>; objects: Partial<BoardObject>[]; bgms: Partial<BgmTrack>[] }[] }
  | { type: 'bgm'; data: Partial<BgmTrack>[]; }
  | { type: 'scenario_text'; data: ScenarioTextClipData[]; }
  | { type: 'unknown'; kind: string }
  | null;

/**
 * クリップボードテキストを解析し、Adrastea のデータ型に変換する
 */
export function parseClipboardData(text: string): ClipboardParseResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    // JSON ですらない
    return null;
  }

  // parsed が object ではない、または null の場合
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  const obj = parsed as Record<string, unknown>;

  // kind プロパティがない場合
  if (!('kind' in obj)) {
    return null;
  }

  const kind = obj.kind;

  // kind が character の場合
  if (kind === 'character') {
    const items = Array.isArray(obj.data) ? obj.data.map(parseCharacterData) : [parseCharacterData(obj.data)];
    return { type: 'character', data: items };
  }

  // kind が object の場合
  if (kind === 'object') {
    const items = Array.isArray(obj.data) ? obj.data.map(parseObjectData) : [parseObjectData(obj.data)];
    return { type: 'object', data: items };
  }

  // kind が scene の場合
  if (kind === 'scene') {
    const items = Array.isArray(obj.data) ? obj.data.map(parseSceneData) : [parseSceneData(obj.data)];
    return { type: 'scene', data: items };
  }

  // kind が bgm の場合
  if (kind === 'bgm') {
    const items = Array.isArray(obj.data) ? obj.data.map(parseBgmData) : [parseBgmData(obj.data)];
    return { type: 'bgm', data: items };
  }

  // kind が scenario_text の場合
  if (kind === 'scenario_text') {
    const parseOne = (raw: unknown): ScenarioTextClipData => {
      if (typeof raw !== 'object' || raw === null) return {};
      const r = raw as Record<string, unknown>;
      return {
        title: typeof r.title === 'string' ? r.title : undefined,
        content: typeof r.content === 'string' ? r.content : undefined,
        speaker_character_id: typeof r.speaker_character_id === 'string' ? r.speaker_character_id : null,
        speaker_name: typeof r.speaker_name === 'string' ? r.speaker_name : null,
        channel_id: typeof r.channel_id === 'string' ? r.channel_id : null,
      };
    };
    const items = Array.isArray(obj.data) ? obj.data.map(parseOne) : [parseOne(obj.data)];
    return { type: 'scenario_text', data: items };
  }

  // kind が存在するが対応していない場合
  if (typeof kind === 'string') {
    return { type: 'unknown', kind };
  }

  return null;
}

/**
 * character データをパースする。
 * Adrastea ネイティブフィールドがあればそのまま採用し、
 * なければ iachara 互換フィールドからフォールバック変換する。
 */
function parseCharacterData(raw: unknown): Partial<Character> {
  if (typeof raw !== 'object' || raw === null) {
    return {};
  }

  const obj = raw as Record<string, unknown>;
  const result: Partial<Character> = {};

  // --- Adrastea ネイティブフィールド（あればそのまま採用） ---
  if (typeof obj.name === 'string') result.name = obj.name;
  if (typeof obj.color === 'string') result.color = obj.color;
  else result.color = '#555555';
  if (Array.isArray(obj.images)) result.images = obj.images as Character['images'];
  if (typeof obj.active_image_index === 'number') result.active_image_index = obj.active_image_index;
  if (typeof obj.sheet_url === 'string' || obj.sheet_url === null) result.sheet_url = obj.sheet_url as string | null;
  if (typeof obj.initiative === 'number') result.initiative = obj.initiative;
  if (typeof obj.size === 'number') result.size = obj.size;
  if (Array.isArray(obj.statuses)) result.statuses = obj.statuses as Character['statuses'];
  if (Array.isArray(obj.parameters)) result.parameters = obj.parameters as Character['parameters'];
  if (typeof obj.memo === 'string') result.memo = obj.memo;
  if (typeof obj.secret_memo === 'string') result.secret_memo = obj.secret_memo;
  if (typeof obj.chat_palette === 'string') result.chat_palette = obj.chat_palette;
  if (typeof obj.is_status_private === 'boolean') result.is_status_private = obj.is_status_private;
  if (typeof obj.is_hidden_on_board === 'boolean') result.is_hidden_on_board = obj.is_hidden_on_board;
  if (typeof obj.board_x === 'number') result.board_x = obj.board_x;
  if (typeof obj.board_y === 'number') result.board_y = obj.board_y;
  if (typeof obj.board_visible === 'boolean') result.board_visible = obj.board_visible;

  // --- iachara 互換フォールバック ---
  if (!result.images && typeof obj.iconUrl === 'string' && obj.iconUrl) {
    result.images = [{ asset_id: obj.iconUrl, label: 'メイン' }];
    result.active_image_index = 0;
  }
  if (result.sheet_url === undefined && (typeof obj.externalUrl === 'string' || obj.externalUrl === null)) {
    result.sheet_url = obj.externalUrl as string | null;
  }
  if (result.initiative === undefined && obj.initiative !== undefined) {
    result.initiative = Number(obj.initiative) || 0;
  }
  if (!result.statuses && Array.isArray(obj.status)) {
    result.statuses = obj.status.map((s: unknown) => {
      if (typeof s !== 'object' || s === null) return { label: '', value: 0, max: 0 };
      const so = s as Record<string, unknown>;
      return { label: typeof so.label === 'string' ? so.label : '', value: Number(so.value) || 0, max: Number(so.max) || 0 };
    });
  }
  if (!result.parameters && Array.isArray(obj.params)) {
    result.parameters = obj.params.map((p: unknown) => {
      if (typeof p !== 'object' || p === null) return { label: '', value: '' };
      const po = p as Record<string, unknown>;
      return { label: typeof po.label === 'string' ? po.label : '', value: typeof po.value === 'string' ? po.value : '' };
    });
  }
  if (!result.chat_palette && typeof obj.commands === 'string') {
    result.chat_palette = obj.commands;
  }

  return result;
}

/**
 * object データをパースする。
 */
function parseObjectData(raw: unknown): Partial<BoardObject> {
  if (typeof raw !== 'object' || raw === null) {
    return {};
  }

  const obj = raw as Record<string, unknown>;
  const result: Partial<BoardObject> = {};

  if (typeof obj.type === 'string') result.type = obj.type as BoardObject['type'];
  if (typeof obj.name === 'string') result.name = obj.name;
  // 旧形式の global をサポート（互換性）
  if (typeof obj.global === 'boolean') result.is_global = obj.global;
  if (typeof obj.is_global === 'boolean') result.is_global = obj.is_global;
  // scene_ids は含めない。scene_start_id/scene_end_id は貼り付け先のシーンで決定
  if (typeof obj.x === 'number') result.x = obj.x;
  if (typeof obj.y === 'number') result.y = obj.y;
  if (typeof obj.width === 'number') result.width = obj.width;
  if (typeof obj.height === 'number') result.height = obj.height;
  if (typeof obj.sort_order === 'number') result.sort_order = obj.sort_order;
  if (typeof obj.visible === 'boolean') result.visible = obj.visible;
  if (typeof obj.opacity === 'number') result.opacity = obj.opacity;
  if (typeof obj.position_locked === 'boolean') result.position_locked = obj.position_locked;
  if (typeof obj.size_locked === 'boolean') result.size_locked = obj.size_locked;
  if (typeof obj.image_asset_id === 'string' || obj.image_asset_id === null) {
    result.image_asset_id = obj.image_asset_id as string | null;
  }
  if (typeof obj.background_color === 'string') result.background_color = obj.background_color;
  if (typeof obj.color_enabled === 'boolean') result.color_enabled = obj.color_enabled;
  if (typeof obj.image_fit === 'string') result.image_fit = obj.image_fit as BoardObject['image_fit'];
  if (typeof obj.text_content === 'string' || obj.text_content === null) result.text_content = obj.text_content as string | null;
  if (typeof obj.font_size === 'number') result.font_size = obj.font_size;
  if (typeof obj.font_family === 'string') result.font_family = obj.font_family;
  if (typeof obj.letter_spacing === 'number') result.letter_spacing = obj.letter_spacing;
  if (typeof obj.line_height === 'number') result.line_height = obj.line_height;
  if (typeof obj.auto_size === 'boolean') result.auto_size = obj.auto_size;
  if (typeof obj.text_align === 'string') result.text_align = obj.text_align as BoardObject['text_align'];
  if (typeof obj.text_vertical_align === 'string') result.text_vertical_align = obj.text_vertical_align as BoardObject['text_vertical_align'];
  if (typeof obj.text_color === 'string') result.text_color = obj.text_color;
  if (typeof obj.scale_x === 'number') result.scale_x = obj.scale_x;
  if (typeof obj.scale_y === 'number') result.scale_y = obj.scale_y;
  if (typeof obj.memo === 'string') result.memo = obj.memo;
  // scenes テーブル由来のフィールド（bg/fg コピペ用）
  const extra = result as Record<string, unknown>;
  if (typeof obj.bg_color_enabled === 'boolean') extra.bg_color_enabled = obj.bg_color_enabled;
  if (typeof obj.bg_color === 'string') extra.bg_color = obj.bg_color;
  if (typeof obj.fg_color_enabled === 'boolean') extra.fg_color_enabled = obj.fg_color_enabled;
  if (typeof obj.fg_color === 'string') extra.fg_color = obj.fg_color;

  return result;
}

/**
 * メタフィールド（ID、作成日時、更新日時等）を除去する共通ユーティリティ
 */
const META_KEYS = ['id', '_id', '_creationTime', 'room_id', 'created_at', 'updated_at', 'sort_order'] as const;

function stripMeta<T extends Record<string, unknown>>(obj: T, extraKeys: string[] = []): Record<string, unknown> {
  const keysToRemove = new Set<string>([...META_KEYS, ...extraKeys]);
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!keysToRemove.has(k)) result[k] = v;
  }
  return result;
}

/**
 * Character をクリップボード JSON 文字列に変換する。
 * Adrastea ネイティブフィールドをすべて含み、iachara 互換フィールドも付与する。
 */
function characterToData(char: Character): Record<string, unknown> {
  const data: Record<string, unknown> = stripMeta(char as any, ['owner_id']);
  data.iconUrl = char.images?.[char.active_image_index ?? 0]?.asset_id ?? null;
  data.externalUrl = char.sheet_url ?? null;
  if (char.statuses && char.statuses.length > 0) {
    data.status = char.statuses.map(s => ({ label: s.label, value: s.value, max: s.max }));
  }
  if (char.parameters && char.parameters.length > 0) {
    data.params = char.parameters.map(p => ({ label: p.label, value: p.value }));
  }
  if (char.chat_palette) {
    data.commands = char.chat_palette;
  }
  return data;
}

export function characterToClipboardJson(chars: Character | Character[]): string {
  const arr = Array.isArray(chars) ? chars : [chars];
  const data = arr.length === 1 ? characterToData(arr[0]) : arr.map(characterToData);
  return JSON.stringify({ kind: 'character', data });
}

/**
 * BoardObject をクリップボード JSON 文字列に変換する。
 */
function objectToData(obj: BoardObject): Record<string, unknown> {
  const data: Record<string, unknown> = {
    type: obj.type, name: obj.name, is_global: obj.is_global,
    x: obj.x, y: obj.y, width: obj.width, height: obj.height,
    visible: obj.visible, opacity: obj.opacity, sort_order: obj.sort_order,
    position_locked: obj.position_locked, size_locked: obj.size_locked,
  };
  if (obj.memo) data.memo = obj.memo;
  if (obj.type === 'text') {
    Object.assign(data, {
      text_content: obj.text_content, font_size: obj.font_size, font_family: obj.font_family,
      letter_spacing: obj.letter_spacing, line_height: obj.line_height, auto_size: obj.auto_size,
      text_align: obj.text_align, text_vertical_align: obj.text_vertical_align, text_color: obj.text_color,
      background_color: obj.background_color, color_enabled: obj.color_enabled,
    });
  } else {
    Object.assign(data, {
      image_asset_id: obj.image_asset_id,
      background_color: obj.background_color, color_enabled: obj.color_enabled, image_fit: obj.image_fit,
      scale_x: obj.scale_x, scale_y: obj.scale_y,
    });
  }
  return data;
}

export function objectToClipboardJson(objs: BoardObject | BoardObject[], activeScene?: Scene | null): string {
  const arr = Array.isArray(objs) ? objs : [objs];
  const items = arr.map(obj => {
    const data = objectToData(obj);
    // bg/fg の画像・色設定は scenes テーブルにあるため、activeScene からマージ
    if (activeScene) {
      if (obj.type === 'background') {
        data.image_asset_id = activeScene.background_asset_id ?? null;
        data.bg_color = activeScene.bg_color;
        data.bg_color_enabled = activeScene.bg_color_enabled;
      } else if (obj.type === 'foreground') {
        data.image_asset_id = activeScene.foreground_asset_id ?? null;
        data.fg_color = activeScene.fg_color;
        data.fg_color_enabled = activeScene.fg_color_enabled;
        data.opacity = activeScene.foreground_opacity;
      }
    }
    return data;
  });
  const data = items.length === 1 ? items[0] : items;
  return JSON.stringify({ kind: 'object', data });
}

/**
 * scene データをパースする。
 */
function parseSceneData(raw: unknown): { scene: Partial<Scene>; objects: Partial<BoardObject>[]; bgms: Partial<BgmTrack>[] } {
  if (typeof raw !== 'object' || raw === null) return { scene: {}, objects: [], bgms: [] };
  const obj = raw as Record<string, unknown>;
  const scene: Partial<Scene> = {};
  if (typeof obj.name === 'string') scene.name = obj.name;
  if (typeof obj.background_asset_id === 'string' || obj.background_asset_id === null) scene.background_asset_id = obj.background_asset_id as string | null;
  if (typeof obj.foreground_asset_id === 'string' || obj.foreground_asset_id === null) scene.foreground_asset_id = obj.foreground_asset_id as string | null;
  if (typeof obj.foreground_opacity === 'number') scene.foreground_opacity = obj.foreground_opacity;
  if (typeof obj.bg_transition === 'string') scene.bg_transition = obj.bg_transition as Scene['bg_transition'];
  if (typeof obj.bg_transition_duration === 'number') scene.bg_transition_duration = obj.bg_transition_duration;
  if (typeof obj.fg_transition === 'string') scene.fg_transition = obj.fg_transition as Scene['fg_transition'];
  if (typeof obj.fg_transition_duration === 'number') scene.fg_transition_duration = obj.fg_transition_duration;
  if (typeof obj.bg_blur === 'boolean') scene.bg_blur = obj.bg_blur;
  if (typeof obj.bg_color_enabled === 'boolean') scene.bg_color_enabled = obj.bg_color_enabled;
  if (typeof obj.bg_color === 'string') scene.bg_color = obj.bg_color;
  if (typeof obj.fg_color_enabled === 'boolean') scene.fg_color_enabled = obj.fg_color_enabled;
  if (typeof obj.fg_color === 'string') scene.fg_color = obj.fg_color;
  if (typeof obj.foreground_x === 'number') scene.foreground_x = obj.foreground_x;
  if (typeof obj.foreground_y === 'number') scene.foreground_y = obj.foreground_y;
  if (typeof obj.foreground_width === 'number') scene.foreground_width = obj.foreground_width;
  if (typeof obj.foreground_height === 'number') scene.foreground_height = obj.foreground_height;

  const objects: Partial<BoardObject>[] = [];
  if (Array.isArray(obj.objects)) {
    for (const o of obj.objects) {
      if (typeof o === 'object' && o !== null) objects.push(parseObjectData(o));
    }
  }
  const bgms: Partial<BgmTrack>[] = [];
  if (Array.isArray(obj.bgms)) {
    for (const b of obj.bgms) {
      if (typeof b === 'object' && b !== null) bgms.push(parseBgmData(b));
    }
  }
  return { scene, objects, bgms };
}

function parseBgmData(raw: unknown): Partial<BgmTrack> {
  if (typeof raw !== 'object' || raw === null) return {};
  const obj = raw as Record<string, unknown>;
  const result: Partial<BgmTrack> = {};
  if (typeof obj.name === 'string') result.name = obj.name;
  if (typeof obj.bgm_type === 'string') result.bgm_type = obj.bgm_type as BgmTrack['bgm_type'];
  if (typeof obj.bgm_source === 'string' || obj.bgm_source === null) result.bgm_source = obj.bgm_source as string | null;
  if (typeof obj.bgm_volume === 'number') result.bgm_volume = obj.bgm_volume;
  if (typeof obj.bgm_loop === 'boolean') result.bgm_loop = obj.bgm_loop;
  if (typeof obj.fade_in === 'boolean') result.fade_in = obj.fade_in;
  if (typeof obj.fade_in_duration === 'number') result.fade_in_duration = obj.fade_in_duration;
  return result;
}

/**
 * BgmTrack をクリップボード JSON 文字列に変換する。
 * scene_start_id, scene_end_id, auto_play, is_playing, is_paused 等の再生状態は含めない。
 */
function bgmToData(bgm: BgmTrack): Record<string, unknown> {
  return stripMeta(bgm as any, ['scene_ids', 'auto_play_scene_ids', 'scene_start_id', 'scene_end_id', 'auto_play', 'is_playing', 'is_paused']);
}

export function bgmToClipboardJson(bgms: BgmTrack | BgmTrack[]): string {
  const arr = Array.isArray(bgms) ? bgms : [bgms];
  const data = arr.length === 1 ? bgmToData(arr[0]) : arr.map(bgmToData);
  return JSON.stringify({ kind: 'bgm', data });
}

/**
 * Scene とそのシーンに属するオブジェクト群をクリップボード JSON に変換する。
 */
function sceneToData(scene: Scene, sceneObjects: BoardObject[], sceneBgms: BgmTrack[]): Record<string, unknown> {
  const sceneRest = stripMeta(scene as any);
  const objs = sceneObjects
    .filter(o => o.type !== 'characters_layer' && o.type !== 'background' && o.type !== 'foreground')
    .map(o => objectToData(o));
  const bgms = sceneBgms.map(b => bgmToData(b));
  return { ...sceneRest, objects: objs, bgms };
}

export function sceneToClipboardJson(
  scenes: Scene | Scene[],
  allObjects: BoardObject[],
  allBgms: BgmTrack[] = [],
): string {
  const arr = Array.isArray(scenes) ? scenes : [scenes];
  const items = arr.map(s => {
    // オブジェクトのフィルタリング: is_global=false でかつシーンの範囲に含まれるもの
    const objs = allObjects.filter(o => {
      if (o.is_global) return false; // グローバルオブジェクトは含めない
      if (!o.scene_start_id || !o.scene_end_id) return false;
      const startIdx = arr.findIndex(x => x.id === o.scene_start_id);
      const endIdx = arr.findIndex(x => x.id === o.scene_end_id);
      const sceneIdx = arr.findIndex(x => x.id === s.id);
      if (startIdx < 0 || endIdx < 0 || sceneIdx < 0) return false;
      return startIdx <= sceneIdx && sceneIdx <= endIdx;
    });
    const bgms = allBgms.filter(b => {
      if (b.is_global) return true;
      if (!b.scene_start_id || !b.scene_end_id) return false;
      const startIdx = arr.findIndex(x => x.id === b.scene_start_id);
      const endIdx = arr.findIndex(x => x.id === b.scene_end_id);
      const sceneIdx = arr.findIndex(x => x.id === s.id);
      if (startIdx < 0 || endIdx < 0 || sceneIdx < 0) return false;
      return startIdx <= sceneIdx && sceneIdx <= endIdx;
    });
    return sceneToData(s, objs, bgms);
  });
  const data = items.length === 1 ? items[0] : items;
  return JSON.stringify({ kind: 'scene', data });
}

/**
 * BGM をシーンにペーストする共通処理。
 * 同じソースの既存トラックがあれば scene_ids に追加、なければ新規作成。
 */
export async function pasteBgmToScene(
  data: Partial<BgmTrack>,
  sceneId: string | null,
  ctx: {
    bgms: BgmTrack[];
    updateBgm: (id: string, data: Partial<BgmTrack>) => Promise<void>;
    addBgm: (data: Partial<BgmTrack>) => Promise<any>;
  },
): Promise<void> {
  if (!sceneId) return; // シーンがなければ何もしない
  const existing = ctx.bgms.find(b => b.bgm_source === data.bgm_source && b.bgm_type === data.bgm_type);
  if (existing) {
    // 既存BGMは range に含まれるかで判定。含まれなければ range を拡張（簡略版: end を拡張）
    // 詳細: scene_start_id が既に設定されている前提で、新シーンが end より後ろなら end を更新
    // ここでは単純に、新規ペースト時は end を新シーンに変更
    if (existing.scene_end_id !== sceneId) {
      await ctx.updateBgm(existing.id, {
        scene_end_id: sceneId,
      });
    }
  } else {
    // 新規作成時は新シーンを start と end に設定
    await ctx.addBgm({
      ...data,
      is_global: false,
      scene_start_id: sceneId,
      scene_end_id: sceneId,
      auto_play: true,
    });
  }
}

/**
 * クリップボードからシーンをペーストする共通処理。
 */
export async function pasteSceneFromClipboard(
  items: { scene: Partial<Scene>; objects: Partial<BoardObject>[]; bgms: Partial<BgmTrack>[] }[],
  ctx: {
    addScene: (data: Partial<any>, dup?: string, objs?: BoardObject[]) => Promise<{ scene: { id: string } } | null>;
    addObject: (data: Partial<BoardObject>) => Promise<string>;
    bgms: BgmTrack[];
    updateBgm: (id: string, data: Partial<BgmTrack>) => Promise<void>;
    addBgm: (data: Partial<BgmTrack>) => Promise<any>;

  },
): Promise<void> {
  for (const { scene, objects, bgms } of items) {
    const result = await ctx.addScene({
      name: scene.name ? `${scene.name} (コピー)` : '新規シーン',
      background_asset_id: scene.background_asset_id ?? null,
      foreground_asset_id: scene.foreground_asset_id ?? null,
      foreground_opacity: scene.foreground_opacity,
      bg_transition: scene.bg_transition,
      bg_transition_duration: scene.bg_transition_duration,
      fg_transition: scene.fg_transition,
      fg_transition_duration: scene.fg_transition_duration,
      bg_blur: scene.bg_blur,
      bg_color_enabled: scene.bg_color_enabled,
      bg_color: scene.bg_color,
      fg_color_enabled: scene.fg_color_enabled,
      fg_color: scene.fg_color,
      foreground_x: scene.foreground_x,
      foreground_y: scene.foreground_y,
      foreground_width: scene.foreground_width,
      foreground_height: scene.foreground_height,
    }, '_paste_', []);
    if (!result) continue;
    const newSceneId = result.scene.id;
    const sorted = [...objects].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    // オブジェクトは scene_start_id/scene_end_id で範囲指定
    await Promise.all(sorted.map(obj => ctx.addObject({ ...obj, is_global: false, scene_start_id: newSceneId, scene_end_id: newSceneId })));
    await Promise.all(bgms.map(bgm => pasteBgmToScene(bgm, newSceneId, ctx)));
  }
  // シーン貼り付け時はアクティブシーンを切り替えない
}
