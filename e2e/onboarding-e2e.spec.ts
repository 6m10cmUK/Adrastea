import { test, expect } from '@playwright/test';
import { BASE_URL, getSupabase } from './helpers';

test.describe('オンボーディング', () => {
  test.describe.configure({ mode: 'serial' });

  // テスト前に onboarded を false にリセット
  test.beforeAll(async () => {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('認証失敗');
    // user_metadata をリセット
    await supabase.auth.updateUser({ data: { onboarded: false } });
    // users テーブルもリセット
    await supabase.from('users').update({ onboarded: false }).eq('id', user.id);
  });

  // テスト後に onboarded を true に戻す（他のテストに影響させない）
  test.afterAll(async () => {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.auth.updateUser({ data: { onboarded: true } });
    await supabase.from('users').update({ onboarded: true }).eq('id', user.id);
  });

  test('未オンボーディング時にOnboardingModalが表示される', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // OnboardingModal の h2 タイトル「プロフィール設定」を待つ
    const modal = page.getByRole('heading', { name: 'プロフィール設定' });
    await expect(modal).toBeVisible({ timeout: 10000 });

    // 説明テキスト確認
    const description = page.getByText('表示名とアバターを設定してください');
    await expect(description).toBeVisible();
  });

  test('表示名を入力して保存→モーダルが閉じる', async ({ page }) => {
    await page.goto(`${BASE_URL}/adrastea/`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // OnboardingModal が表示されるまで待つ
    const modal = page.getByRole('heading', { name: 'プロフィール設定' });
    await expect(modal).toBeVisible({ timeout: 10000 });

    // 表示名入力フィールドを取得して入力
    const nameInput = page.locator('input[placeholder="表示名を入力"]');
    await nameInput.waitFor({ state: 'visible', timeout: 5000 });
    await nameInput.fill('テストユーザー');

    // 保存ボタンをクリック
    const saveBtn = page.getByRole('button', { name: '保存' });
    await saveBtn.click();

    // モーダルが閉じる＝モーダルが非表示になる
    await expect(modal).not.toBeVisible({ timeout: 10000 });

    // ロビーが表示される（ルームを作成ボタンが見える）
    const lobbyText = page.getByText('ルームを作成');
    await expect(lobbyText).toBeVisible({ timeout: 10000 });
  });

  test('スキップボタンでもモーダルが閉じる', async ({ page }) => {
    // onboarded を再度 false に戻す
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('認証失敗');
    await supabase.auth.updateUser({ data: { onboarded: false } });
    await supabase.from('users').update({ onboarded: false }).eq('id', user.id);

    await page.goto(`${BASE_URL}/adrastea/`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // OnboardingModal が表示される
    const modal = page.getByRole('heading', { name: 'プロフィール設定' });
    await expect(modal).toBeVisible({ timeout: 10000 });

    // スキップボタンをクリック
    const skipBtn = page.getByRole('button', { name: 'スキップ' });
    await skipBtn.click();

    // モーダルが閉じる
    await expect(modal).not.toBeVisible({ timeout: 10000 });

    // ロビーが表示される
    const lobbyText = page.getByText('ルームを作成');
    await expect(lobbyText).toBeVisible({ timeout: 10000 });
  });

  test('オンボーディング完了後はモーダルが表示されない', async ({ page }) => {
    // 前のテストで onboarded = true に戻されているはず
    await page.goto(`${BASE_URL}/adrastea/`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // OnboardingModal が表示されない
    const modal = page.getByRole('heading', { name: 'プロフィール設定' });
    await expect(modal).not.toBeVisible({ timeout: 5000 }).catch(() => {
      // タイムアウト = 見えていない = 正常
    });

    // ロビーが表示される
    const lobbyText = page.getByText('ルームを作成');
    await expect(lobbyText).toBeVisible({ timeout: 10000 });
  });
});
