import { useAdrasteaContext } from '../../contexts/AdrasteaContext';
import { useAuth } from '../../contexts/AuthContext';
import ChatLogPanel from '../ChatLogPanel';

export function ChatLogDockPanel() {
  const ctx = useAdrasteaContext();
  const { token } = useAuth();
  return (
    <ChatLogPanel
      messages={ctx.messages}
      loading={ctx.chatLoading}
      loadingMore={ctx.loadingMore}
      hasMore={ctx.hasMore}
      roomName={ctx.room?.name}
      roomId={ctx.roomId ?? undefined}
      authToken={token ?? undefined}
      characters={ctx.characters}
      onLoadMore={ctx.loadMore}
      onClearMessages={ctx.clearMessages}
      onOpenSecretDice={ctx.openSecretDice}
      onEditMessage={ctx.editMessage}
      onDeleteMessage={ctx.deleteMessage}
    />
  );
}
