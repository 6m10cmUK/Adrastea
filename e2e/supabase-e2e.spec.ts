import { test, expect } from '@playwright/test';
import { goToLobby, createRoom, enterRoom, addScene, sendChat, deleteRoom, deleteRoomById, BASE_URL } from './helpers';

const ROOM_NAME = `テスト_${Date.now()}`;

test.describe.serial('Adrastea Supabase E2E', () => {
  let roomId: string;

  test('ロビー画面が表示される', async ({ page }) => {
    await goToLobby(page);
    await expect(page.getByRole('heading', { name: /Adrastea/ })).toBeVisible();
    await expect(page.getByText('ルームを作成')).toBeVisible();
  });

  test('ルーム作成 → 一覧に表示', async ({ page }) => {
    await goToLobby(page);
    roomId = await createRoom(page, ROOM_NAME);
    expect(roomId).toBeTruthy();
    await goToLobby(page);
    await expect(page.getByText(ROOM_NAME)).toBeVisible();
  });

  test('ルーム入室 → エディタ表示', async ({ page }) => {
    await goToLobby(page);
    await enterRoom(page, ROOM_NAME);
    // エディタの主要パネルタブが表示されることを確認
    await expect(page.getByText('シーン').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('レイヤー').first()).toBeVisible();
    await expect(page.getByText('Board')).toBeVisible();
  });

  test('デフォルトシーン「メイン」が存在', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('メイン').first()).toBeVisible({ timeout: 10000 });
  });

  test('シーン追加 → シーン一覧に表示', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await addScene(page);
    await expect(page.getByText('新しいシーン')).toBeVisible({ timeout: 5000 });
  });

  test('チャットメッセージ送信 → ログに表示', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    const testMsg = `e2e_test_${Date.now()}`;
    await sendChat(page, testMsg);
    await expect(page.getByText(testMsg).first()).toBeVisible({ timeout: 5000 });
  });

  test('ダイスロール → 結果表示', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await sendChat(page, '1d6');
    // ダイス結果「1D6 > N」がチャットに表示される
    await expect(page.getByText(/1D6/).first()).toBeVisible({ timeout: 5000 });
  });

  test('ルーム削除 → 一覧から消える', async ({ page }) => {
    await deleteRoom(page, ROOM_NAME);
    await goToLobby(page);
    await expect(page.getByText(ROOM_NAME)).not.toBeVisible({ timeout: 10000 });
  });

  // UI 削除テストが失敗してもルームを確実に消す
  test.afterAll(async () => {
    if (roomId) await deleteRoomById(roomId);
  });
});
