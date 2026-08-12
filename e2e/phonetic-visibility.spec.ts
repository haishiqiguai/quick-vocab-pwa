import { expect, test } from '@playwright/test';

test('phonetic visibility can be hidden and stays hidden after refresh', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Target').first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /开始浏览/ }).click();
  await expect(page.locator('.phonetic')).toBeVisible();

  await page.getByRole('button', { name: '打开学习设置' }).click();
  await page.locator('.phonetic-visibility-control').click();
  await expect(page.getByLabel('隐藏音标')).toBeChecked();
  await expect(page.locator('.phonetic')).toHaveCount(0);
  await expect(page.locator('.phonetic-slot')).toHaveCSS('min-height', '67px');

  await page.reload();
  await expect(page.locator('.phonetic')).toHaveCount(0);
  await page.getByRole('button', { name: '打开学习设置' }).click();
  await expect(page.getByLabel('隐藏音标')).toBeChecked();
});
