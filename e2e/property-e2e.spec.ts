import { test, expect } from '@playwright/test';
import { goToLobby, createRoom, selectBackground, selectForeground, addTextObject, addCharacter, addBgmTrack, deleteRoomById, createBgmTrackDirect, getSceneIds, BASE_URL } from './helpers';
const ROOM_NAME = `prop_test_${Date.now()}`;
let roomId: string;

test.describe.serial('Adrastea プロパティパネルテスト', () => {

  // §0 ルーム準備
  test('ルーム作成', async ({ page }) => {
    await goToLobby(page);
    roomId = await createRoom(page, ROOM_NAME);
    expect(roomId).toBeTruthy();
  });

  // --- 背景プロパティ ---

  test('P-02: グリッド表示切替', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // ルーム設定ボタンをクリック
    const settingsButton = page.locator('[data-testid="toolbar-settings-btn"]');
    await expect(settingsButton).toBeVisible({ timeout: 5000 });
    await settingsButton.click();

    // グリッド表示チェックボックスが表示されるまで待つ（SettingsModal が開いた証拠）
    const gridCheckbox = page.locator('label[role="checkbox"]:has-text("グリッドを表示する")').first();
    await expect(gridCheckbox).toBeVisible({ timeout: 5000 });

    const isCheckedBefore = (await gridCheckbox.getAttribute('aria-checked')) === 'true';
    await gridCheckbox.click();
    await page.waitForTimeout(200);

    const isCheckedAfter = (await gridCheckbox.getAttribute('aria-checked')) === 'true';
    expect(isCheckedAfter).toBe(!isCheckedBefore);

    // モーダルを閉じる
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  });

  test('P-03: 背景ぼかし切替', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 背景を選択
    await selectBackground(page);
    await page.waitForTimeout(300);

    // 背景ぼかしチェックボックスを取得（label[role="checkbox"]）
    const blurCheckbox = page.locator('label[role="checkbox"]:has-text("背景ぼかし")').first();
    await expect(blurCheckbox).toBeVisible({ timeout: 5000 });

    const isCheckedBefore = (await blurCheckbox.getAttribute('aria-checked')) === 'true';
    await blurCheckbox.click();
    await page.waitForTimeout(200);

    const isCheckedAfter = (await blurCheckbox.getAttribute('aria-checked')) === 'true';
    expect(isCheckedAfter).toBe(!isCheckedBefore);
  });

  // --- 前景プロパティ ---

  test('P-08: 前景に位置ロック表示なし', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 前景を選択
    await selectForeground(page);
    await page.waitForTimeout(300);

    // 位置ロック/サイズロック/位置/サイズセクションが表示されないことを確認
    await expect(page.locator('label[role="checkbox"]:has-text("位置を固定")')).not.toBeVisible({ timeout: 2000 });
    await expect(page.locator('label[role="checkbox"]:has-text("サイズを固定")')).not.toBeVisible({ timeout: 2000 });
  });

  test('P-09: 前景にはAssetPicker・画像表示モード・フェードインのみ表示', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 前景を選択
    await selectForeground(page);
    await page.waitForTimeout(300);

    // 前景画像の AssetPicker が表示されることを確認
    const assetPicker = page.locator('text=前景画像').first();
    await expect(assetPicker).toBeVisible({ timeout: 5000 });

    // 前景フェードインチェックボックスが表示されることを確認
    const fadeCheckbox = page.locator('label[role="checkbox"]:has-text("前景フェードイン")').first();
    await expect(fadeCheckbox).toBeVisible({ timeout: 5000 });
  });

  test('P-11: 前景サイズ変更', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 前景を選択
    await selectForeground(page);
    await page.waitForTimeout(300);

    // サイズ（マス数）セクションが表示されることを確認
    const sizeSection = page.locator('text=サイズ（マス数）').first();
    await expect(sizeSection).toBeVisible({ timeout: 5000 });

    // NumberDragInput は通常 div として表示され、クリックで input[type="text"] に切り替わる
    // "x:" ラベルを含む span の親コンテナを起点にする
    const xContainer = page.locator('span').filter({ hasText: /^x:$/ }).locator('..');
    await expect(xContainer).toBeVisible({ timeout: 5000 });

    const widthDisplay = xContainer.locator('div').first();
    const widthBefore = await widthDisplay.textContent();

    // Supabase scenes PATCH を事前に待機登録
    const sceneUpdatePromise = page.waitForResponse(
      resp => resp.url().includes('/rest/v1/scenes') && resp.request().method() === 'PATCH',
      { timeout: 8000 }
    );

    // クリックして編集モードに入る
    await widthDisplay.click();
    const widthInput = xContainer.locator('input[type="text"]');
    await expect(widthInput).toBeVisible({ timeout: 3000 });

    // 幅を変更（99に設定 — デフォルト 48 と確実に異なる値）
    const newWidth = '99';
    await widthInput.fill(newWidth);
    await widthInput.press('Enter');

    // Enter 後に editing=false になり div が 99 を表示する
    await expect(xContainer.locator('div').first()).toHaveText(newWidth, { timeout: 5000 });

    // Supabase 書き込み完了を待つ
    await sceneUpdatePromise;

    // リロード後も値が保持されていることを確認
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 前景を再度選択
    await selectForeground(page);
    await page.waitForTimeout(300);

    // リロード後も 99 が表示されていることを確認
    await expect(page.locator('text=サイズ（マス数）').first()).toBeVisible({ timeout: 5000 });
    const xContainerReloaded = page.locator('span').filter({ hasText: /^x:$/ }).locator('..');
    await expect(xContainerReloaded.locator('div').first()).toHaveText(newWidth, { timeout: 5000 });

    // クリーンアップ：元の値に戻す
    await xContainerReloaded.locator('div').first().click();
    const reloadedInput = xContainerReloaded.locator('input[type="text"]');
    await expect(reloadedInput).toBeVisible({ timeout: 3000 });
    await reloadedInput.fill(widthBefore ?? '48');
    await reloadedInput.press('Enter');
    await page.waitForTimeout(500);
  });

  // --- オブジェクトプロパティ（テキストオブジェクト追加後） ---

  test('P-10: テキストオブジェクト名編集', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // テキストオブジェクト追加
    await addTextObject(page);
    await page.waitForTimeout(1000);

    // 追加されたテキストオブジェクトをレイヤーパネルでクリック（プロパティパネルに表示させる）
    const textItem = page.locator('[data-obj-id]').filter({ hasText: /テキスト|新規テキスト/ }).first();
    if (await textItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await textItem.click();
      await page.waitForTimeout(500);
    }

    // オブジェクト名フィールド
    const nameInput = page.getByRole('textbox', { name: 'オブジェクト名' }).first();
    await expect(nameInput).toBeVisible({ timeout: 5000 });

    // 既存テキストをクリア → 新しい名前を入力
    await nameInput.click({ clickCount: 3 }); // 全選択
    const newName = `TO_${Date.now()}`;
    await nameInput.pressSequentially(newName, { delay: 30 });

    // 入力値が反映されたことを確認
    await expect(nameInput).toHaveValue(newName, { timeout: 3000 });
  });

  test('P-13: テキストオブジェクト不透明度編集', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // テキストオブジェクトをクリック（既に作成されているはず）
    const objectName = page.locator('[data-obj-id]').filter({ hasText: /テキスト|新規テキスト|TO_/ }).first();
    await expect(objectName).toBeVisible({ timeout: 5000 });
    await objectName.click();
    await page.waitForTimeout(300);

    // opacity スライダーを取得（aria-label か data-* 属性）
    const opacitySlider = page.locator('input[type="range"]').filter({ has: page.getByText('opacity', { exact: false }) }).first();
    if (await opacitySlider.isVisible({ timeout: 3000 }).catch(() => false)) {
      const valueBefore = await opacitySlider.getAttribute('value');
      await opacitySlider.fill('0.5');
      await page.waitForTimeout(300);

      const valueAfter = await opacitySlider.getAttribute('value');
      expect(valueAfter).not.toBe(valueBefore);
    } else {
      // opacity が input[type="number"] の場合
      const opacityInput = page.locator('input[type="number"]').filter({ has: page.getByText('opacity', { exact: false }) }).first();
      if (await opacityInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await opacityInput.fill('0.5');
        await page.waitForTimeout(300);
        const value = await opacityInput.inputValue();
        expect(value).toBe('0.5');
      }
    }
  });

  test('P-15: テキストオブジェクト position_locked ON → チェックボックスが反映される', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // テキストオブジェクトを選択（P-10 で作成済み）
    const textObj = page.locator('[data-obj-id]').filter({ hasText: /./ }).first();
    await expect(textObj).toBeVisible({ timeout: 5000 });
    await textObj.click();
    await page.waitForTimeout(300);

    // プロパティパネルの「位置を固定」チェックボックスを確認
    const posLockChk = page.locator('label[role="checkbox"]:has-text("位置を固定")').first();
    await expect(posLockChk).toBeVisible({ timeout: 5000 });

    const beforeState = (await posLockChk.getAttribute('aria-checked')) === 'true';
    await posLockChk.click();
    await page.waitForTimeout(300);

    const afterState = (await posLockChk.getAttribute('aria-checked')) === 'true';
    expect(afterState).toBe(!beforeState);

    // 元に戻す
    await posLockChk.click();
    await page.waitForTimeout(300);
  });

  test('P-16: テキストオブジェクト size_locked ON → チェックボックスが反映される', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // テキストオブジェクトを選択
    const textObj = page.locator('[data-obj-id]').filter({ hasText: /./ }).first();
    await expect(textObj).toBeVisible({ timeout: 5000 });
    await textObj.click();
    await page.waitForTimeout(300);

    // プロパティパネルの「サイズを固定」チェックボックスを確認
    const sizeLockChk = page.locator('label[role="checkbox"]:has-text("サイズを固定")').first();
    await expect(sizeLockChk).toBeVisible({ timeout: 5000 });

    const beforeState = (await sizeLockChk.getAttribute('aria-checked')) === 'true';
    await sizeLockChk.click();
    await page.waitForTimeout(300);

    const afterState = (await sizeLockChk.getAttribute('aria-checked')) === 'true';
    expect(afterState).toBe(!beforeState);

    // 元に戻す
    await sizeLockChk.click();
    await page.waitForTimeout(300);
  });

  // --- キャラクタープロパティ（キャラクター追加後） ---

  test('P-21: キャラクター名編集', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    // ルーム UI が表示されるまで待つ
    await page.locator('[data-scene-id]').first().waitFor({ state: 'visible', timeout: 15000 });

    // キャラクター追加
    await addCharacter(page);
    await page.waitForTimeout(300);

    // キャラクター編集モーダルが開くのを待つ
    await expect(page.getByText('キャラクター編集').first()).toBeVisible({ timeout: 10000 });

    // モーダル内の名前フィールド（placeholder="キャラクター名"）
    const nameInput = page.locator('input[placeholder="キャラクター名"]').first();
    await expect(nameInput).toBeVisible({ timeout: 5000 });

    const newCharName = `TC_${Date.now()}`;
    await nameInput.click({ clickCount: 3, force: true });
    await nameInput.pressSequentially(newCharName, { delay: 30 });

    // 入力値が反映されたことを確認
    await expect(nameInput).toHaveValue(newCharName, { timeout: 3000 });

    // モーダルを閉じる
    await page.keyboard.press('Escape');
  });

  test('P-22: キャラクター色変更', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // キャラクターをクリック（既に作成されているはず）
    const charItem = page.locator('[data-char-id]').first();
    await expect(charItem).toBeVisible({ timeout: 5000 });
    await charItem.dblclick();
    await page.waitForTimeout(1000); // モーダル完全表示待ち

    // キャラクター編集モーダルが開くのを待つ
    const modal = page.locator('div[role="dialog"]').first();
    await expect(modal).toBeVisible({ timeout: 5000 });

    // テーマカラーの色入力フィールド（モーダル内の最初のテキスト入力）
    const colorInput = modal.locator('input[type="text"]').first();
    await expect(colorInput).toBeVisible({ timeout: 5000 });

    // selectAll を使用して全選択、その後 fill で置き換え
    await colorInput.selectText();
    await colorInput.fill('#ff0000');
    await page.waitForTimeout(300);

    // 確認
    const value = await colorInput.inputValue();
    expect(value.toLowerCase()).toBe('#ff0000');

    // モーダルを閉じる
    await page.keyboard.press('Escape');
  });

  test('P-23: キャラクターサイズ変更', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // キャラクタータブをアクティブにする
    const charTab = page.locator('.dv-tab').filter({ hasText: /^キャラクター$/ });
    if (await charTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await charTab.click();
      await page.waitForTimeout(200);
    }

    // シングルクリックで選択 → PropertyDockPanel にインライン CharacterEditor が表示される
    const charItem = page.locator('[data-char-id]').first();
    await expect(charItem).toBeVisible({ timeout: 5000 });
    await charItem.click();
    await page.waitForTimeout(500);

    // PropertyDockPanel に 駒サイズ が表示されるのを待つ（盤面設定セクション）
    const sizeContainer = page.locator('span').filter({ hasText: '駒サイズ' }).locator('..').first();
    await sizeContainer.scrollIntoViewIfNeeded();
    await expect(sizeContainer).toBeVisible({ timeout: 5000 });

    const sizeDisplay = sizeContainer.locator('div').first();
    const valueBefore = await sizeDisplay.textContent();

    // PropertyDockPanel はモーダルではないので通常クリックで NumberDragInput が開く
    await sizeDisplay.click();
    const sizeInput = sizeContainer.locator('input[type="text"]');
    await expect(sizeInput).toBeVisible({ timeout: 3000 });

    const newSize = '8';
    await sizeInput.fill(newSize);
    await sizeInput.press('Enter');

    // 入力が反映されたことを確認
    await expect(sizeContainer.locator('div').first()).toHaveText(newSize, { timeout: 5000 });
    expect(newSize).not.toBe(valueBefore);
  });

  // --- BGMプロパティ（BGMトラック追加後） ---

  test('P-31: BGMループ再生切替', async ({ page }) => {
    // API で BGM トラック作成（dockview タブ非アクティブ問題を回避）
    const sceneIds = await getSceneIds(roomId);
    await createBgmTrackDirect(roomId, { name: 'PropBGM', bgmSource: 'https://example.com/test.mp3', sceneIds });

    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const bgmName = page.getByText('PropBGM').first();
    await expect(bgmName).toBeVisible({ timeout: 10000 });

    // ループボタン（BgmPanel 内）
    const loopBtn = page.locator('button[aria-label="ループ"]').first();
    await expect(loopBtn).toBeVisible({ timeout: 3000 });
    const colorBefore = await loopBtn.evaluate(el => getComputedStyle(el).color);
    await loopBtn.click();
    await page.waitForTimeout(300);
    const colorAfter = await loopBtn.evaluate(el => getComputedStyle(el).color);
    expect(colorAfter).not.toBe(colorBefore);
  });

  test('P-32: BGMフェードイン切替', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const bgmName = page.getByText('PropBGM').first();
    await expect(bgmName).toBeVisible({ timeout: 10000 });

    const fadeBtn = page.locator('button[aria-label="フェードイン"]').first();
    await expect(fadeBtn).toBeVisible({ timeout: 3000 });
    const opacityBefore = await fadeBtn.evaluate(el => getComputedStyle(el).opacity);
    await fadeBtn.click();
    await page.waitForTimeout(300);
    const opacityAfter = await fadeBtn.evaluate(el => getComputedStyle(el).opacity);
    expect(opacityAfter).not.toBe(opacityBefore);
  });

  test.afterAll(async () => {
    if (roomId) await deleteRoomById(roomId);
  });

});
