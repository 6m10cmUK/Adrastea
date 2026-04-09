import { useState } from 'react';
import type { Room } from '../types/adrastea.types';
import { AdInput, AdButton, AdModal, AdTextArea } from './ui';

interface RoomSettingsModalProps {
  room: Room;
  onSave: (updates: { name?: string; description?: string; dice_system?: string }) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function RoomSettingsModal({ room, onSave, onDelete, onClose }: RoomSettingsModalProps) {
  const [name, setName] = useState(room.name ?? '');
  const [description, setDescription] = useState(room.description ?? '');
  const [diceSystem, setDiceSystem] = useState(room.dice_system ?? 'DiceBot');

  const handleSave = () => {
    onSave({
      name: name.trim() || room.name,
      description: description.trim() || undefined,
      dice_system: diceSystem.trim() || 'DiceBot',
    });
    onClose();
  };

  return (
    <AdModal
      title="ルーム設定"
      width="400px"
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <AdButton
            variant="danger"
            onClick={() => {
              if (window.confirm('このルームを削除しますか？この操作は取り消せません。')) {
                onDelete();
                onClose();
              }
            }}
          >
            ルームを削除
          </AdButton>
          <div style={{ display: 'flex', gap: '8px' }}>
            <AdButton onClick={onClose}>キャンセル</AdButton>
            <AdButton variant="primary" onClick={handleSave}>保存</AdButton>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <AdInput
          label="ルーム名"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ルーム名を入力"
        />
        <AdTextArea
          label="説明"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="セッションの説明など（任意）"
          rows={3}
        />
        <AdInput
          label="ダイスシステム"
          value={diceSystem}
          onChange={(e) => setDiceSystem(e.target.value)}
          placeholder="DiceBot"
        />
      </div>
    </AdModal>
  );
}
