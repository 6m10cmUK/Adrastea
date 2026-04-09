import React, { useEffect } from 'react';
import { MockAdrasteaProvider } from '../contexts/MockAdrasteaProvider';
import { DockLayout } from '../components/DockLayout';
import { TopToolbar } from '../components/TopToolbar';
import { SettingsModal } from '../components/SettingsModal';
import { CutinOverlay } from '../components/CutinOverlay';
import { ToastContainer } from '../components/ui/Toast';
import { useAdrasteaContext } from '../contexts/AdrasteaContext';
import { usePermission } from '../hooks/usePermission';
import { usePasteHandler } from '../hooks/usePasteHandler';
import { pasteSceneFromClipboard, pasteBgmToScene } from '../utils/clipboardImport';
import { theme } from '../styles/theme';

function AdrasteaDemoRoom() {
  const ctx = useAdrasteaContext();
  const { can } = usePermission();
  const isOwner = ctx.roomRole === 'owner';

  // Undo/Redo キーバインド
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'z') return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.contentEditable === 'true')) return;
      e.preventDefault();
      if (e.shiftKey) { ctx.undoRedo.redo(); } else { ctx.undoRedo.undo(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [ctx.undoRedo]);

  usePasteHandler({
    addCharacter: (data) => ctx.addCharacter({ ...data, owner_id: ctx.user?.uid ?? '' }),
    addObject: async (data) => {
      const { sort_order: _so, ...rest } = data;
      return ctx.addObject({ ...rest, scene_ids: rest.global ? [] : (ctx.activeScene ? [ctx.activeScene.id] : []) });
    },
    addScene: (data) => pasteSceneFromClipboard(data, ctx),
    addBgm: (data) => pasteBgmToScene(data, ctx.activeScene?.id ?? null, ctx),
    showToast: ctx.showToast,
    updateObject: ctx.updateObject,
    allObjects: ctx.activeObjects,
    activeSceneId: ctx.activeScene?.id ?? null,
    existingCharacterNames: ctx.characters?.map(c => c.name),
    existingScenarioTitles: ctx.scenarioTexts?.map(t => t.title),
  });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        background: theme.bgBase,
        display: 'flex',
        flexDirection: 'column',
      }}
      className="adrastea-root"
    >
      <TopToolbar
        onOpenSettings={() => ctx.setShowSettings(true, 'room')}
        onOpenProfile={() => {
          ctx.showToast('デモ環境ではプロフィール編集はサポートされていません', 'error');
        }}
        onOpenLayout={() => ctx.setShowSettings(true, 'layout')}
        onSignOut={() => {
          ctx.showToast('ログアウト機能はデモ環境では無効です', 'error');
        }}
        activeScene={ctx.activeScene}
        profile={ctx.profile}
        dockviewApi={ctx.dockviewApi}
        roomName={ctx.room?.name}
      />

      <div style={{ flex: 1, position: 'relative', zIndex: 0 }}>
        <DockLayout />
      </div>

      <CutinOverlay
        cutins={ctx.cutins}
        activeCutin={ctx.room?.active_cutin ?? null}
        onCutinEnd={ctx.clearCutin}
      />

      {ctx.showSettings && ctx.room && ctx.user && (
        <SettingsModal
          initialSection={ctx.settingsSection}
          room={ctx.room}
          onSaveRoom={(updates) => {
            ctx.updateRoom(updates);
            ctx.showToast('設定を保存しました', 'success');
          }}
          onDeleteRoom={() => {
            ctx.showToast('デモ環境ではルーム削除はサポートされていません', 'error');
          }}
          dockviewApi={ctx.dockviewApi}
          can={can}
          isOwner={isOwner}
          members={[]}
          onAssignRole={() => {
            ctx.showToast('デモ環境ではメンバー管理はサポートされていません', 'error');
          }}
          onClose={() => ctx.setShowSettings(false)}
        />
      )}

      <ToastContainer toasts={ctx.toasts} />
    </div>
  );
}

export default function AdrasteaDemo() {
  useEffect(() => {
    document.title = 'Adrastea Demo';
  }, []);

  return (
    <MockAdrasteaProvider>
      <AdrasteaDemoRoom />
    </MockAdrasteaProvider>
  );
}
