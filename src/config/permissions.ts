import type { RoomRole } from '../contexts/AdrasteaContext';

/** ロール階層（インデックスが大きいほど強い） */
export const ROLE_HIERARCHY: RoomRole[] = ['guest', 'user', 'sub_owner', 'owner'];

/** 各パーミッションキーに「最低限必要なロール」を定義 */
export const PERMISSION_MIN_ROLE = {
  // コミュニケーション
  chat_send: 'user',

  // ボード操作
  piece_move: 'user',
  object_move: 'user',

  // キャラクター
  character_edit: 'user',

  // シーン（sub_owner以上）
  scene_edit: 'sub_owner',

  // オブジェクト構造編集（ルームオブジェクト含む全オブジェクト）
  object_edit: 'sub_owner',

  // BGM・カットイン
  bgm_manage: 'sub_owner',
  cutin_manage: 'sub_owner',

  // レイヤー
  layer_manage: 'sub_owner',

  // パネル表示制御（guest は全パネル非表示）
  panel_scene: 'sub_owner',
  panel_character: 'user',
  panel_scenarioText: 'sub_owner',
  panel_chat: 'user',
  panel_board: 'user',
  panel_pdfViewer: 'user',
  panel_status: 'user',
  panel_bgm: 'sub_owner',
  panel_cutin: 'sub_owner',
  panel_layer: 'sub_owner',
  panel_property: 'user',
  panel_debug: 'owner',

  // オーナー専用
  room_settings: 'owner',
  role_assign: 'owner',
} as const satisfies Record<string, RoomRole>;

export type PermissionKey = keyof typeof PERMISSION_MIN_ROLE;

/** roleA >= roleB（roleAがroleBと同等以上の権限か） */
export function hasRole(myRole: RoomRole, requiredRole: RoomRole): boolean {
  return ROLE_HIERARCHY.indexOf(myRole) >= ROLE_HIERARCHY.indexOf(requiredRole);
}

/** myRole がパーミッションを持つか */
export function checkPermission(myRole: RoomRole, permission: PermissionKey): boolean {
  return hasRole(myRole, PERMISSION_MIN_ROLE[permission]);
}

/**
 * キャラデータのクリップボードコピーが許可されるか。
 * sub_owner 以上は対象を問わず可。user / guest は選択がすべて本人所有のときのみ可。
 */
export function canClipboardCopyCharacters(
  roomRole: RoomRole,
  characters: Array<{ owner_id: string }>,
  currentUserId: string
): boolean {
  if (characters.length === 0) return false;
  if (hasRole(roomRole, 'sub_owner')) return true;
  if (!currentUserId) return false;
  return characters.every((c) => c.owner_id === currentUserId);
}
