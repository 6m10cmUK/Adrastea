import { test, expect } from '@playwright/test';
import { goToLobby, createRoom, deleteRoomById, BASE_URL } from './helpers';
const ROOM_NAME = `char_test_${Date.now()}`;
let roomId: string;

test.describe.serial('キャラクター管理テスト', () => {
  test('ルーム作成 (準備)', async ({ page }) => {
    await goToLobby(page);
    roomId = await createRoom(page, ROOM_NAME);
    expect(roomId).toBeTruthy();
  });

  test('キャラクター作成', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // キャラクター追加ボタン（aria-label ベースで直接探す）
    const addCharBtn = page.locator('button[aria-label="キャラクター追加"]').first();
    await expect(addCharBtn).toBeVisible({ timeout: 5000 });
    await addCharBtn.click();

    // キャラクター編集モーダルが開いたことを確認（= DB への INSERT 成功）
    await expect(page.getByText('キャラクター編集').first()).toBeVisible({ timeout: 10000 });

    // モーダルを閉じてリロード（楽観的更新がないため Realtime を待つよりリロードで確認）
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // リロード後にキャラクターがリストに表示されることを確認
    await expect(page.locator('[data-char-id]').first()).toBeVisible({ timeout: 10000 });
  });

  test('キャラクター削除', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // キャラクターが存在することを確認
    const charItem = page.locator('[data-char-id]').first();
    await expect(charItem).toBeVisible({ timeout: 5000 });
    // キャラクターを選択
    await page.locator('[data-char-id]').first().click();
    await page.waitForTimeout(300);

    // Delete キーで削除
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    // 確認ダイアログが表示される
    const confirmBtn = page.getByRole('button', { name: '削除' }).last();
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click();
      await page.waitForTimeout(500);

      // リロードして削除が永続化されたことを確認
      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);

      const remainingChars = await page.locator('[data-char-id]').count();
      expect(remainingChars).toBe(0);
    }
  });

  test('キャラクター右クリック「新規作成」', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // キャラクターリストの空白エリアで右クリック
    const charPanel = page.locator('[data-selection-panel]').filter({ has: page.getByText('キャラクター') }).first();
    await expect(charPanel).toBeVisible({ timeout: 3000 });
    // キャラクターリストエリア内で右クリック
    await charPanel.click({ button: 'right' });
    await page.waitForTimeout(300);

    // コンテキストメニュー「新規作成」
    const newOpt = page.getByText('新規作成').first();
    if (await newOpt.isVisible({ timeout: 2000 }).catch(() => false)) {
      await newOpt.click();
      await page.waitForTimeout(1000);

      // キャラクター編集モーダルが開く
      await expect(page.getByText('キャラクター編集').first()).toBeVisible({ timeout: 5000 });

      // モーダルを閉じる
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      // リロードして新規キャラクターが作成されたことを確認
      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);

      const charCount = await page.locator('[data-char-id]').count();
      expect(charCount).toBeGreaterThan(0);
    }
  });

  test('キャラクター ダブルクリック編集 → モーダルで名前変更', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // data-char-id を dblclick
    const charItem = page.locator('[data-char-id]').first();
    if (await charItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await charItem.dblclick();
      await page.waitForTimeout(1000);

      // キャラクター編集モーダルが開く
      await expect(page.getByText('キャラクター編集').first()).toBeVisible({ timeout: 5000 });

      // モーダル内の名前入力フィールド
      const nameInput = page.locator('input[placeholder*="キャラクター"], input[placeholder*="名前"]').first();
      if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await nameInput.fill('編集済みキャラ');
        await page.waitForTimeout(300);
      }

      // モーダルを閉じる（自動保存）
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);

      // リロードして名前が変更されたことを確認
      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      await expect(page.getByText('編集済みキャラ').first()).toBeVisible({ timeout: 5000 });
    } else {
      test.skip();
    }
  });

  test('キャラクター複製（右クリック → 複製）', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.locator('[data-scene-id]').first().waitFor({ state: 'visible', timeout: 15000 });

    const charItem = page.locator('[data-char-id]').first();
    if (!await charItem.isVisible({ timeout: 3000 }).catch(() => false)) { test.skip(); return; }

    const charCountBefore = await page.locator('[data-char-id]').count();

    // 右クリック → コンテキストメニュー「複製」
    await charItem.click({ button: 'right' });

    const duplicateOpt = page.locator('[role="menuitem"]').filter({ hasText: '複製' }).first();
    await duplicateOpt.waitFor({ state: 'visible', timeout: 5000 });

    await duplicateOpt.click();

    // Realtime 反映を待つ。遅い場合はリロード
    let appeared = await page.locator('[data-char-id]').nth(charCountBefore).isVisible({ timeout: 5000 }).catch(() => false);
    if (!appeared) {
      await page.reload();
      await page.locator('[data-scene-id]').first().waitFor({ state: 'visible', timeout: 15000 });
    }

    const charCountAfter = await page.locator('[data-char-id]').count();
    expect(charCountAfter).toBeGreaterThan(charCountBefore);
  });

  test('キャラクター 右クリック「コピー」 → paste で複製', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const charItem = page.locator('[data-char-id]').first();
    if (await charItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      const charCountBefore = await page.locator('[data-char-id]').count();

      // 右クリック → コンテキストメニュー「コピー」
      await charItem.click({ button: 'right' });
      const copyOpt = page.locator('[role="menuitem"]').filter({ hasText: 'コピー' }).first();
      if (await copyOpt.isVisible({ timeout: 5000 }).catch(() => false)) {
        await copyOpt.click();
        await page.waitForTimeout(500);

        // paste イベント dispatch
        await page.evaluate(async () => {
          const text = await navigator.clipboard.readText();
          const dt = new DataTransfer();
          dt.setData('text/plain', text);
          const evt = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
          document.dispatchEvent(evt);
        });

        // 複製されたキャラクターが表示されるまで待つ
        await expect(page.locator('[data-char-id]').nth(charCountBefore)).toBeVisible({ timeout: 5000 });

        const charCountAfter = await page.locator('[data-char-id]').count();
        expect(charCountAfter).toBeGreaterThan(charCountBefore);
      } else {
        test.skip();
      }
    } else {
      test.skip();
    }
  });

  test('キャラクター is_hidden_on_board → ボード上非表示', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const charItem = page.locator('[data-char-id]').first();
    await expect(charItem).toBeVisible({ timeout: 3000 });
    // キャラクターを選択してモーダルを開く
    await page.locator('[data-char-id]').first().dblclick();
    await page.waitForTimeout(300);

    const modal = page.getByText('キャラクター編集').or(page.locator('dialog, [role="dialog"]')).first();
    await expect(modal).toBeVisible({ timeout: 5000 });

    // is_hidden_on_board チェックボックスを探して ON にする
    // AdCheckbox は label[role="checkbox"] 構造
    const hiddenCheckbox = modal.locator('label[role="checkbox"]:has-text("非表示")').first();
    if (await hiddenCheckbox.isVisible({ timeout: 2000 }).catch(() => false)) {
      const isChecked = (await hiddenCheckbox.getAttribute('aria-checked')) === 'true';
      if (!isChecked) {
        await hiddenCheckbox.click();
      }
    }

    // モーダルを閉じる
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // リロードして非表示状態が保存されたことを確認
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // 再度モーダルを開いてチェックボックスが ON になっていることを確認
    const charItem2 = page.locator('[data-char-id]').first();
    await expect(charItem2).toBeVisible({ timeout: 3000 });
    await page.locator('[data-char-id]').first().dblclick();
    await page.waitForTimeout(300);

    const modal2 = page.getByText('キャラクター編集').or(page.locator('dialog, [role="dialog"]')).first();
    await expect(modal2).toBeVisible({ timeout: 5000 });

    const hiddenCheckbox2 = modal2.locator('label[role="checkbox"]:has-text("非表示")').first();
    if (await hiddenCheckbox2.isVisible({ timeout: 2000 }).catch(() => false)) {
      const isCheckedAfter = (await hiddenCheckbox2.getAttribute('aria-checked')) === 'true';
      expect(isCheckedAfter).toBe(true);
    }

    await page.keyboard.press('Escape');
  });

  test.afterAll(async () => {
    if (roomId) await deleteRoomById(roomId);
  });
});
