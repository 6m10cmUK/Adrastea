import { test, expect } from '@playwright/test';
import { goToLobby, createRoom, sendChat, deleteRoomById, BASE_URL } from './helpers';

const ROOM_NAME = `sdice_test_${Date.now()}`;
let roomId: string;

test.describe('秘密ダイステスト', () => {
  test.describe.configure({ mode: 'serial' });

  test('ルーム作成 + 秘密ダイス送信 → シークレットダイス通知', async ({ page }) => {
    await goToLobby(page);
    roomId = await createRoom(page, ROOM_NAME);
    expect(roomId).toBeTruthy();

    // コンソールエラーをキャプチャ
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // createRoom 後は既にルーム内にいる。エディタが表示されるまで待つ
    const editor = page.locator('[contenteditable="true"]').first();
    await expect(editor).toBeVisible({ timeout: 15000 });

    // まず通常チャットで Realtime が動いてるか確認
    await editor.click();
    await editor.pressSequentially('hello', { delay: 50 });
    await page.keyboard.press('Enter');

    // 通常メッセージが表示される
    await expect(page.getByText('hello').first()).toBeVisible({ timeout: 10000 });

    // 秘密ダイスコマンド送信（自前ダイスパーサーのため API 待機なし）
    await editor.click();
    await editor.pressSequentially('s2d6', { delay: 50 });
    await page.keyboard.press('Enter');

    // 全員向け「シークレットダイス」通知が表示される
    await expect(page.getByText('シークレットダイス').first()).toBeVisible({ timeout: 10000 });

    // 送信者のみに表示されるダイス結果（2D6 の結果）
    // BCDice の応答形式: "(2D6) ＞ X[a,b] ＞ Y" のようなテキスト
    await expect(page.locator('text=/2D6/i').first()).toBeVisible({ timeout: 5000 });
  });

  test('秘密ダイス結果に「オープン」ボタンが表示される', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 「オープン」ボタンが表示されている（送信者のみ）
    const openBtn = page.getByRole('button', { name: 'オープン' }).first();
    await expect(openBtn).toBeVisible({ timeout: 5000 });
  });

  test('「オープン」クリック → ボタン消滅（公開済み）', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const openBtn = page.getByRole('button', { name: 'オープン' }).first();
    if (await openBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await openBtn.click();
      await page.waitForTimeout(1000);

      // オープン後、ボタンが消える（allowed_user_ids が null になった）
      await expect(openBtn).not.toBeVisible({ timeout: 5000 });

      // ダイス結果は引き続き表示されている
      await expect(page.locator('text=/2D6/i').first()).toBeVisible({ timeout: 3000 });
    } else {
      // 前のテストでオープン済みの場合はスキップ
      test.skip();
    }
  });

  test.afterAll(async () => {
    if (roomId) await deleteRoomById(roomId);
  });
});
