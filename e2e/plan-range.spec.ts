import { expect, test } from '@playwright/test';

test('switching books and editing a range saves the intended words', async ({ page }) => {
  await page.goto('/plan');
  await expect(page.getByRole('button', { name: /高考真题词汇/ })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /高考真题词汇/ }).click();
  await expect(page.getByLabel('结束')).toHaveValue('357');
  await page.getByRole('button', { name: /对口升学复习指导词汇/ }).click();
  await expect(page.getByRole('button', { name: '501–896' })).toBeVisible();
  await expect(page.getByLabel('结束')).toHaveValue('500');

  await page.getByLabel('结束').fill('');
  await expect(page.getByLabel('结束')).toHaveValue('');
  await page.getByLabel('结束').pressSequentially('896');
  await expect(page.getByLabel('结束')).toHaveValue('896');
  await page.getByLabel('起始').fill('');
  await expect(page.getByLabel('起始')).toHaveValue('');
  await page.getByLabel('起始').pressSequentially('501');
  await page.getByRole('button', { name: '保存计划' }).click();
  await page.goto('/plan');
  await expect(page.getByLabel('起始')).toHaveValue('501');
  await expect(page.getByLabel('结束')).toHaveValue('896');
  await page.getByRole('button', { name: /高考真题词汇/ }).click();
  await expect(page.getByLabel('起始')).toHaveValue('1');
  await expect(page.getByLabel('结束')).toHaveValue('357');
  await page.getByRole('button', { name: '保存并开始' }).click();
  await expect(page.locator('.study-header-actions > span')).toHaveText('1 / 357');
});
