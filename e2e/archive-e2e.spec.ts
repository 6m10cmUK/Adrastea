import { test, expect } from '@playwright/test';
import { goToLobby, createRoom, deleteRoomById, archiveRoom, createCharacterDirect, createSceneDirect, BASE_URL } from './helpers';

const ROOM_NAME = `archive_test_${Date.now()}`;
let roomId: string;

test.describe('アーカイブ・復元テスト', () => {
  test.describe.configure({ mode: 'serial' });

  test('ルーム作成 + データ投入（API）', async ({ page }) => {
    await goToLobby(page);
    roomId = await createRoom(page, ROOM_NAME);
    expect(roomId).toBeTruthy();

    // API でデータを直接投入（UI 操作より高速・安定）
    await createCharacterDirect(roomId, 'アーカイブテストキャラ');
    await createSceneDirect(roomId, 'テストシーン2');
    // BGM はシーン割り当て（scene_ids）の問題でアーカイブテストでは省略

    // チャットメッセージも送信
    const editor = page.locator('[contenteditable="true"]').first();
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.click();
    await editor.pressSequentially('archive-test-msg', { delay: 30 });
    await page.keyboard.press('Enter');
    await expect(page.getByText('archive-test-msg').first()).toBeVisible({ timeout: 5000 });
  });

  test('アーカイブ前のデータ確認', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    const editor = page.locator('[contenteditable="true"]').first();
    await expect(editor).toBeVisible({ timeout: 30000 });

    // キャラクターが表示される
    await expect(page.getByText('アーカイブテストキャラ').first()).toBeVisible({ timeout: 5000 });
    // シーンが2つある（メイン + テストシーン2）
    await expect(page.getByText('テストシーン2').first()).toBeVisible({ timeout: 5000 });
    // メッセージが表示される
    await expect(page.getByText('archive-test-msg').first()).toBeVisible({ timeout: 5000 });
  });

  test('Worker API でアーカイブ実行', async () => {
    await archiveRoom(roomId);
  });

  test('アーカイブ済みルーム入室 → 自動復元', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);

    // 復元フロー: archived=1 検出 → Worker restore API → page reload
    // 復元完了後にルームが表示される
    const editor = page.locator('[contenteditable="true"]').first();
    await expect(editor).toBeVisible({ timeout: 60000 });
  });

  test('復元後のデータ整合性', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    const editor = page.locator('[contenteditable="true"]').first();
    await expect(editor).toBeVisible({ timeout: 30000 });

    // キャラクターが復元されている
    await expect(page.getByText('アーカイブテストキャラ').first()).toBeVisible({ timeout: 5000 });
    // シーンが復元されている
    await expect(page.getByText('テストシーン2').first()).toBeVisible({ timeout: 5000 });
    // メッセージが残っている
    await expect(page.getByText('archive-test-msg').first()).toBeVisible({ timeout: 5000 });
  });

  test.afterAll(async () => {
    if (roomId) await deleteRoomById(roomId);
  });
});
