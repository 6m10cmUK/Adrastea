import type {
  Scene, BoardObject, Character, BgmTrack, Cutin, ChatMessage, Room, ScenarioText,
} from './adrastea.types';

/**
 * Persistence Injection パターン用インターフェース定義
 *
 * AdrasteaContext の各データレイヤーを inject として定義。
 * バックエンド（Supabase）と UI層の分離を実現する。
 */

// ---- Scenes Inject ----
export interface ScenesInject {
  data: Scene[];
  create: (scene: Scene) => Promise<void>;
  update: (id: string, data: Partial<Scene>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  createObjectBatch: (objects: BoardObject[]) => Promise<void>;
  removeObject?: (id: string) => Promise<void>;
  updateObject?: (id: string, data: Partial<BoardObject>) => Promise<void>;
  updateBgm?: (id: string, data: Partial<BgmTrack>) => Promise<void>;
  removeBgm?: (id: string) => Promise<void>;
}

// ---- Objects Inject ----
export interface ObjectsInject {
  data: BoardObject[];
  create: (object: BoardObject) => Promise<void>;
  update: (id: string, data: Partial<BoardObject>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reorder: (updates: { id: string; sort_order: number }[]) => Promise<void>;
  batchUpdateSort: (updates: { id: string; sort: number }[]) => Promise<void>;
}

// ---- Characters Inject ----
export interface CharactersInject {
  data: Character[];
  create: (char: Character) => Promise<void>;
  update: (id: string, data: Partial<Character>) => Promise<void>;
  move: (id: string, data: { board_x?: number; board_y?: number }) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

// ---- Bgms Inject ----
export interface BgmsInject {
  data: BgmTrack[];
  create: (bgm: BgmTrack) => Promise<void>;
  update: (id: string, data: Partial<BgmTrack>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

// ---- Cutins Inject ----
export interface CutinsInject {
  data: Cutin[];
  create: (cutin: Cutin) => Promise<void>;
  update: (id: string, data: Partial<Cutin>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reorder: (updates: { id: string; sort_order: number }[]) => Promise<void>;
  triggerCutin: (id: string) => void;
  clearCutin: () => void;
}

// ---- Chat Inject ----
export interface ChatInject {
  data: ChatMessage[];
  send: (
    senderName: string,
    content: string,
    messageType: ChatMessage['message_type'],
    senderUid?: string,
    senderAvatarAssetId?: string | null,
    diceSystem?: string,
    channel?: string,
    allowedUserIds?: string[],
  ) => Promise<ChatMessage | null>;
}

// ---- Adrastea Inject (Room) ----
export interface AdrasteaInject {
  roomData: Room;
  updateRoom: (data: Partial<Room>) => Promise<void>;
}

// ---- ScenarioTexts Inject ----
export interface ScenarioTextsInject {
  data: ScenarioText[];
  create: (text: ScenarioText) => Promise<void>;
  update: (id: string, data: Partial<ScenarioText>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reorder: (updates: { id: string; sort_order: number }[]) => Promise<void>;
}
