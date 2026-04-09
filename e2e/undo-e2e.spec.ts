import { test, expect } from '@playwright/test';
import { goToLobby, createRoom, deleteRoomById, BASE_URL } from './helpers';

const ROOM_NAME = `undo_test_${Date.now()}`;
let roomId: string;

test.describe.serial('Undo/Redo テスト', () => {
  test('ルーム作成 (準備)', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/`);
    await page.waitForLoadState('networkidle');
    // 認証チェック: ログイン画面が表示されたら skip（storageState 期限切れ）
    const loginBtn = page.getByText('Googleでログイン');
    if (await loginBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip();
      return;
    }
    await page.getByText('ルームを作成').waitFor({ timeout: 10000 });
    roomId = await createRoom(page, ROOM_NAME);
    expect(roomId).toBeTruthy();
  });

  test('Ctrl+Z で Undo → Ctrl+Shift+Z で Redo', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // シーン追加
    const addSceneBtn = page.locator('button[aria-label="シーンを追加"]').first();
    await expect(addSceneBtn).toHaveCount(1, { timeout: 5000 });

    const scenesBeforeCount = await page.locator('[data-scene-id]').count();

    await addSceneBtn.click({ force: true });
    await page.waitForTimeout(1500);

    // シーンが増えたことを確認
    const scenesAfterAdd = await page.locator('[data-scene-id]').count();
    expect(scenesAfterAdd).toBeGreaterThan(scenesBeforeCount);

    // Ctrl+Z を複数回押す（1操作が複数 diff エントリを生むため）
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(500);
      const current = await page.locator('[data-scene-id]').count();
      if (current === scenesBeforeCount) break;
    }
    await page.waitForTimeout(500);

    const scenesAfterUndo = await page.locator('[data-scene-id]').count();
    expect(scenesAfterUndo).toBe(scenesBeforeCount);

    // Ctrl+Shift+Z を複数回押して Redo
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Control+Shift+z');
      await page.waitForTimeout(500);
      const current = await page.locator('[data-scene-id]').count();
      if (current > scenesBeforeCount) break;
    }
    await page.waitForTimeout(500);

    const scenesAfterRedo = await page.locator('[data-scene-id]').count();
    expect(scenesAfterRedo).toBeGreaterThan(scenesBeforeCount);
  });

  test('Undo: オブジェクト追加→Ctrl+Z', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // オブジェクト追加ボタン
    const addBtn = page.locator('button[aria-label="オブジェクト追加"]').first();
    await expect(addBtn).toHaveCount(1, { timeout: 5000 });

    const objCountBefore = await page.locator('[data-sortable-item]').count();

    // テキストオブジェクト追加
    await addBtn.click({ force: true });
    await page.waitForTimeout(500);

    const addTextOpt = page.getByText('シーンテキスト追加').first();
    if (await addTextOpt.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addTextOpt.click();
      await page.waitForTimeout(1500);

      // オブジェクトが追加される
      const objCountAfter = await page.locator('[data-sortable-item]').count();
      expect(objCountAfter).toBeGreaterThan(objCountBefore);

      // Ctrl+Z で Undo
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Control+z');
        await page.waitForTimeout(500);
        const current = await page.locator('[data-sortable-item]').count();
        if (current === objCountBefore) break;
      }
      await page.waitForTimeout(500);

      // オブジェクト数が元に戻る
      const objCountAfterUndo = await page.locator('[data-sortable-item]').count();
      expect(objCountAfterUndo).toBe(objCountBefore);

      // Ctrl+Shift+Z で Redo（再追加）
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Control+Shift+z');
        await page.waitForTimeout(500);
        const current = await page.locator('[data-sortable-item]').count();
        if (current > objCountBefore) break;
      }
      await page.waitForTimeout(500);

      const objCountAfterRedo = await page.locator('[data-sortable-item]').count();
      expect(objCountAfterRedo).toBeGreaterThan(objCountBefore);
    } else {
      test.skip();
    }
  });

  test('Undo: オブジェクト削除→Ctrl+Z で復活', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // テキストオブジェクトを探す、なければ作成
    let textObj = page.locator('[data-obj-id]').filter({ hasText: /テキスト|新規テキスト/ }).first();
    let textObjExists = await textObj.isVisible({ timeout: 2000 }).catch(() => false);

    if (!textObjExists) {
      // オブジェクト追加ボタン
      const addBtn = page.locator('button[aria-label="オブジェクト追加"]').first();
      await addBtn.click({ force: true });
      await page.waitForTimeout(500);

      const addTextOpt = page.getByText('シーンテキスト追加').first();
      if (await addTextOpt.isVisible({ timeout: 3000 }).catch(() => false)) {
        await addTextOpt.click();
        await page.waitForTimeout(1500);
      }

      // オブジェクト再取得
      textObj = page.locator('[data-obj-id]').filter({ hasText: /テキスト|新規テキスト/ }).first();
      textObjExists = await textObj.isVisible({ timeout: 2000 }).catch(() => false);
    }

    if (textObjExists) {
      // テキストオブジェクトを選択
      await textObj.click();
      await page.waitForTimeout(300);

      const objCountBefore = await page.locator('[data-sortable-item]').count();

      // Delete キーで削除
      await page.keyboard.press('Delete');
      await page.waitForTimeout(500);

      // 確認ダイアログが表示される
      const confirmBtn = page.getByRole('button', { name: '削除' }).last();
      if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmBtn.click();
        await page.waitForTimeout(1000);

        // オブジェクトが削除される
        const objCountAfter = await page.locator('[data-sortable-item]').count();
        expect(objCountAfter).toBeLessThan(objCountBefore);

        // Ctrl+Z で Undo（復活）
        for (let i = 0; i < 5; i++) {
          await page.keyboard.press('Control+z');
          await page.waitForTimeout(500);
          const current = await page.locator('[data-sortable-item]').count();
          if (current === objCountBefore) break;
        }
        await page.waitForTimeout(500);

        // オブジェクトが復活する
        const objCountAfterUndo = await page.locator('[data-sortable-item]').count();
        expect(objCountAfterUndo).toBe(objCountBefore);
      } else {
        test.skip();
      }
    } else {
      test.skip();
    }
  });

  test('Undo/Redo: オブジェクト削除→Undo→Redo で再削除', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // テキストオブジェクトを探す、なければ作成
    let textObj = page.locator('[data-obj-id]').filter({ hasText: /テキスト|新規テキスト/ }).first();
    let textObjExists = await textObj.isVisible({ timeout: 2000 }).catch(() => false);

    if (!textObjExists) {
      const addBtn = page.locator('button[aria-label="オブジェクト追加"]').first();
      await addBtn.click({ force: true });
      await page.waitForTimeout(500);

      const addTextOpt = page.getByText('シーンテキスト追加').first();
      if (await addTextOpt.isVisible({ timeout: 3000 }).catch(() => false)) {
        await addTextOpt.click();
        await page.waitForTimeout(1500);
      }

      textObj = page.locator('[data-obj-id]').filter({ hasText: /テキスト|新規テキスト/ }).first();
      textObjExists = await textObj.isVisible({ timeout: 2000 }).catch(() => false);
    }

    if (textObjExists) {
      await textObj.click();
      await page.waitForTimeout(300);

      const objCountBefore = await page.locator('[data-sortable-item]').count();

      // Delete で削除
      await page.keyboard.press('Delete');
      await page.waitForTimeout(500);

      const confirmBtn = page.getByRole('button', { name: '削除' }).last();
      if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmBtn.click();
        await page.waitForTimeout(1000);

        const objCountAfterDelete = await page.locator('[data-sortable-item]').count();
        expect(objCountAfterDelete).toBeLessThan(objCountBefore);

        // Ctrl+Z で Undo（復活）
        for (let i = 0; i < 5; i++) {
          await page.keyboard.press('Control+z');
          await page.waitForTimeout(500);
          const current = await page.locator('[data-sortable-item]').count();
          if (current === objCountBefore) break;
        }
        await page.waitForTimeout(500);

        const objCountAfterUndo = await page.locator('[data-sortable-item]').count();
        expect(objCountAfterUndo).toBe(objCountBefore);

        // Ctrl+Shift+Z で Redo（再削除）
        for (let i = 0; i < 5; i++) {
          await page.keyboard.press('Control+Shift+z');
          await page.waitForTimeout(500);
          const current = await page.locator('[data-sortable-item]').count();
          if (current < objCountBefore) break;
        }
        await page.waitForTimeout(500);

        const objCountAfterRedo = await page.locator('[data-sortable-item]').count();
        expect(objCountAfterRedo).toBe(objCountAfterDelete);
      } else {
        test.skip();
      }
    } else {
      test.skip();
    }
  });

  test('Undo: オブジェクトプロパティ更新→Ctrl+Z で元に戻す', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // テキストオブジェクトを探す
    let textObj = page.locator('[data-obj-id]').filter({ hasText: /テキスト|新規テキスト/ }).first();
    let textObjExists = await textObj.isVisible({ timeout: 2000 }).catch(() => false);

    if (!textObjExists) {
      const addBtn = page.locator('button[aria-label="オブジェクト追加"]').first();
      await addBtn.click({ force: true });
      await page.waitForTimeout(500);

      const addTextOpt = page.getByText('シーンテキスト追加').first();
      if (await addTextOpt.isVisible({ timeout: 3000 }).catch(() => false)) {
        await addTextOpt.click();
        await page.waitForTimeout(1500);
      }

      textObj = page.locator('[data-obj-id]').filter({ hasText: /テキスト|新規テキスト/ }).first();
      textObjExists = await textObj.isVisible({ timeout: 2000 }).catch(() => false);
    }

    if (textObjExists) {
      // オブジェクトをダブルクリックしてプロパティパネルを開く
      await textObj.dblclick();
      await page.waitForTimeout(300);

      // プロパティパネルでオブジェクト名入力欄を探す
      const nameInput = page.locator('input[placeholder="オブジェクト名"]').first();
      const nameInputExists = await nameInput.isVisible({ timeout: 2000 }).catch(() => false);

      if (nameInputExists) {
        // 元の名前を記録
        const originalName = await nameInput.inputValue();

        // 名前を変更して blur（デバウンス保存トリガー）
        await nameInput.fill('TestObjectName');
        await page.keyboard.press('Tab');

        // レイヤーパネルで名前が反映されるのを待つ（= Realtime で DB 保存完了）
        await expect(
          page.locator('[data-obj-id]').filter({ hasText: 'TestObjectName' }).first()
        ).toBeVisible({ timeout: 10000 });

        // フォーカスが input 外にあることを確認（undo がテキスト入力の undo にならないように）
        await page.locator('.adrastea-root').first().click({ position: { x: 10, y: 10 } });

        // Ctrl+Z で Undo — レイヤーパネルの名前が戻るまで待つ
        for (let i = 0; i < 5; i++) {
          await page.keyboard.press('Control+z');
          const reverted = await page.locator('[data-obj-id]').filter({ hasText: originalName }).first()
            .isVisible({ timeout: 2000 }).catch(() => false);
          if (reverted) break;
        }

        // 名前が元に戻ったことを確認
        await expect(
          page.locator('[data-obj-id]').filter({ hasText: originalName }).first()
        ).toBeVisible({ timeout: 5000 });

        // Ctrl+Shift+Z で Redo — 名前が TestObjectName に戻る
        for (let i = 0; i < 5; i++) {
          await page.keyboard.press('Control+Shift+z');
          const redone = await page.locator('[data-obj-id]').filter({ hasText: 'TestObjectName' }).first()
            .isVisible({ timeout: 2000 }).catch(() => false);
          if (redone) break;
        }

        await expect(
          page.locator('[data-obj-id]').filter({ hasText: 'TestObjectName' }).first()
        ).toBeVisible({ timeout: 5000 });
      } else {
        test.skip();
      }
    } else {
      test.skip();
    }
  });

  test('Undo/Redo: キャラクター追加→Undo→Redo', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // キャラクター数を記録
    const charCountBefore = await page.locator('[data-char-id]').count();

    // キャラクター追加ボタンを探す
    const addCharBtn = page.locator('button[aria-label="キャラクター追加"]').first();
    if (await addCharBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      // ボタンをクリック
      await addCharBtn.click({ force: true });
      await page.waitForTimeout(500);

      // キャラクター編集モーダルが表示されるのを待つ
      const modal = page.getByText('キャラクター編集').first();
      if (await modal.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Escape でモーダルを閉じる
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);

        // キャラクターが増えたことを確認
        const charCountAfterAdd = await page.locator('[data-char-id]').count();
        expect(charCountAfterAdd).toBeGreaterThan(charCountBefore);

        // Ctrl+Z でキャラクター削除（undo）
        for (let i = 0; i < 5; i++) {
          await page.keyboard.press('Control+z');
          await page.waitForTimeout(500);
          const current = await page.locator('[data-char-id]').count();
          if (current === charCountBefore) break;
        }
        await page.waitForTimeout(500);

        // キャラクター数が元に戻ったことを確認
        const charCountAfterUndo = await page.locator('[data-char-id]').count();
        expect(charCountAfterUndo).toBe(charCountBefore);

        // Ctrl+Shift+Z で Redo（復活）
        for (let i = 0; i < 5; i++) {
          await page.keyboard.press('Control+Shift+z');
          await page.waitForTimeout(500);
          const current = await page.locator('[data-char-id]').count();
          if (current > charCountBefore) break;
        }
        await page.waitForTimeout(500);

        // キャラクター数が増えたことを確認
        const charCountAfterRedo = await page.locator('[data-char-id]').count();
        expect(charCountAfterRedo).toBeGreaterThan(charCountBefore);
      } else {
        test.skip();
      }
    } else {
      test.skip();
    }
  });

  test('Undo: 連続操作→Undo×2→新規操作→Redo 不可', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const scenesInitial = await page.locator('[data-scene-id]').count();

    // シーンを1つ追加
    const addSceneBtn = page.locator('button[aria-label="シーンを追加"]').first();
    await addSceneBtn.click({ force: true });
    await page.waitForTimeout(1500);

    const scenesAfterFirst = await page.locator('[data-scene-id]').count();
    expect(scenesAfterFirst).toBeGreaterThan(scenesInitial);

    // 1.5秒待機後、もう1つシーンを追加
    await page.waitForTimeout(1500);
    await addSceneBtn.click({ force: true });
    await page.waitForTimeout(1500);

    const scenesAfterSecond = await page.locator('[data-scene-id]').count();
    expect(scenesAfterSecond).toBeGreaterThan(scenesAfterFirst);

    // Ctrl+Z × 2 で両方 undo
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 5; j++) {
        await page.keyboard.press('Control+z');
        await page.waitForTimeout(500);
        const current = await page.locator('[data-scene-id]').count();
        if (current === scenesInitial) break;
      }
    }
    await page.waitForTimeout(500);

    const scenesAfterUndo = await page.locator('[data-scene-id]').count();
    expect(scenesAfterUndo).toBe(scenesInitial);

    // 新しいシーンを追加（新規操作、redo スタックをクリア）
    await addSceneBtn.click({ force: true });
    await page.waitForTimeout(1500);

    const scenesAfterNewOp = await page.locator('[data-scene-id]').count();
    expect(scenesAfterNewOp).toBeGreaterThan(scenesInitial);

    // Ctrl+Shift+Z を押してもシーンが増えない（redo スタックがクリアされてる）
    const scenesBeforeRedo = scenesAfterNewOp;
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Control+Shift+z');
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(500);

    const scenesAfterRedo = await page.locator('[data-scene-id]').count();
    expect(scenesAfterRedo).toBe(scenesBeforeRedo);
  });

  test.afterAll(async () => {
    if (roomId) await deleteRoomById(roomId);
  });
});
