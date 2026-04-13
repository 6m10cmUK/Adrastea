/**
 * Adrastea - TRPG盤面共有ツール 型定義
 *
 * Firestore構成:
 *   rooms/{roomId}                                      → Room
 *   rooms/{roomId}/pieces/{pieceId}                     → Piece
 *   rooms/{roomId}/messages/{msgId}                     → ChatMessage
 *   rooms/{roomId}/scenes/{sceneId}                     → Scene
 *   rooms/{roomId}/objects/{objectId}                   → BoardObject (is_global + scene_start_id/scene_end_id)
 *   rooms/{roomId}/bgms/{bgmId}                         → BgmTrack
 *   rooms/{roomId}/characters/{charId}                  → Character
 *   rooms/{roomId}/scenario_texts/{textId}              → ScenarioText
 *   rooms/{roomId}/cutins/{cutinId}                     → Cutin
 */

export interface ActiveCutin {
  cutin_id: string;
  triggered_at: number;
}

export interface Room {
  id: string;
  owner_id: string;
  name: string;
  description?: string;
  tags?: string[];
  active_scene_id: string | null;
  thumbnail_asset_id?: string | null;
  active_cutin: ActiveCutin | null;
  dice_system: string;
  gm_can_see_secret_memo: boolean;
  default_login_role?: 'sub_owner' | 'user' | 'guest';
  /** false のときステータス変更をチャットに流さない（未設定は true 扱い） */
  status_change_chat_enabled?: boolean;
  /** 通知先チャンネル ID（既定 main） */
  status_change_chat_channel?: string;
  grid_visible: boolean;
  created_at: number;
  updated_at: number;
}

export interface Scene {
  id: string;
  room_id: string;
  name: string;
  background_asset_id?: string | null;
  foreground_asset_id?: string | null;
  foreground_opacity: number;
  bg_transition: 'none' | 'fade';
  bg_transition_duration: number;
  fg_transition: 'none' | 'fade';
  fg_transition_duration: number;
  bg_blur: boolean;
  bg_color_enabled: boolean;
  bg_color: string;
  fg_color_enabled: boolean;
  fg_color: string;
  foreground_x: number;
  foreground_y: number;
  foreground_width: number;
  foreground_height: number;
  grid_visible?: boolean;
  position: number;
  created_at: number;
  updated_at: number;
}

export interface CharacterStatus {
  label: string;
  value: number;
  max: number | null;
  color?: string;
}

export interface CharacterImage {
  asset_id: string | null;
  label: string;
}

export interface CharacterParameter {
  label: string;
  value: number | string;
}


export interface Character {
  id: string;
  room_id: string;
  owner_id: string;
  name: string;
  images: CharacterImage[];
  active_image_index: number;
  color: string;
  sheet_url: string | null;
  initiative: number;
  size: number;
  statuses: CharacterStatus[];
  parameters: CharacterParameter[];
  memo: string;
  secret_memo: string;
  chat_palette: string;
  is_status_private: boolean;
  is_hidden_on_board: boolean;
  sort_order: number;
  board_x?: number;
  board_y?: number;
  board_rotation?: number;
  board_visible?: boolean;
  created_at: number;
  updated_at: number;
}

// --- BoardObject (統合オブジェクト) ---

export type BoardObjectType = 'panel' | 'text' | 'foreground' | 'background' | 'characters_layer';

export interface BoardObject {
  id: string;
  room_id: string;
  type: BoardObjectType;
  name: string;

  // スコープ: is_global=true ならルームオブジェクト（全シーン共通）、false ならシーンオブジェクト（scene_start_id〜scene_end_id の範囲）
  is_global: boolean;
  scene_start_id: string | null;  // is_global=false の時のみ有効（必須）
  scene_end_id: string | null;    // is_global=false の時のみ有効（必須）

  // 位置・サイズ（グリッド単位: 1 = 1マス = GRID_SIZE px）
  x: number;
  y: number;
  width: number;
  height: number;

  // 表示制御
  visible: boolean;
  opacity: number;
  sort_order: number;
  position_locked: boolean;
  size_locked: boolean;

  // panel用
  image_asset_id: string | null;
  background_color: string;
  color_enabled?: boolean;
  image_fit: 'contain' | 'cover' | 'stretch';

  // text用
  text_content: string | null;
  font_size: number;
  font_family: string;
  letter_spacing: number;
  line_height: number;
  auto_size: boolean;
  text_align: 'left' | 'center' | 'right';
  text_vertical_align: 'top' | 'middle' | 'bottom';
  text_color: string;
  scale_x: number;
  scale_y: number;

  // 回転（度数、0-360）
  rotation: number;

  // メモ
  memo?: string;

  // メタ
  created_at: number;
  updated_at: number;
}

export interface ScenarioText {
  id: string;
  room_id: string;
  title: string;
  content: string;
  visible: boolean;
  speaker_character_id: string | null;
  speaker_name: string | null;
  channel_id: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface Cutin {
  id: string;
  room_id: string;
  name: string;
  image_asset_id?: string | null;
  text: string;
  animation: 'slide' | 'fade' | 'zoom';
  duration: number;
  text_color: string;
  background_color: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface BgmTrack {
  id: string;
  name: string;
  bgm_type: 'youtube' | 'url' | 'upload' | null;
  bgm_source: string | null;
  bgm_asset_id?: string | null;
  bgm_volume: number;
  bgm_loop: boolean;
  is_global: boolean;
  scene_start_id: string | null;
  scene_end_id: string | null;
  is_playing: boolean;
  is_paused: boolean;
  auto_play: boolean;
  fade_in: boolean;
  fade_in_duration: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface DiceResult {
  text: string;
  success: boolean | null;
  result: string;
  isSecret: boolean;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  sender_name: string;
  sender_uid?: string;
  sender_avatar_asset_id?: string | null;
  content: string;
  message_type: 'chat' | 'dice' | 'system' | 'secret_dice';
  channel?: string;
  allowed_user_ids?: string[];
  created_at: number;
  edited_at?: number | null;
  edited_by_uid?: string | null;
}

export interface UserProfile {
  uid: string;
  display_name: string;
  avatar_url: string | null;
  created_at: number;
  updated_at: number;
}

export interface Asset {
  id: string;
  uid: string;
  url: string;
  r2_key: string;
  filename: string;
  title: string;
  size_bytes: number;
  width: number;
  height: number;
  tags: string[];
  asset_type: 'image' | 'audio';
  created_at: number;
}

export interface ChatChannel {
  channel_id: string;
  label: string;
  order: number;
  is_archived: boolean;
  /** true のとき user は allowed_user_ids に含まれる場合のみ閲覧可。オーナー・サブオーナーは常に可 */
  is_private: boolean;
  /** user ロールで閲覧を許す UID（空でも is_private ならスタッフのみ可） */
  allowed_user_ids: string[];
}
