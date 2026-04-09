import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function readSrc(relPath: string): string {
  return readFileSync(resolve(__dirname, '..', relPath), 'utf-8');
}

describe('Phase 5 — ロビーカード', () => {
  const lobby = readSrc('components/Adrastea/RoomLobby.tsx');

  it('ロビー全体の背景が bgDeep を使っている', () => {
    expect(lobby).toContain('theme.bgDeep');
  });

  it('カードホバー時に bgElevated を使っている', () => {
    expect(lobby).toContain('theme.bgElevated');
  });

  it('ホバー時に accent の border-top がある', () => {
    expect(lobby).toContain('theme.accent');
    expect(lobby).toMatch(/borderTop.*theme\.accent/);
  });

  it('非ホバー時の border-top は transparent', () => {
    expect(lobby).toMatch(/borderTop.*transparent/);
  });
});

describe('Phase 6 — チャット送信ボタン', () => {
  const chatInput = readSrc('components/Adrastea/ChatInputPanel.tsx');

  it('SendHorizonal アイコンがインポートされている', () => {
    expect(chatInput).toContain('SendHorizonal');
  });

  it('送信ボタンが SendHorizonal を使っている', () => {
    expect(chatInput).toContain('<SendHorizonal');
  });

  it('「送信」テキストがボタン内にない', () => {
    expect(chatInput).not.toMatch(/>[\s]*送信[\s]*<\/button>/);
  });

  it('チャット周辺 UI（入力・エディタ・ドロップダウン）が bgElevated を使っている', () => {
    const editor = readSrc('components/Adrastea/ChatEditor.tsx');
    const dropdown = readSrc('components/Adrastea/ui/DropdownMenu.tsx');
    const n =
      (chatInput.match(/theme\.bgElevated/g) ?? []).length +
      (editor.match(/theme\.bgElevated/g) ?? []).length +
      (dropdown.match(/theme\.bgElevated/g) ?? []).length;
    expect(n).toBeGreaterThanOrEqual(3);
  });
});
