import { useAdrasteaContext } from '../../contexts/AdrasteaContext';
import { TopToolbar } from '../TopToolbar';

export function ToolbarDockPanel() {
  const ctx = useAdrasteaContext();
  return (
    <TopToolbar
      onOpenSettings={() => ctx.setShowRoomSettings(true)}
      onOpenProfile={() => ctx.setShowProfileEdit(true)}
      onSignOut={ctx.signOut}
      onOpenLayout={() => ctx.setShowSettings(true, 'layout')}
      activeScene={ctx.activeScene}
      profile={ctx.profile}
      dockviewApi={ctx.dockviewApi}
    />
  );
}
