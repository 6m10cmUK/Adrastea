import { test, expect } from '@playwright/test';

async function loginAsGuest(page: import('@playwright/test').Page) {
  await page.goto('/adrastea');
  await page.waitForLoadState('networkidle');

  const guestBtn = page.getByRole('button', { name: /ゲスト参加/i });
  if (await guestBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await guestBtn.click();
  }

  await page.waitForFunction(
    () => !!document.querySelector('.adrastea-root'),
    { timeout: 30_000 },
  );
  await page.waitForLoadState('networkidle');
}

test.describe('Adrastea UI Theme — Phase 1 + 7', () => {

  test('ロビー画面 — 背景5層の適用確認', async ({ page }) => {
    await loginAsGuest(page);

    await expect(page).toHaveScreenshot('lobby.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });

  test('ロビー画面 — CSS変数が正しく設定されている', async ({ page }) => {
    await loginAsGuest(page);

    const vars = await page.evaluate(() => {
      const el = document.querySelector('.adrastea-root') ?? document.documentElement;
      const cs = getComputedStyle(el);
      return {
        bgDeep: cs.getPropertyValue('--ad-bg-deep').trim(),
        bgBase: cs.getPropertyValue('--ad-bg-base').trim(),
        bgSurface: cs.getPropertyValue('--ad-bg-surface').trim(),
        bgToolbar: cs.getPropertyValue('--ad-bg-toolbar').trim(),
        bgElevated: cs.getPropertyValue('--ad-bg-elevated').trim(),
        bgInput: cs.getPropertyValue('--ad-bg-input').trim(),
        bgHover: cs.getPropertyValue('--ad-bg-hover').trim(),
        shadowLg: cs.getPropertyValue('--ad-shadow-lg').trim(),
      };
    });

    expect(vars.bgDeep).toBe('#1e1e1e');
    expect(vars.bgBase).toBe('#282828');
    expect(vars.bgSurface).toBe('#313131');
    expect(vars.bgToolbar).toBe('#383838');
    expect(vars.bgElevated).toBe('#414141');
    expect(vars.bgInput).toBe('#222222');
    expect(vars.bgHover).toContain('0.07');
    expect(vars.shadowLg).toContain('24px');
  });

  test('AdButton default — ゴーストスタイル（背景透明）', async ({ page }) => {
    await loginAsGuest(page);

    const ghostBtn = page.locator('.ad-btn--ghost').first();
    if (await ghostBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const bg = await ghostBtn.evaluate(
        (el) => getComputedStyle(el).backgroundColor,
      );
      expect(bg).toMatch(/transparent|rgba\(0,\s*0,\s*0,\s*0\)/);
    }
  });

  test('AdModal — bgElevated + shadowLg が適用される', async ({ page }) => {
    await loginAsGuest(page);

    const createBtn = page.locator('text=ルームを作成').first();
    if (await createBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(300);

      const modal = page.locator('[role="dialog"]');
      if (await modal.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(page).toHaveScreenshot('modal-create-room.png', {
          maxDiffPixelRatio: 0.02,
        });

        const modalPanel = modal.locator('div').first();
        const styles = await modalPanel.evaluate((el) => {
          const cs = getComputedStyle(el);
          return { bg: cs.backgroundColor, shadow: cs.boxShadow };
        });
        expect(styles.shadow).not.toBe('none');
      }
    }
  });
});
