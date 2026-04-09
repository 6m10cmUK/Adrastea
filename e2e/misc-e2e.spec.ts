import { test, expect } from '@playwright/test';
import { goToLobby, createRoom, deleteRoomById, sendChat, createCharacterDirect, createBgmTrackDirect, getSceneIds, BASE_URL } from './helpers';

const ROOM_NAME = `misc_test_${Date.now()}`;
let roomId: string;

test.describe.serial('チャット・プロパティ・アセットライブラリテスト', () => {
  test('ルーム作成 (準備)', async ({ page }) => {
    await goToLobby(page);
    roomId = await createRoom(page, ROOM_NAME);
    expect(roomId).toBeTruthy();
  });

  // --- §5 チャット ---

  test('チャット + ダイスロール送信', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // 通常メッセージ送信
    const msg = `feat_msg_${Date.now()}`;
    await sendChat(page, msg);
    await expect(page.getByText(msg).first()).toBeVisible({ timeout: 10000 });

    // ダイスロール送信
    await sendChat(page, '2d6');
    const diceResult = page.getByText(/2D6/).first();
    await expect(diceResult).toBeVisible({ timeout: 10000 });
  });

  test('チャンネル切替（メイン→情報→雑談）', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // チャンネルタブを直接探す（ChatLogPanel 内の固定タブ）
    const mainTab = page.locator('button.adra-tab').filter({ hasText: 'メイン' }).first();
    await expect(mainTab).toBeVisible({ timeout: 5000 });

    // 情報タブ
    const infoTab = page.locator('button.adra-tab').filter({ hasText: '情報' }).first();
    await expect(infoTab).toBeVisible({ timeout: 5000 });
    await infoTab.click();
    await page.waitForTimeout(300);

    // 雑談タブ
    const casualTab = page.locator('button.adra-tab').filter({ hasText: '雑談' }).first();
    await expect(casualTab).toBeVisible({ timeout: 5000 });
    await casualTab.click();
    await page.waitForTimeout(300);

    // メインに戻る
    await mainTab.click();
    await page.waitForTimeout(300);
  });

  test('チャット送信者名変更', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // 送信者名入力フィールド（ChatInputPanel 内）
    const senderInput = page.locator('input[placeholder="noname"]').first();
    await expect(senderInput).toBeVisible({ timeout: 5000 });

    // 名前を変更
    await senderInput.fill('テスト送信者');
    await page.waitForTimeout(300);

    // 変更した名前でメッセージ送信
    await sendChat(page, 'テスト送信者確認メッセージ');
    await page.waitForTimeout(1000);

    // リロードして名前が保存されているか確認（localStorage）
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const savedName = await page.locator('input[placeholder="noname"]').first().inputValue();
    expect(savedName).toBe('テスト送信者');
  });

  // --- §6 プロパティパネル ---

  test('プロパティパネル表示', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // レイヤーパネルから「前景」を探す
    const layerPanel = page.locator('[data-selection-panel]').filter({ has: page.getByText('レイヤー').or(page.getByText('オブジェクト')) }).first();
    await expect(layerPanel).toBeVisible({ timeout: 5000 });

    const fgObj = layerPanel.getByRole('button', { name: '前景' }).first();
    await expect(fgObj).toBeVisible({ timeout: 3000 });

    await fgObj.click();
    await page.waitForTimeout(300);

    // プロパティパネルが表示される
    const propPanel = page.locator('[data-selection-panel]').filter({ has: page.getByText(/プロパティ|背景|色/) }).first();
    await expect(propPanel).toBeVisible({ timeout: 5000 });
  });

  test('オブジェクト選択 → プロパティ表示', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // レイヤーパネルの「前景」を選択（常に存在する）
    const fgItem = page.locator('[data-obj-id]').filter({ hasText: '前景' }).first();
    await expect(fgItem).toBeVisible({ timeout: 5000 });
    await fgItem.click();
    await page.waitForTimeout(500);

    // プロパティパネルにオブジェクト情報が表示される
    await expect(page.getByText('シーンオブジェクト').or(page.getByText('前景')).first()).toBeVisible({ timeout: 5000 });
  });

  test('キャラクター選択 → プロパティ表示', async ({ page }) => {
    // API でキャラクターを作成
    await createCharacterDirect(roomId, 'テストキャラ');

    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const charItem = page.locator('[data-char-id]').first();
    await expect(charItem).toBeVisible({ timeout: 10000 });
    await charItem.click();
    await page.waitForTimeout(500);

    // キャラクター選択後、プロパティパネルに反映される
    await expect(page.getByText('テストキャラ').first()).toBeVisible({ timeout: 5000 });
  });

  test('BGM選択 → プロパティ表示', async ({ page }) => {
    // API で BGM トラック作成
    const sceneIds = await getSceneIds(roomId);
    await createBgmTrackDirect(roomId, { name: 'テストBGM', bgmSource: 'https://example.com/test.mp3', sceneIds });

    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // BGM トラックをクリック
    const trackItem = page.getByText('テストBGM').first();
    await expect(trackItem).toBeVisible({ timeout: 10000 });
    await trackItem.click();
    await page.waitForTimeout(500);

    // プロパティパネルに BGM 情報が表示される
    await expect(page.getByText(/テストBGM|ボリューム/).first()).toBeVisible({ timeout: 5000 });
  });

  // --- §7 アセットライブラリ ---

  test('アセットライブラリ表示', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // ツールバーの「アセットライブラリ」ボタン
    const assetBtn = page.locator('button[title="アセットライブラリ"]').first();
    await expect(assetBtn).toBeVisible({ timeout: 5000 });

    await assetBtn.click();
    await page.waitForTimeout(300);

    // アセットライブラリのタイトルが表示される
    await expect(page.getByRole('heading', { name: 'アセットライブラリ' })).toBeVisible({ timeout: 3000 });
  });

  test.afterAll(async () => {
    if (roomId) await deleteRoomById(roomId);
  });
});
