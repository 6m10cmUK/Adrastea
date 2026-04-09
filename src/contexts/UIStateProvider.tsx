import React, { useContext, useState, useMemo } from 'react';
import type { DockviewApi } from 'dockview';
import type {
  Scene,
  Character,
  Cutin,
} from '../types/adrastea.types';
import type { UIStateContextValue, PendingEdit } from './AdrasteaContexts';
import type { PanelSelection } from './AdrasteaContext';
import { UIStateContext } from './AdrasteaContexts';

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface UIStateProviderProps {
  children: React.ReactNode;
  setPendingEdit: (key: string, edit: PendingEdit | null) => void;
}

export const UIStateProvider: React.FC<UIStateProviderProps> = ({
  children,
  setPendingEdit: propSetPendingEdit,
}) => {
  // NOTE: Lazy-loaded data (scenarioTexts, cutins) は AdrasteaContext で管理される

  // --- UI state ---
  const [editingPieceId, setEditingPieceId] = useState<string | null>(null);
  const [showSettings, setShowSettingsState] = useState(false);
  const [settingsSection, setSettingsSection] = useState<'room' | 'layout' | 'user'>('room');

  const setShowSettings = React.useCallback((show: boolean, section: 'room' | 'layout' | 'user' = 'room') => {
    setShowSettingsState(show);
    if (show) setSettingsSection(section);
  }, []);

  const [panelSelection, setPanelSelection] = useState<PanelSelection | null>(null);
  const selectedObjectIds = panelSelection?.panel === 'layer' ? panelSelection.ids : [];
  const setSelectedObjectIds: React.Dispatch<React.SetStateAction<string[]>> = React.useCallback((action) => {
    setPanelSelection(prev => {
      const prevIds = prev?.panel === 'layer' ? prev.ids : [];
      const newIds = typeof action === 'function' ? action(prevIds) : action;
      return newIds.length > 0 ? { panel: 'layer', ids: newIds } : null;
    });
  }, []);

  const [editingScene, setEditingScene] = useState<Scene | null | undefined>(undefined);
  const [editingCharacter, setEditingCharacter] = useState<Character | null | undefined>(undefined);
  const [editingObjectId, setEditingObjectId] = useState<string | null | undefined>(undefined);
  const [editingCutin, setEditingCutin] = useState<Cutin | null | undefined>(undefined);
  const [editingBgmId, setEditingBgmId] = useState<string | null>(null);
  const [editingScenarioTextId, setEditingScenarioTextId] = useState<string | null>(null);

  // --- Dockview ---
  const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null);
  const [statusPanelBoardOverlay, setStatusPanelBoardOverlay] = useState(false);

  // --- Grid visibility ---
  const [gridVisible, setGridVisible] = useState(false);

  // --- BGM master volume (localStorage) ---
  const [masterVolume, setMasterVolumeState] = useState(() => {
    const saved = localStorage.getItem('adrastea-master-volume');
    return saved !== null ? Number(saved) : 0.5;
  });
  const [bgmMuted, setBgmMutedState] = useState(() => {
    return localStorage.getItem('adrastea-bgm-muted') === 'true';
  });
  const setMasterVolume = React.useCallback((v: number) => {
    setMasterVolumeState(v);
    localStorage.setItem('adrastea-master-volume', String(v));
  }, []);
  const setBgmMuted = React.useCallback((v: boolean) => {
    setBgmMutedState(v);
    localStorage.setItem('adrastea-bgm-muted', String(v));
  }, []);

  // NOTE: Auto-save edits logic は AdrasteaContext で管理される

  const clearAllEditing = React.useCallback(() => {
    setEditingPieceId(null);
    setEditingObjectId(undefined);
    setEditingScene(undefined);
    setEditingCharacter(undefined);
    setEditingCutin(undefined);
    setEditingBgmId(null);
    setEditingScenarioTextId(null);
    // NOTE: panelSelection は clearAllEditing では触らない。
    // 選択状態は setPanelSelection で排他的に管理する。
  }, []);

  // --- Context value ---
  const value = useMemo<UIStateContextValue>(
    () => ({
      // UI editing state
      editingScene,
      setEditingScene,
      editingCharacter,
      setEditingCharacter,
      editingCutin,
      setEditingCutin,
      editingBgmId,
      setEditingBgmId,
      editingScenarioTextId,
      setEditingScenarioTextId,
      editingPieceId,
      setEditingPieceId,
      editingObjectId,
      setEditingObjectId,
      selectedObjectIds,
      setSelectedObjectIds,
      panelSelection,
      setPanelSelection,
      showRoomSettings: showSettings && settingsSection === 'room',
      setShowRoomSettings: (v: boolean) => setShowSettings(v, 'room'),
      showProfileEdit: showSettings && settingsSection === 'user',
      setShowProfileEdit: (v: boolean) => setShowSettings(v, 'user'),
      showSettings,
      settingsSection,
      setShowSettings,
      // BGM master volume
      masterVolume,
      setMasterVolume,
      bgmMuted,
      setBgmMuted,
      // Grid
      gridVisible,
      setGridVisible,
      // Dockview
      dockviewApi,
      setDockviewApi,
      statusPanelBoardOverlay,
      setStatusPanelBoardOverlay,
      // Auto-save edits
      setPendingEdit: propSetPendingEdit,
      // 排他編集リセット
      clearAllEditing,
    }),
    [
      editingScene,
      editingCharacter,
      editingCutin,
      editingBgmId,
      editingScenarioTextId,
      editingPieceId,
      editingObjectId,
      panelSelection,
      showSettings,
      settingsSection,
      setShowSettings,
      masterVolume,
      bgmMuted,
      gridVisible,
      dockviewApi,
      statusPanelBoardOverlay,
      propSetPendingEdit,
      clearAllEditing,
      setSelectedObjectIds,
    ]
  );

  return (
    <UIStateContext.Provider value={value}>
      {children}
    </UIStateContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

export function useUIState(): UIStateContextValue {
  const ctx = useContext(UIStateContext);
  if (!ctx) {
    throw new Error('useUIState must be used within UIStateProvider');
  }
  return ctx;
}
