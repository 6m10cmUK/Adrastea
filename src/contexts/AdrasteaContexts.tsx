// AdrasteaContext の責務分割版
// 3つのContextを別々に定義し、後方互換性を保つための型定義とコンテキスト

import React, { createContext } from 'react';
import type { DockviewApi } from 'dockview';
import type {
  Room,
  ChatMessage,
  Scene,
  Character,
  BoardObject,
  ScenarioText,
  Cutin,
  BgmTrack,
} from '../types/adrastea.types';
import type { useAdrastea } from '../hooks/useAdrastea';
import type { useAdrasteaChat } from '../hooks/useAdrasteaChat';
import type { useScenes } from '../hooks/useScenes';
import type { useCharacters } from '../hooks/useCharacters';
import type { useScenarioTexts } from '../hooks/useScenarioTexts';
import type { useCutins } from '../hooks/useCutins';
import type { PanelSelection } from './AdrasteaContext';

// ============================================================================
// CONTEXT 1: RoomDataContext
// ============================================================================

export interface RoomDataContextValue {
  // --- Rooms ---
  room: Room | null;
  updateRoom: ReturnType<typeof useAdrastea>['updateRoom'];

  // --- Chat ---
  messages: ChatMessage[];
  chatLoading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  sendMessage: ReturnType<typeof useAdrasteaChat>['sendMessage'];
  loadMore: ReturnType<typeof useAdrasteaChat>['loadMore'];
  clearMessages: ReturnType<typeof useAdrasteaChat>['clearMessages'];
  openSecretDice: ReturnType<typeof useAdrasteaChat>['openSecretDice'];
  editMessage: ReturnType<typeof useAdrasteaChat>['editMessage'];
  deleteMessage: ReturnType<typeof useAdrasteaChat>['deleteMessage'];
  handleSendMessage: (
    content: string,
    messageType: ChatMessage['message_type'],
    characterName?: string,
    characterAvatarAssetId?: string | null,
    channel?: string,
  ) => void;
  activeSpeakerCharId: string | null;
  setActiveSpeakerCharId: React.Dispatch<React.SetStateAction<string | null>>;

  // --- Scenes ---
  scenes: Scene[];
  addScene: ReturnType<typeof useScenes>['addScene'];
  updateScene: ReturnType<typeof useScenes>['updateScene'];
  removeScene: ReturnType<typeof useScenes>['removeScene'];
  reorderScenes: ReturnType<typeof useScenes>['reorderScenes'];
  activateScene: ReturnType<typeof useScenes>['activateScene'];

  // --- Characters ---
  characters: Character[];
  addCharacter: ReturnType<typeof useCharacters>['addCharacter'];
  updateCharacter: ReturnType<typeof useCharacters>['updateCharacter'];
  patchCharacterStatus: ReturnType<typeof useCharacters>['patchCharacterStatus'];
  removeCharacter: ReturnType<typeof useCharacters>['removeCharacter'];
  reorderCharacters: ReturnType<typeof useCharacters>['reorderCharacters'];

  // --- Objects ---
  allObjects: BoardObject[];
  activeObjects: BoardObject[];
  addObject: (data: Partial<BoardObject>) => Promise<string>;
  updateObject: (id: string, data: Partial<BoardObject>) => Promise<void>;
  moveObject: (id: string, data: Partial<BoardObject>) => Promise<void>;
  localUpdateObject: (id: string, data: Partial<BoardObject>) => void;
  removeObject: (id: string) => Promise<void>;
  reorderObjects: (orderedIds: string[]) => Promise<void>;
  batchUpdateSort: (updates: { id: string; sort: number }[]) => Promise<void>;

  // --- ScenarioTexts ---
  scenarioTexts: ScenarioText[];
  addScenarioText: ReturnType<typeof useScenarioTexts>['addScenarioText'];
  updateScenarioText: ReturnType<typeof useScenarioTexts>['updateScenarioText'];
  removeScenarioText: ReturnType<typeof useScenarioTexts>['removeScenarioText'];
  reorderScenarioTexts: ReturnType<typeof useScenarioTexts>['reorderScenarioTexts'];

  // --- Cutins ---
  cutins: Cutin[];
  addCutin: ReturnType<typeof useCutins>['addCutin'];
  updateCutin: ReturnType<typeof useCutins>['updateCutin'];
  removeCutin: ReturnType<typeof useCutins>['removeCutin'];
  reorderCutins: ReturnType<typeof useCutins>['reorderCutins'];
  triggerCutin: ReturnType<typeof useCutins>['triggerCutin'];
  clearCutin: ReturnType<typeof useCutins>['clearCutin'];

  // --- BGMs ---
  bgms: BgmTrack[];
  addBgm: (data: Partial<Omit<BgmTrack, 'id'>>) => Promise<string>;
  updateBgm: (id: string, data: Partial<BgmTrack>) => Promise<void>;
  removeBgm: (id: string) => Promise<void>;
  reorderBgms: (orderedIds: string[]) => Promise<void>;

  // --- Derived ---
  activeScene: Scene | null;
  dataReady: boolean;
}

export const RoomDataContext = createContext<RoomDataContextValue | null>(null);

// ============================================================================
// CONTEXT 2: UIStateContext
// ============================================================================

export interface UIStateContextValue {
  // --- UI editing state ---
  editingScene: Scene | null | undefined;
  setEditingScene: React.Dispatch<React.SetStateAction<Scene | null | undefined>>;
  editingCharacter: Character | null | undefined;
  setEditingCharacter: React.Dispatch<React.SetStateAction<Character | null | undefined>>;
  editingCutin: Cutin | null | undefined;
  setEditingCutin: React.Dispatch<React.SetStateAction<Cutin | null | undefined>>;
  editingBgmId: string | null;
  setEditingBgmId: React.Dispatch<React.SetStateAction<string | null>>;
  editingScenarioTextId: string | null;
  setEditingScenarioTextId: React.Dispatch<React.SetStateAction<string | null>>;
  editingObjectId: string | null | undefined;
  setEditingObjectId: React.Dispatch<React.SetStateAction<string | null | undefined>>;
  selectedObjectIds: string[];
  setSelectedObjectIds: React.Dispatch<React.SetStateAction<string[]>>;
  panelSelection: PanelSelection | null;
  setPanelSelection: React.Dispatch<React.SetStateAction<PanelSelection | null>>;
  showRoomSettings: boolean;
  setShowRoomSettings: (v: boolean) => void;
  showProfileEdit: boolean;
  setShowProfileEdit: (v: boolean) => void;
  showSettings: boolean;
  settingsSection: 'room' | 'layout' | 'user';
  setShowSettings: (show: boolean, section?: 'room' | 'layout' | 'user') => void;

  // --- BGM master volume ---
  masterVolume: number;
  setMasterVolume: (v: number) => void;
  bgmMuted: boolean;
  setBgmMuted: (v: boolean) => void;

  // --- Grid ---
  gridVisible: boolean;
  setGridVisible: React.Dispatch<React.SetStateAction<boolean>>;

  // --- Dockview ---
  dockviewApi: DockviewApi | null;
  setDockviewApi: React.Dispatch<React.SetStateAction<DockviewApi | null>>;
  /** ステータスパネルに相当する全キャラ行を盤面左上にオーバーレイ */
  statusPanelBoardOverlay: boolean;
  setStatusPanelBoardOverlay: React.Dispatch<React.SetStateAction<boolean>>;

  // --- Auto-save edits ---
  setPendingEdit: (key: string, edit: PendingEdit | null) => void;

  // --- 排他編集リセット ---
  clearAllEditing: () => void;
}

export interface PendingEdit {
  type: 'scene' | 'object';
  id: string | null;
  data: Record<string, unknown>;
}

export const UIStateContext = createContext<UIStateContextValue | null>(null);

