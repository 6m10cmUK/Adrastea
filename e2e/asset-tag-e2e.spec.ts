import { test, expect } from '@playwright/test';
import { goToLobby, createRoom, deleteRoomById, selectBackground, BASE_URL, getSupabase } from './helpers';
import * as fs from 'fs';
import * as path from 'path';

const ROOM_NAME = `tag_test_${Date.now()}`;
let roomId: string;

// 1x1 透明 PNG
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64'
);
const TEST_IMAGE_PATH = path.join('/tmp', `test-asset-${Date.now()}.png`);

test.describe('アセットタグ自動付与テスト', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(() => {
    fs.writeFileSync(TEST_IMAGE_PATH, TINY_PNG);
  });

  test.afterAll(async () => {
    // テスト用アセット削除（Supabase assets テーブルから tags に ROOM_NAME を含むものを削除）
    try {
      const supabase = await getSupabase();
      const { data: testAssets } = await supabase
        .from('assets')
        .select('id, r2_key')
        .contains('tags', [ROOM_NAME]);
      if (testAssets && testAssets.length > 0) {
        const ids = testAssets.map((a: { id: string }) => a.id);
        await supabase.from('assets').delete().in('id', ids);
      }
    } catch (e) {
      console.error('テスト用アセット削除失敗:', e);
    }

    if (roomId) await deleteRoomById(roomId);
    if (fs.existsSync(TEST_IMAGE_PATH)) {
      fs.unlinkSync(TEST_IMAGE_PATH);
    }
  });

  test('ルーム作成 (準備)', async ({ page }) => {
    await goToLobby(page);
    roomId = await createRoom(page, ROOM_NAME);
    expect(roomId).toBeTruthy();
  });

  test('背景 AssetPicker からアップロード → 「背景」タグが付与される', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 背景を選択してプロパティパネルに表示
    await selectBackground(page);
    await page.waitForTimeout(500);

    // AssetPicker をクリック
    const picker = page.getByText('クリックしてアセットを選択').first();
    await expect(picker).toBeVisible({ timeout: 5000 });
    await picker.click();
    await page.waitForTimeout(500);

    // アセットライブラリモーダルが開く
    await expect(page.getByText('アセットライブラリ').first()).toBeVisible({ timeout: 5000 });

    // ファイルアップロード
    const fileChooserPromise = page.waitForEvent('filechooser');
    const uploadBtn = page.getByText('ファイルから追加').first();
    await expect(uploadBtn).toBeVisible({ timeout: 3000 });
    await uploadBtn.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(TEST_IMAGE_PATH);

    // アップロード完了を待つ
    await page.waitForTimeout(3000);

    // アセットのタグ表示に「背景」が含まれる
    await expect(page.getByText('背景', { exact: true }).first()).toBeVisible({ timeout: 5000 });
  });

  test('ツールバーから直接開いてアップロード → ルーム名タグのみ', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // ツールバーの「アセットライブラリ」ボタン
    const assetLibBtn = page.locator('button[title="アセットライブラリ"]').first();
    await expect(assetLibBtn).toBeVisible({ timeout: 5000 });
    await assetLibBtn.click();
    await page.waitForTimeout(500);

    await expect(page.getByText('アセットライブラリ').first()).toBeVisible({ timeout: 5000 });

    // ファイルアップロード
    const fileChooserPromise = page.waitForEvent('filechooser');
    const uploadBtn = page.getByText('ファイルから追加').first();
    await expect(uploadBtn).toBeVisible({ timeout: 3000 });
    await uploadBtn.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(TEST_IMAGE_PATH);

    // アップロード完了を待つ
    await page.waitForTimeout(3000);

    // ルーム名タグが表示される
    await expect(page.getByText(ROOM_NAME).first()).toBeVisible({ timeout: 5000 });
  });

  test('タグ編集: 編集モーダルでタグ追加', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // ツールバーの「アセットライブラリ」ボタンを開く
    const assetLibBtn = page.locator('button[title="アセットライブラリ"]').first();
    await expect(assetLibBtn).toBeVisible({ timeout: 5000 });
    await assetLibBtn.click();
    await page.waitForTimeout(500);

    await expect(page.getByText('アセットライブラリ').first()).toBeVisible({ timeout: 5000 });

    // 最初のアセットの編集ボタンをクリック
    const editBtn = page.locator('button[title="編集"]').first();
    await expect(editBtn).toBeVisible({ timeout: 5000 });
    await editBtn.click();
    await page.waitForTimeout(300);

    // 編集モーダルが表示される
    await expect(page.getByText('アセットを編集').first()).toBeVisible({ timeout: 3000 });

    // タグエディタが表示される
    const tagEditor = page.locator('[data-testid="tag-editor"]').first();
    await expect(tagEditor).toBeVisible({ timeout: 3000 });

    // 新規タグを入力して追加
    const tagInput = tagEditor.locator('input');
    await tagInput.fill('テストタグ');
    const addBtn = tagEditor.getByText('追加').first();
    await addBtn.click();
    await page.waitForTimeout(300);

    // チップとして「テストタグ」が表示される
    await expect(tagEditor.getByText('テストタグ')).toBeVisible();

    // 保存ボタンをクリック
    const saveBtn = page.getByText('保存').first();
    await saveBtn.click();
    await page.waitForTimeout(1000);

    // 保存後、アセットカードのタグ表示に「テストタグ」が含まれる
    await expect(page.locator('[data-testid="asset-tags"]').first().getByText('テストタグ')).toBeVisible({ timeout: 5000 });
  });

  test('タグ編集: チップの ✕ ボタンでタグ削除', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // アセットライブラリを開く
    const assetLibBtn = page.locator('button[title="アセットライブラリ"]').first();
    await assetLibBtn.click();
    await page.waitForTimeout(500);

    await expect(page.getByText('アセットライブラリ').first()).toBeVisible({ timeout: 5000 });

    // 最初のアセットの編集ボタンをクリック
    const editBtn = page.locator('button[title="編集"]').first();
    await editBtn.click();
    await page.waitForTimeout(300);

    await expect(page.getByText('アセットを編集').first()).toBeVisible({ timeout: 3000 });

    const tagEditor = page.locator('[data-testid="tag-editor"]').first();
    await expect(tagEditor).toBeVisible({ timeout: 3000 });

    // 既存タグのチップ数を取得
    const chipsBefore = await tagEditor.locator('[data-testid="tag-chip"]').count();
    expect(chipsBefore).toBeGreaterThan(0);

    // 最初のチップの ✕ ボタンをクリック
    const removeBtn = tagEditor.locator('[data-testid="tag-chip"]').first().locator('button');
    await removeBtn.click();
    await page.waitForTimeout(300);

    // チップ数が1つ減っている
    const chipsAfter = await tagEditor.locator('[data-testid="tag-chip"]').count();
    expect(chipsAfter).toBe(chipsBefore - 1);

    // 保存
    const saveBtn = page.getByText('保存').first();
    await saveBtn.click();
    await page.waitForTimeout(1000);
  });

  test('タグ編集: 候補ドロップダウンから既存タグを選択', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // アセットライブラリを開く
    const assetLibBtn = page.locator('button[title="アセットライブラリ"]').first();
    await assetLibBtn.click();
    await page.waitForTimeout(500);

    await expect(page.getByText('アセットライブラリ').first()).toBeVisible({ timeout: 5000 });

    // 最初のアセットの編集ボタンをクリック
    const editBtn = page.locator('button[title="編集"]').first();
    await editBtn.click();
    await page.waitForTimeout(300);

    await expect(page.getByText('アセットを編集').first()).toBeVisible({ timeout: 3000 });

    const tagEditor = page.locator('[data-testid="tag-editor"]').first();
    await expect(tagEditor).toBeVisible({ timeout: 3000 });

    // 入力欄をクリック → ドロップダウンが表示される
    const tagInput = tagEditor.locator('input');
    await tagInput.click();
    await page.waitForTimeout(300);

    // ドロップダウンの候補リストが表示される
    const dropdown = tagEditor.locator('[data-testid="tag-suggestions"]');
    await expect(dropdown).toBeVisible({ timeout: 3000 });

    // 最初の候補をクリック
    const firstSuggestion = dropdown.locator('li').first();
    const suggestionText = await firstSuggestion.textContent();
    await firstSuggestion.click();
    await page.waitForTimeout(300);

    // チップとして追加される
    if (suggestionText) {
      await expect(tagEditor.getByText(suggestionText)).toBeVisible();
    }

    // 保存
    const saveBtn = page.getByText('保存').first();
    await saveBtn.click();
    await page.waitForTimeout(1000);
  });
});
