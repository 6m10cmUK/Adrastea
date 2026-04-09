import { useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useAdrasteaContext } from '../../contexts/AdrasteaContext';
import ChatInputPanel from '../ChatInputPanel';

export function ChatInputDockPanel() {
  const ctx = useAdrasteaContext();
  const { user } = useAuth();

  const filteredCharacters = useMemo(
    () => ctx.characters.filter(c => c.owner_id === user?.uid),
    [ctx.characters, user?.uid]
  );

  return (
    <ChatInputPanel
      characters={filteredCharacters}
      onSendMessage={ctx.handleSendMessage}
    />
  );
}
