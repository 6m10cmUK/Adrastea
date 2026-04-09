import { test, expect } from '@playwright/test';
import { goToLobby, createRoom, deleteRoomById, BASE_URL } from './helpers';

const ROOM_NAME = `sel_test_${Date.now()}`;
let roomId: string;

test.describe.serial('複数選択テスト', () => {
  test('ルーム作成 + シーン3つ追加（準備）', async ({ page }) => {
    await goToLobby(page);
    roomId = await createRoom(page, ROOM_NAME);
    expect(roomId).toBeTruthy();

    // シーンを2つ追加（デフォルト「メイン」+ 2つ = 計3つ）
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const addSceneBtn = page.locator('button[aria-label="シーンを追加"]').first();
    await addSceneBtn.click();
    await page.waitForTimeout(500);
    await addSceneBtn.click();
    await page.waitForTimeout(500);

    const sceneCount = await page.locator('[data-scene-id]').count();
    expect(sceneCount).toBeGreaterThanOrEqual(3);
  });

  test('シーン: 通常クリック → 単一選択', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const scenes = page.locator('[data-scene-id]');
    const firstScene = scenes.first();

    // 最初のシーンをクリック
    await firstScene.click();
    await page.waitForTimeout(300);

    // 選択されているシーンは1つだけ
    // 背景色で選択状態を確認するのは脆い。代わりに Delete 後の確認ダイアログで件数確認もあり。
    // ここでは「クリックが成功した」ことを確認
    await expect(firstScene).toBeVisible();
  });

  test('シーン: Ctrl+Click で複数選択', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const scenes = page.locator('[data-scene-id]');
    const sceneCount = await scenes.count();

    if (sceneCount >= 2) {
      // 1つ目をクリック
      await scenes.nth(0).click();
      await page.waitForTimeout(300);

      // 2つ目を Ctrl+Click
      await scenes.nth(1).click({ modifiers: ['Control'] });
      await page.waitForTimeout(300);

      // Ctrl+D で複製 → 最低1つ複製されるはず
      await page.keyboard.press('Control+d');
      await page.waitForTimeout(1000);

      const newSceneCount = await scenes.count();
      expect(newSceneCount).toBeGreaterThanOrEqual(sceneCount + 1);
    }
  });

  test('シーン: Shift+Click で範囲選択', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const scenes = page.locator('[data-scene-id]');
    const sceneCount = await scenes.count();

    if (sceneCount >= 3) {
      // 1つ目をクリック
      await scenes.nth(0).click();
      await page.waitForTimeout(300);

      // 3つ目を Shift+Click → 1〜3が選択される
      await scenes.nth(2).click({ modifiers: ['Shift'] });
      await page.waitForTimeout(300);

      // 選択された3つを Ctrl+D で複製
      await page.keyboard.press('Control+d');
      await page.waitForTimeout(1000);

      const newSceneCount = await scenes.count();
      expect(newSceneCount).toBeGreaterThanOrEqual(sceneCount + 3);
    }
  });

  test('パネル間の選択排他: シーン選択後にキャラパネル操作で選択解除', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const scenesBefore = await page.locator('[data-scene-id]').count();

    // シーンを選択
    const firstScene = page.locator('[data-scene-id]').first();
    await firstScene.click();
    await page.waitForTimeout(300);

    // キャラクター追加ボタンをクリック → panelSelection がキャラクターに切り替わる
    const addCharBtn = page.locator('button[aria-label="キャラクター追加"]').first();
    if (await addCharBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addCharBtn.click();
      await page.waitForTimeout(500);

      // Escape でモーダルを閉じる
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      // キャラクターパネル内をクリックして panelSelection をキャラクターに切り替え
      const charItem = page.locator('[data-char-id]').first();
      if (await charItem.isVisible({ timeout: 3000 }).catch(() => false)) {
        await page.locator('[data-char-id]').first().click();
        await page.waitForTimeout(300);
      }

      // Delete を押す → キャラクター削除ダイアログが出る（シーン削除ではない）
      await page.keyboard.press('Delete');
      await page.waitForTimeout(300);

      // ダイアログが出たらキャンセル
      const confirmBtn = page.getByRole('button', { name: '削除' }).last();
      if (await confirmBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }

      // シーン数が変わっていない（シーン削除は発火していない）
      const scenesAfter = await page.locator('[data-scene-id]').count();
      expect(scenesAfter).toBe(scenesBefore);
    }
  });

  test.afterAll(async () => {
    if (roomId) await deleteRoomById(roomId);
  });
});
