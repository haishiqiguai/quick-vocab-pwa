import { expect, test } from '@playwright/test';

test('leaving the final browse card records exactly one completed round', async ({ page }) => {
  await page.goto('/plan');
  await expect(page.getByText('学习计划')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /浏览模式/ }).click();
  await page.getByLabel('起始').fill('1');
  await page.getByLabel('结束').fill('1');
  await page.getByRole('button', { name: '保存并开始' }).click();

  await expect(page.locator('.browse-card h1')).toBeVisible();
  await page.getByRole('button', { name: '退出学习' }).click();
  await expect(page.locator('.hero-stats div').filter({ hasText: 'Rounds' }).locator('strong')).toHaveText('1');
});
