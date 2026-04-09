import { test, expect } from '@playwright/test';
import { goToLobby, createRoom, deleteRoomById, createBgmTrackDirect, getSceneIds, BASE_URL } from './helpers';

const ROOM_NAME = `bgm_test_${Date.now()}`;
let roomId: string;

const BGM_URL_1 = 'https://www.dropbox.com/scl/fi/qbry1e1h0gcisv7urbs3i/Rhuzerv.mp3?rlkey=9z8lhlbndhxy116f6g982dz6w&dl=1';
const BGM_URL_2 = 'https://www.dropbox.com/scl/fi/9udc6cqk8b2d0ngl1lhwf/.mp3?rlkey=f7fdzhedrzkwdfl4hxk9cau66&dl=1';

test.describe.serial('BGM管理テスト', () => {
  test('ルーム作成 + BGM トラック準備', async ({ page }) => {
    await goToLobby(page);
    roomId = await createRoom(page, ROOM_NAME);
    expect(roomId).toBeTruthy();

    const sceneIds = await getSceneIds(roomId);
    await createBgmTrackDirect(roomId, { name: 'テストBGM1', bgmSource: BGM_URL_1, sceneIds });
    await createBgmTrackDirect(roomId, { name: 'テストBGM2', bgmSource: BGM_URL_2, sceneIds });
  });

  test('BGMトラックが表示される', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.locator('[data-scene-id]').first().waitFor({ state: 'visible', timeout: 15000 });

    await expect(page.getByText('テストBGM1').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('テストBGM2').first()).toBeVisible({ timeout: 5000 });
  });

  test('BGM ボリュームスライダー操作', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.locator('[data-scene-id]').first().waitFor({ state: 'visible', timeout: 15000 });

    const track1 = page.getByText('テストBGM1').first();
    await track1.waitFor({ state: 'visible', timeout: 5000 });

    // トラック行を特定（data-track-id を使う）
    const trackRow = page.locator('[data-track-id]').first();
    await expect(trackRow).toBeVisible({ timeout: 5000 });

    // トラック行内のボリュームスライダー
    const volumeSlider = trackRow.locator('input[type="range"]').first();
    await expect(volumeSlider).toBeVisible({ timeout: 3000 });
    await volumeSlider.fill('0.3');
    await expect(volumeSlider).toHaveValue('0.3', { timeout: 3000 });
  });

  test('BGM ミュート機能', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.locator('[data-scene-id]').first().waitFor({ state: 'visible', timeout: 15000 });

    const trackRow = page.locator('[data-track-id]').first();
    await expect(trackRow).toBeVisible({ timeout: 5000 });

    // トラック行内のミュートボタン
    const muteBtn = trackRow.locator('button[title="ミュート"], button[title="ミュート解除"]').first();
    await expect(muteBtn).toBeVisible({ timeout: 3000 });

    const titleBefore = await muteBtn.getAttribute('title');
    await muteBtn.click();
    await page.waitForTimeout(300);

    const titleAfter = await muteBtn.getAttribute('title');
    expect(titleAfter).not.toBe(titleBefore);
  });

  test('BGM ループ切替', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.locator('[data-scene-id]').first().waitFor({ state: 'visible', timeout: 15000 });

    const trackRow = page.locator('[data-track-id]').first();
    await expect(trackRow).toBeVisible({ timeout: 5000 });

    // トラック行内のループボタン
    const loopBtn = trackRow.locator('button[title="ループ"]').first();
    await expect(loopBtn).toBeVisible({ timeout: 3000 });

    const colorBefore = await loopBtn.evaluate(el => getComputedStyle(el).color);
    await loopBtn.click();
    await page.waitForTimeout(300);

    const colorAfter = await loopBtn.evaluate(el => getComputedStyle(el).color);
    expect(colorAfter).not.toBe(colorBefore);
  });

  // 削除テストは最後（他のテストがトラックを必要とするため）
  test('BGMトラック削除（右クリック → 削除）', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.locator('[data-scene-id]').first().waitFor({ state: 'visible', timeout: 15000 });

    const track2 = page.getByText('テストBGM2').first();
    await expect(track2).toBeVisible({ timeout: 5000 });

    const tracksBefore = await page.locator('[data-track-id]').count();

    await track2.click({ button: 'right' });
    const deleteOpt = page.locator('[role="menuitem"]').filter({ hasText: '削除' }).first();
    await expect(deleteOpt).toBeVisible({ timeout: 3000 });
    await deleteOpt.click();

    const confirmBtn = page.getByRole('button', { name: '削除' }).last();
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click();
      await expect(page.locator('text=削除しますか')).not.toBeVisible({ timeout: 10000 });
    }

    await page.waitForTimeout(500);
    const tracksAfter = await page.locator('[data-track-id]').count();
    expect(tracksAfter).toBeLessThan(tracksBefore);
  });

  test.afterAll(async () => {
    if (roomId) await deleteRoomById(roomId);
  });
});
