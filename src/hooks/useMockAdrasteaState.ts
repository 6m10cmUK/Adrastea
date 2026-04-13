import { useState, useCallback, useMemo } from 'react';
import type {
  Scene,
  BoardObject,
  Character,
  BgmTrack,
  Cutin,
  ScenarioText,
  Room,
  ChatMessage,
} from '../types/adrastea.types';
import type {
  ScenesInject,
  ObjectsInject,
  CharactersInject,
  BgmsInject,
  CutinsInject,
  ChatInject,
} from '../types/adrastea-persistence';

// --- モックデータ ---

const DEMO_ROOM: Room = {
  id: 'demo-room-001',
  owner_id: 'demo-user',
  name: 'Adrastea デモ',
  active_scene_id: 'demo-scene-1',
  active_cutin: null,
  thumbnail_asset_id: null,
  dice_system: 'DiceBot',
  gm_can_see_secret_memo: true,
  default_login_role: 'guest',
  status_change_chat_enabled: true,
  status_change_chat_channel: 'main',
  grid_visible: false,
  created_at: Date.now(),
  updated_at: Date.now(),
};

const DEMO_SCENES: Scene[] = [
  {
    id: 'demo-scene-1',
    room_id: 'demo-room-001',
    name: 'メイン',
    background_asset_id: null,
    foreground_asset_id: null,
    foreground_opacity: 1,
    bg_transition: 'none',
    bg_transition_duration: 500,
    fg_transition: 'none',
    fg_transition_duration: 500,
    bg_blur: true,
    bg_color_enabled: true,
    bg_color: '#222222',
    fg_color_enabled: true,
    fg_color: '#111111',
    foreground_x: -24,
    foreground_y: -14,
    foreground_width: 48,
    foreground_height: 27,
    sort_order: 0,
    created_at: Date.now(),
    updated_at: Date.now(),
  },
];

const DEMO_OBJECTS: BoardObject[] = [
  {
    id: 'demo-obj-bg', room_id: 'demo-room-001', type: 'background', name: '背景',
    global: true, scene_ids: [], x: 0, y: 0, width: 0, height: 0,
    visible: true, opacity: 1, sort_order: -1,
    position_locked: true, size_locked: true,
    image_asset_id: null, background_color: '#222222', color_enabled: false, image_fit: 'cover',
    text_content: null, font_size: 16, font_family: 'sans-serif',
    letter_spacing: 0, line_height: 1.2, auto_size: true,
    text_align: 'left', text_vertical_align: 'top', text_color: '#ffffff',
    scale_x: 1, scale_y: 1, rotation: 0, created_at: Date.now(), updated_at: Date.now(),
  },
  {
    id: 'demo-obj-fg', room_id: 'demo-room-001', type: 'foreground', name: '前景',
    global: true, scene_ids: [], x: 0, y: 0, width: 0, height: 0,
    visible: true, opacity: 1, sort_order: 1_000_000,
    position_locked: true, size_locked: true,
    image_asset_id: null, background_color: '#111111', color_enabled: false, image_fit: 'cover',
    text_content: null, font_size: 16, font_family: 'sans-serif',
    letter_spacing: 0, line_height: 1.2, auto_size: true,
    text_align: 'left', text_vertical_align: 'top', text_color: '#ffffff',
    scale_x: 1, scale_y: 1, rotation: 0, created_at: Date.now(), updated_at: Date.now(),
  },
  {
    id: 'demo-obj-cl', room_id: 'demo-room-001', type: 'characters_layer', name: 'キャラクター',
    global: true, scene_ids: [], x: 0, y: 0, width: 0, height: 0,
    visible: true, opacity: 1, sort_order: 2_000_000,
    position_locked: true, size_locked: true,
    image_asset_id: null, background_color: '#333333', color_enabled: false, image_fit: 'cover',
    text_content: null, font_size: 16, font_family: 'sans-serif',
    letter_spacing: 0, line_height: 1.5, auto_size: false,
    text_align: 'left', text_vertical_align: 'top', text_color: '#000000',
    scale_x: 1, scale_y: 1, rotation: 0, created_at: Date.now(), updated_at: Date.now(),
  },
];

const DEMO_CHARACTERS: Character[] = [];

const DEMO_BGMS: BgmTrack[] = [];

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useMockAdrasteaState() {
  // === State ===
  const [room, setRoom] = useState<Room>(DEMO_ROOM);
  const [scenes, setScenes] = useState<Scene[]>(DEMO_SCENES);
  const [objects, setObjects] = useState<BoardObject[]>(DEMO_OBJECTS);
  const [characters, setCharacters] = useState<Character[]>(DEMO_CHARACTERS);
  const [bgms, setBgms] = useState<BgmTrack[]>(DEMO_BGMS);
  const [cutins, setCutins] = useState<Cutin[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [scenarioTexts, setScenarioTexts] = useState<ScenarioText[]>([]);

  // === Room ===
  const updateRoom = useCallback(async (data: Partial<Room>) => {
    setRoom(p => ({ ...p, ...data, updated_at: Date.now() }));
  }, []);

  // === Scenes inject ===
  const scenesCreate = useCallback(async (s: Scene) => setScenes(p => [...p, s]), []);
  const scenesUpdate = useCallback(async (id: string, data: Partial<Scene>) => {
    setScenes(p => p.map(s => s.id === id ? { ...s, ...data, updated_at: Date.now() } : s));
  }, []);
  const scenesRemove = useCallback(async (id: string) => {
    setScenes(p => p.filter(s => s.id !== id));
  }, []);
  const scenesReorder = useCallback(async (updates: { id: string; sort_order: number }[]) => {
    setScenes(p => {
      const map = new Map(updates.map(u => [u.id, u.sort_order]));
      return p.map(s => map.has(s.id) ? { ...s, sort_order: map.get(s.id)! } : s);
    });
  }, []);
  const objectsCreateBatch = useCallback(async (objs: BoardObject[]) => {
    setObjects(p => [...p, ...objs]);
  }, []);
  const scenesInject = useMemo<ScenesInject>(() => ({
    data: scenes,
    create: scenesCreate,
    update: scenesUpdate,
    remove: scenesRemove,
    reorder: scenesReorder,
    createObjectBatch: objectsCreateBatch,
  }), [scenes, scenesCreate, scenesUpdate, scenesRemove, scenesReorder, objectsCreateBatch]);

  // === Objects inject ===
  const objectsCreate = useCallback(async (o: BoardObject) => setObjects(p => [...p, o]), []);
  const objectsUpdate = useCallback(async (id: string, data: Partial<BoardObject>) => {
    setObjects(p => p.map(o => o.id === id ? { ...o, ...data, updated_at: Date.now() } : o));
  }, []);
  const objectsRemove = useCallback(async (id: string) => {
    setObjects(p => p.filter(o => o.id !== id));
  }, []);
  const objectsReorder = useCallback(async (updates: { id: string; sort_order: number }[]) => {
    setObjects(p => {
      const map = new Map(updates.map(u => [u.id, u.sort_order]));
      return p.map(o => map.has(o.id) ? { ...o, sort_order: map.get(o.id)! } : o);
    });
  }, []);
  const objectsBatchUpdateSort = useCallback(async (updates: { id: string; sort: number }[]) => {
    setObjects(p => {
      const map = new Map(updates.map(u => [u.id, u.sort]));
      return p.map(o => map.has(o.id) ? { ...o, sort_order: map.get(o.id)! } : o);
    });
  }, []);
  const objectsInject = useMemo<ObjectsInject>(() => ({
    data: objects,
    create: objectsCreate,
    update: objectsUpdate,
    remove: objectsRemove,
    reorder: objectsReorder,
    batchUpdateSort: objectsBatchUpdateSort,
  }), [objects, objectsCreate, objectsUpdate, objectsRemove, objectsReorder, objectsBatchUpdateSort]);

  // === Characters inject ===
  const charactersCreate = useCallback(async (c: Character) => setCharacters(p => [...p, c]), []);
  const charactersUpdate = useCallback(async (id: string, data: Partial<Character>) => {
    setCharacters(p => p.map(c => c.id === id ? { ...c, ...data, updated_at: Date.now() } : c));
  }, []);
  const charactersMove = useCallback(async (id: string, data: { board_x?: number; board_y?: number }) => {
    setCharacters(p => p.map(c => c.id === id ? { ...c, ...data, updated_at: Date.now() } : c));
  }, []);
  const charactersRemove = useCallback(async (id: string) => {
    setCharacters(p => p.filter(c => c.id !== id));
  }, []);
  const charactersInject = useMemo<CharactersInject>(() => ({
    data: characters,
    create: charactersCreate,
    update: charactersUpdate,
    move: charactersMove,
    remove: charactersRemove,
  }), [characters, charactersCreate, charactersUpdate, charactersMove, charactersRemove]);

  // === Bgms inject ===
  const bgmsCreate = useCallback(async (b: BgmTrack) => setBgms(p => [...p, b]), []);
  const bgmsUpdate = useCallback(async (id: string, data: Partial<BgmTrack>) => {
    setBgms(p => p.map(b => b.id === id ? { ...b, ...data, updated_at: Date.now() } : b));
  }, []);
  const bgmsRemove = useCallback(async (id: string) => {
    setBgms(p => p.filter(b => b.id !== id));
  }, []);
  const bgmsInject = useMemo<BgmsInject>(() => ({
    data: bgms,
    create: bgmsCreate,
    update: bgmsUpdate,
    remove: bgmsRemove,
  }), [bgms, bgmsCreate, bgmsUpdate, bgmsRemove]);

  // === Cutins inject ===
  const cutinsCreate = useCallback(async (c: Cutin) => setCutins(p => [...p, c]), []);
  const cutinsUpdate = useCallback(async (id: string, data: Partial<Cutin>) => {
    setCutins(p => p.map(c => c.id === id ? { ...c, ...data, updated_at: Date.now() } : c));
  }, []);
  const cutinsRemove = useCallback(async (id: string) => {
    setCutins(p => p.filter(c => c.id !== id));
  }, []);
  const cutinsReorder = useCallback(async (updates: { id: string; sort_order: number }[]) => {
    setCutins(p => {
      const map = new Map(updates.map(u => [u.id, u.sort_order]));
      return p.map(c => map.has(c.id) ? { ...c, sort_order: map.get(c.id)! } : c);
    });
  }, []);
  const cutinsTrigger = useCallback((id: string) => {
    setRoom(p => ({ ...p, active_cutin: { cutin_id: id, triggered_at: Date.now() } as any }));
  }, []);
  const cutinsClear = useCallback(() => {
    setRoom(p => ({ ...p, active_cutin: null }));
  }, []);
  const cutinsInject = useMemo<CutinsInject>(() => ({
    data: cutins,
    create: cutinsCreate,
    update: cutinsUpdate,
    remove: cutinsRemove,
    reorder: cutinsReorder,
    triggerCutin: cutinsTrigger,
    clearCutin: cutinsClear,
  }), [cutins, cutinsCreate, cutinsUpdate, cutinsRemove, cutinsReorder, cutinsTrigger, cutinsClear]);

  // === Chat inject ===
  const chatSend = useCallback(async (
    senderName: string,
    content: string,
    messageType: ChatMessage['message_type'] = 'chat',
    _senderUid?: string,
    senderAvatarAssetId?: string | null,
    _diceSystem?: string,
    channel?: string,
    allowedUserIds?: string[],
  ): Promise<ChatMessage | null> => {
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      room_id: 'demo-room-001',
      sender_name: senderName,
      sender_uid: 'demo-user',
      sender_avatar_asset_id: senderAvatarAssetId ?? null,
      content,
      channel: channel ?? 'main',
      message_type: messageType,
      allowed_user_ids: allowedUserIds,
      created_at: Date.now(),
    };
    setMessages(p => [...p, msg]);
    return msg;
  }, []);
  const chatInject = useMemo<ChatInject>(() => ({
    data: messages,
    send: chatSend,
  }), [messages, chatSend]);

  // === ScenarioTexts (本番 hook なし) ===
  const addScenarioText = useCallback(async (data: Partial<ScenarioText>) => {
    const id = crypto.randomUUID();
    const now = Date.now();
    const newText: ScenarioText = {
      id, room_id: 'demo-room-001',
      title: data.title ?? '新規シナリオテキスト',
      content: data.content ?? '',
      visible: data.visible ?? true,
      sort_order: data.sort_order ?? 0,
      speaker_character_id: data.speaker_character_id ?? null,
      speaker_name: data.speaker_name ?? null,
      channel_id: data.channel_id ?? null,
      created_at: now, updated_at: now,
    };
    setScenarioTexts(p => [...p, newText]);
    return id;
  }, []);
  const updateScenarioText = useCallback(async (id: string, data: Partial<ScenarioText>) => {
    setScenarioTexts(p => p.map(t => t.id === id ? { ...t, ...data, updated_at: Date.now() } : t));
  }, []);
  const removeScenarioText = useCallback(async (id: string) => {
    setScenarioTexts(p => p.filter(t => t.id !== id));
  }, []);
  const reorderScenarioTexts = useCallback(async (orderedIds: string[]) => {
    setScenarioTexts(p => {
      const map = new Map(p.map(t => [t.id, t]));
      return orderedIds.map((id, i) => {
        const t = map.get(id);
        return t ? { ...t, sort_order: i } : null;
      }).filter(Boolean) as ScenarioText[];
    });
  }, []);


  return {
    // Room (inject 対象外)
    room,
    updateRoom,
    // Inject objects
    scenesInject,
    objectsInject,
    charactersInject,
    bgmsInject,
    cutinsInject,
    chatInject,
    // ScenarioTexts (inject 対象外)
    scenarioTexts,
    addScenarioText,
    updateScenarioText,
    removeScenarioText,
    reorderScenarioTexts,
  };
}
