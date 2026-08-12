import { expect, test } from '@playwright/test';

test('study background switches, persists and adapts to dark mode', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByLabel('主题')).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('主题').selectOption('light');
  await page.goto('/study');

  const studyPage = page.locator('.study-page');
  await expect(studyPage).toHaveAttribute('data-study-background', 'default');
  await page.getByRole('button', { name: '打开学习设置' }).click();

  const backgrounds = [
    ['护眼绿', 'eyeCare', 'rgb(238, 244, 232)'],
    ['暖纸黄', 'warmPaper', 'rgb(243, 235, 221)'],
    ['冷灰蓝', 'coolGray', 'rgb(234, 240, 244)']
  ] as const;
  for (const [label, value, color] of backgrounds) {
    await page.getByText(label, { exact: true }).click();
    await expect(studyPage).toHaveAttribute('data-study-background', value);
    await expect(studyPage).toHaveCSS('background-color', color);
  }

  await page.reload();
  await expect(studyPage).toHaveAttribute('data-study-background', 'coolGray');
  await expect(studyPage).toHaveCSS('background-color', 'rgb(234, 240, 244)');

  await page.goto('/plan');
  await expect(page.getByText('学习计划')).toBeVisible();
  await page.getByRole('button', { name: /测验模式/ }).click();
  await page.getByLabel('结束').fill('2');
  await page.getByRole('button', { name: '保存并开始' }).click();
  await expect(page.locator('.review-card')).toBeVisible();
  await expect(studyPage).toHaveAttribute('data-study-background', 'coolGray');
  await expect(studyPage).toHaveCSS('background-color', 'rgb(234, 240, 244)');

  await page.goto('/settings');
  await page.getByLabel('主题').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.waitForTimeout(150);
  await page.goto('/study');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(studyPage).toHaveCSS('background-color', 'rgb(17, 22, 27)');

  await page.getByRole('button', { name: '打开学习设置' }).click();
  await page.getByText('默认', { exact: true }).click();
  await expect(studyPage).toHaveAttribute('data-study-background', 'default');
  await expect(studyPage).toHaveCSS('background-color', 'rgb(5, 5, 5)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
