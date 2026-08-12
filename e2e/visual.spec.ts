import { expect, test } from '@playwright/test';

test('home and study visual snapshots', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('Target').first()).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: testInfo.outputPath('home.png'), fullPage: true });
  await page.getByRole('button', { name: /开始浏览/ }).click();
  await expect(page.locator('.browse-card h1')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('study.png'), fullPage: true });
  await page.getByRole('button', { name: '打开学习设置' }).click();
  await expect(page.getByRole('dialog', { name: '学习设置' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('study-settings.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await page.goto('/dashboard');
  await expect(page.getByText('学习数据')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true });
  await page.goto('/settings');
  await expect(page.getByText('离线语音包')).toBeVisible();
  await expect(page.getByText('服务已连接')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('settings-speech.png'), fullPage: true });
});
