import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { AuthUser } from '../contexts/AuthContext';
import type { BoardHandle } from '../components/Board';
import type { UserProfile, ChatChannel, Room } from '../types/adrastea.types';
import { useAuth } from './AuthContext';
import { RoomDataProvider } from './RoomDataProvider';
import { UIStateProvider } from './UIStateProvider';
import { useRoomData } from './RoomDataProvider';
import { useUIState } from './UIStateProvider';
import { checkPermission, type PermissionKey } from '../config/permissions';
import { useToast } from '../components/ui/Toast';
import { useUndoRedo, type UndoRedoHandle } from '../hooks/useUndoRedo';
import { useInitialRoomData } from '../hooks/useInitialRoomData';
import { useChannels } from '../hooks/useChannels';
import { useScenarioTexts } from '../hooks/useScenarioTexts';
import { useCutins } from '../hooks/useCutins';
import { resolveAssetId } from '../hooks/useAssets';
import { computeDiffs } from '../utils/undoDiff';
import type { UndoEntry } from '../utils/undoDiff';
import type { Scene, Character, BoardObject, BgmTrack, CharacterStatus } from '../types/adrastea.types';

const LS_ACTIVE_CHAT_BY_ROOM = 'adrastea-chat-active-channel-by-room';

function loadActiveChannelForRoom(roomId: string): string | null {
  try {
    const raw = localStorage.getItem(LS_ACTIVE_CHAT_BY_ROOM);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, string>;
    const ch = map[roomId];
    return typeof ch === 'string' ? ch : null;
  } catch {
    return null;
  }
}

function persistActiveChannelForRoom(roomId: string, channelId: string): void {
  try {
    const raw = localStorage.getItem(LS_ACTIVE_CHAT_BY_ROOM);
    const map: Record<string, string> = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[roomId] = channelId;
    localStorage.setItem(LS_ACTIVE_CHAT_BY_ROOM, JSON.stringify(map));
  } catch {
    /* quota / private mode */
  }
}

// ---------------------------------------------------------------------------
// Types (kept from original)
// ---------------------------------------------------------------------------

export type PanelSelectionType = 'scene' | 'character' | 'layer' | 'bgm' | 'scenario_text';

export interface KeyboardActions {
  copy?: () => void;
  duplicate?: () => void;
  delete?: () => void;
}
export interface PanelSelection {
  panel: PanelSelectionType;
  ids: string[];
}

export interface PendingEdit {
  type: 'scene' | 'object';
  id: string | null;
  data: Record<string, unknown>;
}

export type RoomRole = 'owner' | 'sub_owner' | 'user' | 'guest';

// Merged context value (kept for backward compatibility)
export interface AdrasteaContextValue {
  roomId: string;
  roomRole: RoomRole;
  // RoomData values (from RoomDataProvider)
  room: Room | null;
  updateRoom: any;
  messages: any[];
  chatLoading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  sendMessage: any;
  loadMore: any;
  clearMessages: any;
  openSecretDice: any;
  editMessage: (messageId: string, newSenderName: string, newContent: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  handleSendMessage: (
    content: string,
    messageType: any,
    characterName?: string,
    characterAvatar?: string | null,
    channel?: string,
  ) => void;
  activeSpeakerCharId: string | null;
  setActiveSpeakerCharId: React.Dispatch<React.SetStateAction<string | null>>;
  activeChatChannel: string;
  setActiveChatChannel: (channel: string) => void;
  chatInjectText: string | null;
  setChatInjectText: (text: string | null) => void;
  channels: ChatChannel[];
  upsertChannel: (channel: ChatChannel) => Promise<void>;
  deleteChannel: (channelId: string) => Promise<void>;
  scenes: Scene[];
  addScene: any;
  updateScene: any;
  removeScene: any;
  reorderScenes: any;
  activateScene: any;
  characters: Character[];
  addCharacter: any;
  updateCharacter: any;
  patchCharacterStatus: (charId: string, statusIndex: number, recipe: (s: CharacterStatus) => CharacterStatus) => void;
  moveCharacter: (charId: string, updates: { board_x?: number; board_y?: number }) => Promise<void>;
  removeCharacter: any;
  reorderCharacters: any;
  layerOrderedCharacters: Character[];
  reorderLayerCharacters: any;
  allObjects: BoardObject[];
  activeObjects: BoardObject[];
  addObject: any;
  updateObject: any;
  moveObject: any;
  localUpdateObject: any;
  removeObject: any;
  reorderObjects: any;
  batchUpdateSort: any;
  scenarioTexts: any[];
  addScenarioText: any;
  updateScenarioText: any;
  removeScenarioText: any;
  reorderScenarioTexts: any;
  cutins: any[];
  addCutin: any;
  updateCutin: any;
  removeCutin: any;
  reorderCutins: any;
  triggerCutin: any;
  clearCutin: any;
  bgms: BgmTrack[];
  addBgm: any;
  updateBgm: any;
  removeBgm: any;
  reorderBgms: any;
  masterVolume: number;
  setMasterVolume: (v: number) => void;
  bgmMuted: boolean;
  setBgmMuted: (v: boolean) => void;
  // UIState values (from UIStateProvider)
  editingScene: Scene | null | undefined;
  setEditingScene: React.Dispatch<React.SetStateAction<Scene | null | undefined>>;
  editingCharacter: Character | null | undefined;
  setEditingCharacter: React.Dispatch<React.SetStateAction<Character | null | undefined>>;
  characterToOpenModal: Character | null;
  setCharacterToOpenModal: (char: Character | null) => void;
  editingCutin: any | null | undefined;
  setEditingCutin: React.Dispatch<React.SetStateAction<any | null | undefined>>;
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
  settingsSection: 'room' | 'layout' | 'members';
  setShowSettings: (show: boolean, section?: 'room' | 'layout' | 'members') => void;
  gridVisible: boolean;
  setGridVisible: React.Dispatch<React.SetStateAction<boolean>>;
  dockviewApi: any;
  setDockviewApi: React.Dispatch<React.SetStateAction<any>>;
  statusPanelBoardOverlay: boolean;
  setStatusPanelBoardOverlay: React.Dispatch<React.SetStateAction<boolean>>;
  // Derived/Board
  activeScene: Scene | null;
  boardRef: React.RefObject<BoardHandle | null>;
  getBoardCenter: () => { x: number; y: number };
  // Auth
  profile: UserProfile | null;
  user: AuthUser | null;
  signOut: () => Promise<void>;
  updateProfile: (data: Partial<Pick<UserProfile, 'display_name' | 'avatar_url'>>) => Promise<void>;
  // Callbacks
  onAddObject: () => void;
  deleteRoom: () => Promise<void>;
  withPermission: <F extends (...args: any[]) => any>(permission: PermissionKey, fn: F) => F;
  // Loading
  isLoading: boolean;
  loadingProgress: number;
  loadingSteps: { label: string; done: boolean }[];
  // Auto-save edits
  setPendingEdit: (key: string, edit: PendingEdit | null) => void;
  // Flush pending edits (シーン切替時の強制フラッシュ)
  flushPendingEdits: () => void;
  // Edit state reset
  clearAllEditing: () => void;
  // Panel registration
  registerPanel: (panelId: string) => void;
  unregisterPanel: (panelId: string) => void;
  // Toast
  toasts: { id: string; message: string; type: 'success' | 'error' }[];
  showToast: (message: string, type: 'success' | 'error') => void;
  // Undo/Redo
  undoRedo: UndoRedoHandle;
  // Asset resolution
  resolveAssetId: (assetId: string | null | undefined) => string | null;
  // Keyboard shortcut actions (ref-based registry)
  keyboardActionsRef: React.MutableRefObject<KeyboardActions>;
  // Demo mode
  isDemo?: boolean;
  // Room members
  members: Array<{ user_id: string; role: string; display_name: string | null; avatar_url: string | null }>;
  setMembers: React.Dispatch<React.SetStateAction<Array<{ user_id: string; role: string; display_name: string | null; avatar_url: string | null }>>>;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const AdrasteaContext = createContext<AdrasteaContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface AdrasteaProviderProps {
  children: React.ReactNode;
  roomId: string;
  roomRole: RoomRole;
}

export const AdrasteaProvider: React.FC<AdrasteaProviderProps> = ({ children, roomId, roomRole }) => {
  const { user, profile, signOut, updateProfile: updateProfileFromAuth } = useAuth();
  const updateProfile = updateProfileFromAuth ?? (async () => {});
  const { toasts, showToast } = useToast();

  // --- パネル登録（遅延ロード用） ---
  const registerPanel = useCallback(() => {
    // NOTE: 実装簡略化のため機能削除
  }, []);
  const unregisterPanel = useCallback(() => {
    // NOTE: 実装簡略化のため機能削除
  }, []);

  // --- RPC 初期データ（キャッシュ経由で RoomDataProvider と共有） ---
  const { data: initialRoomData, loading: initialLoading } = useInitialRoomData(roomId);
  const rpcReady = !initialLoading;

  // --- ScenarioTexts & Cutins (lazy-load 廃止、常時ロード) ---
  const {
    scenarioTexts, addScenarioText, updateScenarioText,
    removeScenarioText, reorderScenarioTexts,
  } = useScenarioTexts(roomId, rpcReady, { initialData: initialRoomData?.scenario_texts });
  const {
    cutins, addCutin, updateCutin, removeCutin,
    reorderCutins, triggerCutin, clearCutin,
  } = useCutins(roomId, rpcReady, undefined, { initialData: initialRoomData?.cutins });

  // --- Permission guard ref ---
  const roomRoleRef = useRef(roomRole);
  roomRoleRef.current = roomRole;

  const withPermission = useCallback(<F extends (...args: any[]) => any>(
    permission: PermissionKey | string,
    fn: F,
  ): F => ((...args: Parameters<F>) => {
    if (!checkPermission(roomRoleRef.current, permission as PermissionKey)) {
      console.warn(`[Permission] denied: ${permission} (role: ${roomRoleRef.current})`);
      return;
    }
    return fn(...args);
  }) as F, []);

  // --- Board ref ---
  const boardRef = useRef<BoardHandle | null>(null);
  const getBoardCenter = useCallback(() => {
    const board = boardRef.current;
    if (!board) return { x: 0, y: 0 };
    const stage = board.getStage();
    if (!stage) return { x: 0, y: 0 };
    const scale = board.getScale();
    const stagePos = stage.position();
    const w = stage.width();
    const h = stage.height();
    if (!w || !h) return { x: 0, y: 0 };
    return {
      x: Math.round(((w / 2) - stagePos.x) / scale / 10),
      y: Math.round(((h / 2) - stagePos.y) / scale / 10),
    };
  }, []);

  // --- Channels hook ---
  const { channels, upsertChannel, deleteChannel } = useChannels(roomId, {
    enabled: rpcReady,
    initialData: initialRoomData?.channels,
    viewAsUserId: user?.uid,
    viewAsRoomRole: roomRole,
  });

  // --- Chat state ---
  const [activeChatChannel, setActiveChatChannelState] = useState<string>('main');
  const [chatInjectText, setChatInjectText] = useState<string | null>(null);
  const [characterToOpenModal, setCharacterToOpenModal] = useState<Character | null>(null);

  const setActiveChatChannel = useCallback((channel: string) => {
    setActiveChatChannelState(channel);
    if (roomId) persistActiveChannelForRoom(roomId, channel);
  }, [roomId]);

  useEffect(() => {
    if (!roomId) {
      setActiveChatChannelState('main');
      return;
    }
    const saved = loadActiveChannelForRoom(roomId);
    setActiveChatChannelState(saved ?? 'main');
  }, [roomId]);

  useEffect(() => {
    if (channels.length === 0) return;
    if (!channels.some((c) => c.channel_id === activeChatChannel)) {
      setActiveChatChannelState('main');
      if (roomId) persistActiveChannelForRoom(roomId, 'main');
    }
  }, [channels, activeChatChannel, roomId]);

  // --- Room members ---
  const [members, setMembers] = useState<Array<{ user_id: string; role: string; display_name: string | null; avatar_url: string | null }>>([]);

  // --- Undo/Redo ---
  const undoRedo = useUndoRedo();

  // --- Keyboard actions ref ---
  const keyboardActionsRef = useRef<KeyboardActions>({});

  // --- Auto-save edits ---
  const debounceTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingEditsRef = useRef<Map<string, PendingEdit>>(new Map());

  useEffect(() => {
    return () => {
      for (const timer of debounceTimersRef.current.values()) clearTimeout(timer);
      debounceTimersRef.current.clear();
    };
  }, []);

  // 保存関数を ref で保持（MergeProvider で設定される）
  const saveEditRef = useRef<(edit: PendingEdit) => void>(() => {});

  const DEBOUNCE_MS = 500;

  const setPendingEdit = useCallback((key: string, edit: PendingEdit | null) => {
    if (!edit) {
      const timer = debounceTimersRef.current.get(key);
      if (timer) clearTimeout(timer);
      debounceTimersRef.current.delete(key);
      pendingEditsRef.current.delete(key);
      return;
    }
    pendingEditsRef.current.set(key, edit);

    // 既存タイマーをクリアして再設定
    const existingTimer = debounceTimersRef.current.get(key);
    if (existingTimer) clearTimeout(existingTimer);

    debounceTimersRef.current.set(key, setTimeout(() => {
      debounceTimersRef.current.delete(key);
      const pending = pendingEditsRef.current.get(key);
      if (pending && pending.id) {
        saveEditRef.current(pending);
        pendingEditsRef.current.delete(key);
      }
    }, DEBOUNCE_MS));
  }, []);

  // --- Flush pending edits ---
  const flushPendingEdits = useCallback(() => {
    // 全デバウンスタイマーをクリア
    for (const timer of debounceTimersRef.current.values()) {
      clearTimeout(timer);
    }
    debounceTimersRef.current.clear();

    // 保留中の全編集を即座に保存
    for (const [, edit] of pendingEditsRef.current.entries()) {
      if (edit && edit.id && edit.data) {
        saveEditRef.current(edit);
      }
    }
    pendingEditsRef.current.clear();
  }, []);

  // --- Delete room ---
  const deleteRoom = useCallback(async () => {
    if (!user) return;
    const match = window.location.pathname.match(/\/([^/]+)/);
    const roomId = match?.[1];
    if (!roomId) {
      window.location.href = '/';
      return;
    }
    const { supabase } = await import('../services/supabase');
    const { error } = await supabase.from('rooms').delete().eq('id', roomId);
    if (error) {
      console.error('ルーム削除失敗:', error);
    }
    window.location.href = '/';
  }, [user]);

  // --- Shortcut callback ---
  const onAddObject = useCallback(() => {}, []);

  // --- Loading state (まずはダミー、useAdrasteaContext で上書き) ---
  const isLoading = false;
  const loadingProgress = 1;
  const loadingSteps = [{ label: 'Ready', done: true }];

  // --- Merged value from RoomData + UIState ---
  const value = useMemo<AdrasteaContextValue>(() => {
    // RoomDataProvider / UIStateProvider から取得する処理は
    // useAdrasteaContext() フックで行う
    return {
      roomId,
      roomRole,
      // これらのフィールドはダミー値
      pieces: [],
      room: null,
      movePiece: async () => {},
      addPiece: async () => '',
      removePiece: async () => {},
      updatePiece: async () => {},
      updateRoom: async () => {},
      messages: [],
      chatLoading: false,
      loadingMore: false,
      hasMore: false,
      sendMessage: async () => {},
      loadMore: async () => {},
      clearMessages: async () => {},
      openSecretDice: async () => {},
      editMessage: async () => {},
      deleteMessage: async () => {},
      handleSendMessage: () => {},
      activeSpeakerCharId: null,
      setActiveSpeakerCharId: () => {},
      activeChatChannel,
      setActiveChatChannel,
      chatInjectText,
      setChatInjectText,
      channels,
      upsertChannel,
      deleteChannel,
      scenes: [],
      addScene: async () => '',
      updateScene: async () => {},
      removeScene: async () => {},
      reorderScenes: async () => {},
      activateScene: async () => {},
      characters: [],
      addCharacter: async () => '',
      updateCharacter: async () => {},
      patchCharacterStatus: () => {},
      moveCharacter: async () => {},
      removeCharacter: async () => {},
      reorderCharacters: async () => {},
      layerOrderedCharacters: [],
      reorderLayerCharacters: async () => {},
      allObjects: [],
      activeObjects: [],
      addObject: async () => '',
      updateObject: async () => {},
      moveObject: async () => {},
      localUpdateObject: () => {},
      removeObject: async () => {},
      reorderObjects: async () => {},
      batchUpdateSort: async () => {},
      scenarioTexts,
      addScenarioText,
      updateScenarioText,
      removeScenarioText,
      reorderScenarioTexts,
      cutins,
      addCutin,
      updateCutin,
      removeCutin,
      reorderCutins,
      triggerCutin,
      clearCutin,
      bgms: [],
      addBgm: async () => '',
      updateBgm: async () => {},
      removeBgm: async () => {},
      reorderBgms: async () => {},
      masterVolume: 0.5,
      setMasterVolume: () => {},
      bgmMuted: false,
      setBgmMuted: () => {},
      editingScene: undefined,
      setEditingScene: () => {},
      editingCharacter: undefined,
      setEditingCharacter: () => {},
      characterToOpenModal,
      setCharacterToOpenModal,
      editingCutin: undefined,
      setEditingCutin: () => {},
      editingBgmId: null,
      setEditingBgmId: () => {},
      editingScenarioTextId: null,
      setEditingScenarioTextId: () => {},
      editingPieceId: null,
      setEditingPieceId: () => {},
      editingObjectId: undefined,
      setEditingObjectId: () => {},
      selectedObjectIds: [],
      setSelectedObjectIds: () => {},
      panelSelection: null,
      setPanelSelection: () => {},
      showRoomSettings: false,
      setShowRoomSettings: () => {},
      showProfileEdit: false,
      setShowProfileEdit: () => {},
      showSettings: false,
      settingsSection: 'room',
      setShowSettings: () => {},
      gridVisible: false,
      setGridVisible: () => {},
      dockviewApi: null,
      setDockviewApi: () => {},
      statusPanelBoardOverlay: false,
      setStatusPanelBoardOverlay: () => {},
      activeScene: null,
      boardRef,
      getBoardCenter,
      profile: profile ?? null,
      user: user ?? null,
      signOut,
      updateProfile,
      onAddObject,
      deleteRoom,
      withPermission,
      isLoading,
      loadingProgress,
      loadingSteps,
      setPendingEdit,
      flushPendingEdits,
      clearAllEditing: () => {},
      registerPanel,
      unregisterPanel,
      toasts,
      showToast,
      undoRedo,
      resolveAssetId,
      keyboardActionsRef,
      members,
      setMembers,
    };
  }, [
    roomId, roomRole, activeChatChannel, chatInjectText, channels, upsertChannel, deleteChannel,
    characterToOpenModal, boardRef, profile, user, signOut, updateProfile, onAddObject, deleteRoom,
    withPermission, isLoading, loadingProgress, loadingSteps, setPendingEdit, flushPendingEdits, registerPanel,
    unregisterPanel, toasts, showToast, undoRedo,
    scenarioTexts, addScenarioText, updateScenarioText, removeScenarioText, reorderScenarioTexts,
    cutins, addCutin, updateCutin, removeCutin, reorderCutins, triggerCutin, clearCutin,
    members,
  ]);

  return (
    <RoomDataProvider
      roomId={roomId}
      initialLoadDone={true}
      withPermission={withPermission}
      user={user}
      activeChatChannel={activeChatChannel}
    >
      <SaveBridge saveEditRef={saveEditRef} />
      <UndoBridge undoRedo={undoRedo} />
      <UIStateProvider setPendingEdit={setPendingEdit}>
        <AdrasteaContext.Provider value={value}>
          {children}
        </AdrasteaContext.Provider>
      </UIStateProvider>
    </RoomDataProvider>
  );
};

/** Provider 内部: setPendingEdit の保存先を RoomDataProvider の関数にバインド */
function SaveBridge({ saveEditRef }: { saveEditRef: React.MutableRefObject<(edit: PendingEdit) => void> }) {
  const roomData = useRoomData();
  useEffect(() => {
    saveEditRef.current = (edit: PendingEdit) => {
      if (!edit.id) return;
      if (edit.type === 'object') {
        roomData.updateObject(edit.id, edit.data as any);
      } else if (edit.type === 'scene') {
        roomData.updateScene(edit.id, edit.data as any);
      }
    };
  }, [roomData.updateObject, roomData.updateScene, saveEditRef]);
  return null;
}

/** Provider 内部: diff 検知 + undo/redo 実行 */
function UndoBridge({ undoRedo }: { undoRedo: ReturnType<typeof useUndoRedo> }) {
  const roomData = useRoomData();

  const prevObjectsRef = useRef<any[]>([]);
  const prevCharactersRef = useRef<any[]>([]);
  const prevScenesRef = useRef<any[]>([]);
  const prevBgmsRef = useRef<any[]>([]);
  const undoReadyRef = useRef(false);
  const graceUntilRef = useRef(0);

  const { scenes, allObjects, characters, bgms } = roomData;

  // 初期化
  useEffect(() => {
    if (!scenes?.length || undoReadyRef.current) return;
    prevObjectsRef.current = allObjects ?? [];
    prevCharactersRef.current = characters ?? [];
    prevScenesRef.current = scenes ?? [];
    prevBgmsRef.current = bgms ?? [];
    undoReadyRef.current = true;
  }, [scenes, allObjects, characters, bgms]);

  // diff 検知: objects
  useEffect(() => {
    if (!undoReadyRef.current || !allObjects) return;
    if (undoRedo.isOperatingRef.current || Date.now() < graceUntilRef.current) { prevObjectsRef.current = allObjects; return; }
    computeDiffs('object', prevObjectsRef.current, allObjects).forEach(d => undoRedo.push(d));
    prevObjectsRef.current = allObjects;
  }, [allObjects]); // eslint-disable-line react-hooks/exhaustive-deps

  // diff 検知: characters
  useEffect(() => {
    if (!undoReadyRef.current || !characters) return;
    if (undoRedo.isOperatingRef.current || Date.now() < graceUntilRef.current) { prevCharactersRef.current = characters; return; }
    computeDiffs('character', prevCharactersRef.current, characters).forEach(d => undoRedo.push(d));
    prevCharactersRef.current = characters;
  }, [characters]); // eslint-disable-line react-hooks/exhaustive-deps

  // diff 検知: scenes
  useEffect(() => {
    if (!undoReadyRef.current || !scenes) return;
    if (undoRedo.isOperatingRef.current || Date.now() < graceUntilRef.current) { prevScenesRef.current = scenes; return; }
    computeDiffs('scene', prevScenesRef.current, scenes).forEach(d => undoRedo.push(d));
    prevScenesRef.current = scenes;
  }, [scenes]); // eslint-disable-line react-hooks/exhaustive-deps

  // diff 検知: bgms
  useEffect(() => {
    if (!undoReadyRef.current || !bgms) return;
    if (undoRedo.isOperatingRef.current || Date.now() < graceUntilRef.current) { prevBgmsRef.current = bgms; return; }
    computeDiffs('bgm', prevBgmsRef.current, bgms).forEach(d => undoRedo.push(d));
    prevBgmsRef.current = bgms;
  }, [bgms]); // eslint-disable-line react-hooks/exhaustive-deps

  // executeUndoEntry
  const executeUndoEntry = useCallback(async (entry: UndoEntry, direction: 'undo' | 'redo') => {
    undoRedo.isOperatingRef.current = true;
    const data = direction === 'undo' ? entry.before : entry.after;
    try {
      if (direction === 'undo' && entry.operation === 'add') {
        switch (entry.entityType) {
          case 'object': await roomData.removeObject(entry.entityId); break;
          case 'character': await roomData.removeCharacter(entry.entityId); break;
          case 'scene': await roomData.removeScene(entry.entityId); break;
          case 'bgm': await roomData.removeBgm(entry.entityId); break;
        }
      } else if (direction === 'undo' && entry.operation === 'remove') {
        switch (entry.entityType) {
          case 'object': await roomData.addObject(data as any); break;
          case 'character': await roomData.addCharacter(data as any); break;
          case 'scene': await roomData.addScene(data as any); break;
          case 'bgm': await roomData.addBgm(data as any); break;
        }
      } else if (direction === 'redo' && entry.operation === 'add') {
        switch (entry.entityType) {
          case 'object': await roomData.addObject(data as any); break;
          case 'character': await roomData.addCharacter(data as any); break;
          case 'scene': await roomData.addScene(data as any); break;
          case 'bgm': await roomData.addBgm(data as any); break;
        }
      } else if (direction === 'redo' && entry.operation === 'remove') {
        switch (entry.entityType) {
          case 'object': await roomData.removeObject(entry.entityId); break;
          case 'character': await roomData.removeCharacter(entry.entityId); break;
          case 'scene': await roomData.removeScene(entry.entityId); break;
          case 'bgm': await roomData.removeBgm(entry.entityId); break;
        }
      } else {
        switch (entry.entityType) {
          case 'object': await roomData.updateObject(entry.entityId, data as any); break;
          case 'character': await roomData.updateCharacter(entry.entityId, data as any); break;
          case 'scene': await roomData.updateScene(entry.entityId, data as any); break;
          case 'bgm': await roomData.updateBgm(entry.entityId, data as any); break;
        }
      }
    } finally {
      undoRedo.isOperatingRef.current = false;
      graceUntilRef.current = Date.now() + 500;
    }
  }, [roomData, undoRedo.isOperatingRef]);

  // Ctrl+Z / Ctrl+Shift+Z キーハンドラ
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'z') return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.contentEditable === 'true')) return;
      e.preventDefault();
      if (e.shiftKey) {
        const entry = undoRedo.redo();

        if (entry) executeUndoEntry(entry, 'redo');
      } else {
        const entry = undoRedo.undo();

        if (entry) executeUndoEntry(entry, 'undo');
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [undoRedo, executeUndoEntry]);

  return null; // レンダリングなし
}

// ---------------------------------------------------------------------------
// Consumer hook (Backward compatible)
// ---------------------------------------------------------------------------

export function useAdrasteaContext(): AdrasteaContextValue {
  const adrasteaCtx = useContext(AdrasteaContext);
  if (!adrasteaCtx) {
    throw new Error('useAdrasteaContext must be used within AdrasteaProvider');
  }

  // RoomData と UIState を取得してマージ
  let roomDataCtx: any = null;
  let uiStateCtx: any = null;

  try {
    roomDataCtx = useRoomData();
  } catch (e) {
    // RoomDataContext がない場合
  }

  try {
    uiStateCtx = useUIState();
  } catch (e) {
    // UIStateContext がない場合
  }

  // activateScene をラップ：シーン切替前にデバウンス保存を強制フラッシュ
  const wrappedActivateScene = useCallback(async (sceneId: string | null) => {
    adrasteaCtx.flushPendingEdits();
    if (roomDataCtx?.activateScene) {
      await roomDataCtx.activateScene(sceneId);
    }
  }, [roomDataCtx, adrasteaCtx.flushPendingEdits]);

  // マージされた値を返す
  return {
    ...adrasteaCtx,
    // RoomData の値で上書き
    ...(roomDataCtx && {
      pieces: roomDataCtx.pieces,
      room: roomDataCtx.room,
      movePiece: roomDataCtx.movePiece,
      addPiece: roomDataCtx.addPiece,
      removePiece: roomDataCtx.removePiece,
      updatePiece: roomDataCtx.updatePiece,
      updateRoom: roomDataCtx.updateRoom,
      messages: roomDataCtx.messages,
      chatLoading: roomDataCtx.chatLoading,
      loadingMore: roomDataCtx.loadingMore,
      hasMore: roomDataCtx.hasMore,
      sendMessage: roomDataCtx.sendMessage,
      loadMore: roomDataCtx.loadMore,
      clearMessages: roomDataCtx.clearMessages,
      openSecretDice: roomDataCtx.openSecretDice,
      editMessage: roomDataCtx.editMessage,
      deleteMessage: roomDataCtx.deleteMessage,
      handleSendMessage: roomDataCtx.handleSendMessage,
      activeSpeakerCharId: roomDataCtx.activeSpeakerCharId,
      setActiveSpeakerCharId: roomDataCtx.setActiveSpeakerCharId,
      scenes: roomDataCtx.scenes,
      addScene: roomDataCtx.addScene,
      updateScene: roomDataCtx.updateScene,
      removeScene: roomDataCtx.removeScene,
      reorderScenes: roomDataCtx.reorderScenes,
      activateScene: wrappedActivateScene,
      characters: roomDataCtx.characters,
      addCharacter: roomDataCtx.addCharacter,
      updateCharacter: roomDataCtx.updateCharacter,
      patchCharacterStatus: roomDataCtx.patchCharacterStatus,
      moveCharacter: roomDataCtx.moveCharacter,
      removeCharacter: roomDataCtx.removeCharacter,
      reorderCharacters: roomDataCtx.reorderCharacters,
      layerOrderedCharacters: roomDataCtx.layerOrderedCharacters,
      reorderLayerCharacters: roomDataCtx.reorderLayerCharacters,
      allObjects: roomDataCtx.allObjects,
      activeObjects: roomDataCtx.activeObjects,
      addObject: roomDataCtx.addObject,
      updateObject: roomDataCtx.updateObject,
      moveObject: roomDataCtx.moveObject,
      localUpdateObject: roomDataCtx.localUpdateObject,
      removeObject: roomDataCtx.removeObject,
      reorderObjects: roomDataCtx.reorderObjects,
      batchUpdateSort: roomDataCtx.batchUpdateSort,
      bgms: roomDataCtx.bgms,
      addBgm: roomDataCtx.addBgm,
      updateBgm: roomDataCtx.updateBgm,
      removeBgm: roomDataCtx.removeBgm,
      reorderBgms: roomDataCtx.reorderBgms,
      activeScene: roomDataCtx.activeScene,
      // Loading state
      isLoading: !roomDataCtx.dataReady,
      loadingProgress: roomDataCtx.dataReady ? 1 : 0.5,
      loadingSteps: [{ label: 'ルームデータ', done: roomDataCtx.dataReady }],
    }),
    // UIState の値で上書き
    ...(uiStateCtx && {
      editingScene: uiStateCtx.editingScene,
      setEditingScene: uiStateCtx.setEditingScene,
      editingCharacter: uiStateCtx.editingCharacter,
      setEditingCharacter: uiStateCtx.setEditingCharacter,
      editingCutin: uiStateCtx.editingCutin,
      setEditingCutin: uiStateCtx.setEditingCutin,
      editingBgmId: uiStateCtx.editingBgmId,
      setEditingBgmId: uiStateCtx.setEditingBgmId,
      editingScenarioTextId: uiStateCtx.editingScenarioTextId,
      setEditingScenarioTextId: uiStateCtx.setEditingScenarioTextId,
      editingPieceId: uiStateCtx.editingPieceId,
      setEditingPieceId: uiStateCtx.setEditingPieceId,
      editingObjectId: uiStateCtx.editingObjectId,
      setEditingObjectId: uiStateCtx.setEditingObjectId,
      selectedObjectIds: uiStateCtx.selectedObjectIds,
      setSelectedObjectIds: uiStateCtx.setSelectedObjectIds,
      panelSelection: uiStateCtx.panelSelection,
      setPanelSelection: uiStateCtx.setPanelSelection,
      showRoomSettings: uiStateCtx.showRoomSettings,
      setShowRoomSettings: uiStateCtx.setShowRoomSettings,
      showProfileEdit: uiStateCtx.showProfileEdit,
      setShowProfileEdit: uiStateCtx.setShowProfileEdit,
      showSettings: uiStateCtx.showSettings,
      settingsSection: uiStateCtx.settingsSection,
      setShowSettings: uiStateCtx.setShowSettings,
      masterVolume: uiStateCtx.masterVolume,
      setMasterVolume: uiStateCtx.setMasterVolume,
      bgmMuted: uiStateCtx.bgmMuted,
      setBgmMuted: uiStateCtx.setBgmMuted,
      gridVisible: roomDataCtx?.room?.grid_visible ?? uiStateCtx.gridVisible,
      setGridVisible: uiStateCtx.setGridVisible,
      dockviewApi: uiStateCtx.dockviewApi,
      setDockviewApi: uiStateCtx.setDockviewApi,
      statusPanelBoardOverlay: uiStateCtx.statusPanelBoardOverlay,
      setStatusPanelBoardOverlay: uiStateCtx.setStatusPanelBoardOverlay,
      setPendingEdit: uiStateCtx.setPendingEdit,
      flushPendingEdits: adrasteaCtx.flushPendingEdits,
      clearAllEditing: uiStateCtx.clearAllEditing,
    }),
    // Undo/Redo
    undoRedo: adrasteaCtx.undoRedo,
  };
}
