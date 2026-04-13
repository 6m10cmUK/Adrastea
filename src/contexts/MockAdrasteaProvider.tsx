import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { AdrasteaContext } from './AdrasteaContext';
import type { AdrasteaContextValue, RoomRole, PanelSelection, PendingEdit } from './AdrasteaContext';
import { useMockAdrasteaState } from '../hooks/useMockAdrasteaState';
import { useScenes } from '../hooks/useScenes';
import { useObjects } from '../hooks/useObjects';
import { useCharacters } from '../hooks/useCharacters';
import { useBgms } from '../hooks/useBgms';
import { useCutins } from '../hooks/useCutins';
import { useAdrasteaChat } from '../hooks/useAdrasteaChat';
import { useUndoRedo } from '../hooks/useUndoRedo';
import { computeDiffs, type UndoEntry } from '../utils/undoDiff';
import type { DockviewApi } from 'dockview';
import type { BoardHandle } from '../components/Board';
import type { Room } from '../types/adrastea.types';
import { resolveAssetId } from '../hooks/useAssets';
import { useToast } from '../components/ui/Toast';

const DEMO_ROOM_ID = 'demo-room-001';

const DEMO_PROFILE = {
  uid: 'demo-user',
  display_name: 'デモユーザー',
  avatar_url: null,
  created_at: Date.now(),
  updated_at: Date.now(),
};

const DEMO_USER = {
  uid: 'demo-user',
  displayName: 'デモユーザー',
  avatarUrl: null,
};

interface MockAdrasteaProviderProps {
  children: React.ReactNode;
  roomId?: string;
}

export const MockAdrasteaProvider: React.FC<MockAdrasteaProviderProps> = ({
  children,
  roomId = DEMO_ROOM_ID,
}) => {
  const mock = useMockAdrasteaState();
  const { toasts, showToast } = useToast();
  const undoRedo = useUndoRedo();

  // activeSceneId は room.active_scene_id から決定
  const activeSceneId = mock.room?.active_scene_id ?? null;

  // handleRoomUpdate (useCutins の onRoomUpdate コールバック)
  const handleRoomUpdate = useCallback((updates: Record<string, unknown>) => {
    mock.updateRoom(updates as Partial<Room>);
  }, [mock]);

  // 各 hook を inject 付きで呼ぶ（characters_layer は useScenes 内で初回シーン作成時に自動生成）
  const {
    scenes,
    addScene, updateScene, removeScene,
  } = useScenes(roomId, { inject: mock.scenesInject });

  const {
    allObjects, activeObjects,
    addObject, updateObject, removeObject, reorderObjects, batchUpdateSort,
  } = useObjects(roomId, activeSceneId, scenes, { inject: mock.objectsInject });

  const {
    characters, layerOrderedCharacters,
    addCharacter, updateCharacter, moveCharacter, removeCharacter, reorderCharacters, reorderLayerCharacters,
  } = useCharacters(roomId, { inject: mock.charactersInject });

  const {
    bgms, addBgm, updateBgm, removeBgm, reorderBgms,
  } = useBgms(roomId, { inject: mock.bgmsInject });

  const {
    cutins, addCutin, updateCutin, removeCutin, reorderCutins, triggerCutin, clearCutin,
  } = useCutins(roomId, true, handleRoomUpdate, { inject: mock.cutinsInject });

  const {
    messages, sendMessage, loadMore, clearMessages,
  } = useAdrasteaChat(roomId, { inject: mock.chatInject });

  // activeScene
  const activeScene = useMemo(
    () => scenes.find(s => s.id === activeSceneId) ?? null,
    [scenes, activeSceneId]
  );

  // activateScene: room.active_scene_id を更新
  const activateScene = useCallback(async (sceneId: string | null) => {
    mock.updateRoom({ active_scene_id: sceneId ?? undefined });
  }, [mock]);

  // 初回マウント時にデフォルトシーン「メイン」を作成（本番の addRoom と同じ挙動）
  useEffect(() => {
    if (scenes.length > 0) return; // 既にシーンがあればスキップ
    addScene({ name: 'メイン' }).then(({ scene }) => {
      activateScene(scene.id);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Undo/Redo diff 検知 ---
  const prevObjectsRef = useRef<typeof allObjects>([]);
  const prevCharactersRef = useRef<typeof characters>([]);
  const prevScenesRef = useRef<typeof scenes>([]);
  const prevBgmsRef = useRef<typeof bgms>([]);
  const undoReadyRef = useRef(false);

  useEffect(() => {
    if (scenes.length === 0 || undoReadyRef.current) return;
    prevObjectsRef.current = allObjects;
    prevCharactersRef.current = characters;
    prevScenesRef.current = scenes;
    prevBgmsRef.current = bgms;
    undoReadyRef.current = true;
  }, [scenes, allObjects, characters, bgms]);

  useEffect(() => {
    if (!undoReadyRef.current) return;
    if (undoRedo.isOperatingRef.current) { prevObjectsRef.current = allObjects; return; }
    computeDiffs('object', prevObjectsRef.current, allObjects).forEach(d => undoRedo.push(d));
    prevObjectsRef.current = allObjects;
  }, [allObjects]);

  useEffect(() => {
    if (!undoReadyRef.current) return;
    if (undoRedo.isOperatingRef.current) { prevCharactersRef.current = characters; return; }
    computeDiffs('character', prevCharactersRef.current, characters).forEach(d => undoRedo.push(d));
    prevCharactersRef.current = characters;
  }, [characters]);

  useEffect(() => {
    if (!undoReadyRef.current) return;
    if (undoRedo.isOperatingRef.current) { prevScenesRef.current = scenes; return; }
    computeDiffs('scene', prevScenesRef.current, scenes).forEach(d => undoRedo.push(d));
    prevScenesRef.current = scenes;
  }, [scenes]);

  useEffect(() => {
    if (!undoReadyRef.current) return;
    if (undoRedo.isOperatingRef.current) { prevBgmsRef.current = bgms; return; }
    computeDiffs('bgm', prevBgmsRef.current, bgms).forEach(d => undoRedo.push(d));
    prevBgmsRef.current = bgms;
  }, [bgms]);

  // undo/redo 実行
  const executeUndoEntry = useCallback(async (entry: UndoEntry, direction: 'undo' | 'redo') => {
    undoRedo.isOperatingRef.current = true;
    const data = direction === 'undo' ? entry.before : entry.after;
    try {
      if (direction === 'undo' && entry.operation === 'add') {
        switch (entry.entityType) {
          case 'object': await removeObject(entry.entityId); break;
          case 'character': await removeCharacter(entry.entityId); break;
          case 'scene': await removeScene(entry.entityId); break;
          case 'bgm': await removeBgm(entry.entityId); break;
        }
      } else if (direction === 'undo' && entry.operation === 'remove') {
        switch (entry.entityType) {
          case 'object': await addObject(data as any); break;
          case 'character': await addCharacter(data as any); break;
          case 'scene': await addScene(data as any); break;
          case 'bgm': await addBgm(data as any); break;
        }
      } else if (direction === 'redo' && entry.operation === 'add') {
        switch (entry.entityType) {
          case 'object': await addObject(data as any); break;
          case 'character': await addCharacter(data as any); break;
          case 'scene': await addScene(data as any); break;
          case 'bgm': await addBgm(data as any); break;
        }
      } else if (direction === 'redo' && entry.operation === 'remove') {
        switch (entry.entityType) {
          case 'object': await removeObject(entry.entityId); break;
          case 'character': await removeCharacter(entry.entityId); break;
          case 'scene': await removeScene(entry.entityId); break;
          case 'bgm': await removeBgm(entry.entityId); break;
        }
      } else {
        switch (entry.entityType) {
          case 'object': await updateObject(entry.entityId, data as any); break;
          case 'character': await updateCharacter(entry.entityId, data as any); break;
          case 'scene': await updateScene(entry.entityId, data as any); break;
          case 'bgm': await updateBgm(entry.entityId, data as any); break;
        }
      }
    } finally {
      setTimeout(() => { undoRedo.isOperatingRef.current = false; }, 100);
    }
  }, [addObject, removeObject, updateObject, addCharacter, removeCharacter, updateCharacter,
      addScene, removeScene, updateScene, addBgm, removeBgm, updateBgm]);

  const handleUndo = useCallback(() => {
    const entry = undoRedo.undo();
    if (entry) executeUndoEntry(entry, 'undo');
  }, [undoRedo, executeUndoEntry]);

  const handleRedo = useCallback(() => {
    const entry = undoRedo.redo();
    if (entry) executeUndoEntry(entry, 'redo');
  }, [undoRedo, executeUndoEntry]);

  // moveObject: updateObject を代用
  const moveObject = updateObject;

  // handleSendMessage
  const [activeSpeakerCharId, setActiveSpeakerCharId] = useState<string | null>(null);
  const [activeChatChannel, setActiveChatChannel] = useState('main');

  const handleSendMessage = useCallback(
    (
      content: string,
      _messageType: string,
      characterName?: string,
      characterAvatarAssetId?: string | null,
      channel?: string,
    ) => {
      const senderName = characterName ?? 'デモユーザー';
      sendMessage(senderName, content, 'chat', 'demo-user', characterAvatarAssetId ?? null, undefined, channel ?? activeChatChannel);
    },
    [sendMessage, activeChatChannel],
  );

  // UI State
  const [editingScene, setEditingScene] = useState<any>(undefined);
  const [editingCharacter, setEditingCharacter] = useState<any>(undefined);
  const [characterToOpenModal, setCharacterToOpenModal] = useState<any>(null);
  const [editingCutin, setEditingCutin] = useState<any>(undefined);
  const [editingBgmId, setEditingBgmId] = useState<string | null>(null);
  const [editingObjectId, setEditingObjectId] = useState<string | null | undefined>(undefined);
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([]);
  const [panelSelection, setPanelSelection] = useState<PanelSelection | null>(null);
  const [showSettings, setShowSettingsState] = useState(false);
  const [settingsSection, setSettingsSection] = useState<'room' | 'layout' | 'members'>('room');
  const [gridVisible, setGridVisible] = useState(true);
  const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null);
  const [masterVolume, setMasterVolume] = useState(0.5);
  const [bgmMuted, setBgmMuted] = useState(false);
  const [chatInjectText, setChatInjectText] = useState<string | null>(null);

  const boardRef = useRef<BoardHandle | null>(null);

  const clearAllEditing = useCallback(() => {
    setEditingScene(undefined);
    setEditingCharacter(undefined);
    setEditingCutin(undefined);
    setEditingBgmId(null);
    setEditingObjectId(undefined);
    setSelectedObjectIds([]);
    setPanelSelection(null);
  }, []);

  const handleSetShowSettings = useCallback((show: boolean, section?: 'room' | 'layout' | 'members') => {
    setShowSettingsState(show);
    if (section) setSettingsSection(section);
  }, []);

  const getBoardCenter = useCallback(() => ({ x: 15, y: 15 }), []);

  const onAddObject = useCallback(() => {
    const center = getBoardCenter();
    addObject({
      type: 'panel',
      name: '新規panel',
      x: center.x,
      y: center.y,
      width: 4,
      height: 4,
      scene_start_id: activeScene?.id,
      scene_end_id: activeScene?.id,
    });
  }, [addObject, getBoardCenter, activeScene]);

  const registerPanel = useCallback(() => {}, []);
  const unregisterPanel = useCallback(() => {}, []);

  const pendingEditsRef = useRef<Map<string, PendingEdit>>(new Map());
  const setPendingEdit = useCallback((key: string, edit: PendingEdit | null) => {
    if (edit === null) {
      pendingEditsRef.current.delete(key);
    } else {
      pendingEditsRef.current.set(key, edit);
    }
  }, []);

  const value = {
    roomId,
    roomRole: 'owner' as RoomRole,

    // Data
    room: mock.room,
    scenes,
    characters,
    layerOrderedCharacters,
    allObjects,
    activeObjects,
    activeScene,
    bgms,
    cutins,
    scenarioTexts: mock.scenarioTexts,
    messages,
    chatLoading: false,
    loadingMore: false,
    hasMore: false,
    channels: [
      { channel_id: 'main', label: 'メイン', order: 0, is_archived: false, is_private: false, allowed_user_ids: [] },
      { channel_id: 'info', label: '情報', order: 1, is_archived: false, is_private: false, allowed_user_ids: [] },
      { channel_id: 'other', label: '雑談', order: 2, is_archived: false, is_private: false, allowed_user_ids: [] },
    ],

    // Mutations: Scene
    addScene, updateScene, removeScene, activateScene,

    // Mutations: Object
    addObject, updateObject, moveObject, removeObject, reorderObjects, batchUpdateSort,

    // Mutations: Character
    addCharacter, updateCharacter, moveCharacter, removeCharacter, reorderCharacters, reorderLayerCharacters,

    // Mutations: BGM
    addBgm, updateBgm, removeBgm, reorderBgms,

    // Mutations: Cutin
    addCutin, updateCutin, removeCutin, reorderCutins, triggerCutin, clearCutin,

    // Mutations: Message
    sendMessage, loadMore, clearMessages, handleSendMessage, openSecretDice: async () => {}, editMessage: async () => {}, deleteMessage: async () => {},

    // Mutations: ScenarioText
    addScenarioText: mock.addScenarioText,
    updateScenarioText: mock.updateScenarioText,
    removeScenarioText: mock.removeScenarioText,
    reorderScenarioTexts: mock.reorderScenarioTexts,

    // Mutations: Room
    updateRoom: mock.updateRoom,
    deleteRoom: async () => {},
    upsertChannel: async () => {},
    deleteChannel: async () => {},

    // UI State
    activeSpeakerCharId,
    setActiveSpeakerCharId,
    activeChatChannel,
    setActiveChatChannel,
    chatInjectText,
    setChatInjectText,
    editingScene,
    setEditingScene,
    editingCharacter,
    setEditingCharacter,
    characterToOpenModal,
    setCharacterToOpenModal,
    editingCutin,
    setEditingCutin,
    editingBgmId,
    setEditingBgmId,
    editingObjectId,
    setEditingObjectId,
    selectedObjectIds,
    setSelectedObjectIds,
    panelSelection,
    setPanelSelection,
    showRoomSettings: false,
    setShowRoomSettings: () => {},
    showProfileEdit: false,
    setShowProfileEdit: () => {},
    showSettings,
    settingsSection,
    setShowSettings: handleSetShowSettings,
    masterVolume,
    setMasterVolume,
    bgmMuted,
    setBgmMuted,
    gridVisible: mock.room?.grid_visible ?? gridVisible,
    setGridVisible: (v: React.SetStateAction<boolean>) => {
      setGridVisible(v);
      const next = typeof v === 'function' ? v(gridVisible) : v;
      mock.updateRoom({ grid_visible: next });
    },
    dockviewApi,
    setDockviewApi,

    // Auth
    profile: DEMO_PROFILE,
    user: DEMO_USER,
    signOut: async () => {},
    updateProfile: async () => {},

    // Members
    members: [],
    setMembers: () => {},

    // Derived
    boardRef,
    getBoardCenter,
    onAddObject,
    clearAllEditing,
    setPendingEdit,
    registerPanel,
    unregisterPanel,

    // Loading
    isLoading: false,
    loadingProgress: 1,
    loadingSteps: [],

    // Toast
    toasts,
    showToast,

    // Undo/Redo
    undoRedo: { ...undoRedo, undo: handleUndo, redo: handleRedo },

    // Keyboard actions ref
    resolveAssetId,
    keyboardActionsRef: { current: {} },

    // Demo mode
    isDemo: true,
  } as unknown as AdrasteaContextValue;

  return <AdrasteaContext.Provider value={value}>{children}</AdrasteaContext.Provider>;
};
