import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

async function openPlanWithRange(page: Page, mode: '浏览模式' | '测验模式', end: number) {
  await page.goto('/plan');
  await expect(page.getByText('学习计划')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: new RegExp(mode) }).click();
  await page.getByLabel('起始').fill('1');
  await page.getByLabel('结束').fill(String(end));
  await page.getByRole('button', { name: '保存并开始' }).click();
}

test('first launch, plan navigation and responsive width', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Target').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('开放高考词汇')).toBeVisible();
  await expect(page.locator('.hero-stats div').filter({ hasText: 'Target' }).locator('strong')).toHaveText('500');
  await page.getByText('修改计划').click();
  await expect(page.getByText('学习计划')).toBeVisible();
  await expect(page.getByText('浏览模式')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('browse records progress, favorite and exactly one completed round', async ({ page }) => {
  await openPlanWithRange(page, '浏览模式', 1);
  await expect(page.getByText('Target').first()).toBeVisible();
  const term = await page.locator('.browse-card h1').textContent();
  await page.getByRole('button', { name: '收藏' }).click();
  await page.getByRole('button', { name: '下一个' }).click();
  await expect(page.getByText('这一轮完成了')).toBeVisible();
  await page.getByRole('button', { name: '返回首页' }).click();
  await expect(page.locator('.hero-stats div').filter({ hasText: 'Rounds' }).locator('strong')).toHaveText('1');
  await expect(page.locator('.hero-stats')).toHaveAttribute('aria-label', '开始当前学习计划');
  await page.reload();
  await page.goto('/favorites');
  await expect(page.getByText(term ?? '', { exact: true }).first()).toBeVisible();
});

test('review requeues a wrong word and completes only after it is answered correctly', async ({ page }) => {
  await openPlanWithRange(page, '测验模式', 2);
  const firstTerm = await page.locator('.review-card h1').textContent();
  const correctMeaning = '那';
  const options = page.locator('.review-options button');
  await expect(options).toHaveCount(4);
  const optionTexts = await options.allTextContents();
  const wrongIndex = optionTexts.findIndex((text) => !text.includes(correctMeaning));
  await options.nth(wrongIndex).click();
  await expect(page.getByText('再记一次')).toBeVisible();
  await page.getByRole('button', { name: '继续' }).click();
  await page.locator('.review-options button').filter({ hasText: '是, 表示, 在' }).click();
  await expect(page.locator('.review-card h1')).toHaveText(firstTerm ?? '');
  await page.locator('.review-options button').filter({ hasText: correctMeaning }).click();
  await expect(page.getByText('这一轮完成了')).toBeVisible();
  await page.getByRole('button', { name: '返回首页' }).click();
  await expect(page.locator('.hero-stats div').filter({ hasText: 'Rounds' }).locator('strong')).toHaveText('1');
});

test('review auto pronunciation works and its exact queue resumes after exit', async ({ page }) => {
  await page.addInitScript(() => {
    const spoken: string[] = [];
    const voices = [{ lang: 'en-US', name: 'Test English', voiceURI: 'test-local', localService: true }];
    Object.defineProperty(window, '__spokenWords', { value: spoken, configurable: true });
    class MockUtterance {
      text: string;
      lang = '';
      rate = 1;
      voice: SpeechSynthesisVoice | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      constructor(text: string) { this.text = text; }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: MockUtterance, configurable: true });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        getVoices: () => voices,
        speak: (utterance: MockUtterance) => spoken.push(utterance.text)
      }
    });
  });
  await page.goto('/settings');
  await expect(page.getByText('导入单词本')).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('朗读声音', { exact: true }).selectOption('system');
  await page.locator('.inline-setting').filter({ hasText: '自动朗读' }).locator('label.switch').click();
  await expect(page.getByLabel('自动朗读', { exact: true })).toBeChecked();

  await openPlanWithRange(page, '测验模式', 2);
  await expect(page.locator('.review-card h1')).toHaveText('the');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __spokenWords: string[] }).__spokenWords)).toContain('the');
  const reviewOptions = page.locator('.review-options button');
  const optionTexts = await reviewOptions.allTextContents();
  const wrongIndex = optionTexts.findIndex((text) => !text.includes('那'));
  await reviewOptions.nth(wrongIndex).click();
  await expect(page.getByText('再记一次')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __spokenWords: string[] }).__spokenWords.filter((word) => word === 'the').length)).toBe(2);
  await page.getByRole('button', { name: '继续' }).click();
  await expect(page.locator('.review-card h1')).toHaveText('be');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __spokenWords: string[] }).__spokenWords)).toContain('be');

  await page.getByRole('button', { name: '退出学习' }).click();
  await expect(page.locator('.hero-stats')).toHaveAttribute('aria-label', '继续上次学习进度');
  const sessionCountBeforeResume = await page.evaluate(async () => {
    const request = indexedDB.open('quick-vocab-db');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return new Promise<number>((resolve, reject) => {
      const countRequest = database.transaction('sessions').objectStore('sessions').count();
      countRequest.onsuccess = () => resolve(countRequest.result);
      countRequest.onerror = () => reject(countRequest.error);
    });
  });
  await page.locator('.hero-stats').click();
  await expect(page.locator('.review-card h1')).toHaveText('be');
  await expect.poll(() => page.evaluate(async () => {
    const request = indexedDB.open('quick-vocab-db');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return new Promise<number>((resolve, reject) => {
      const countRequest = database.transaction('sessions').objectStore('sessions').count();
      countRequest.onsuccess = () => resolve(countRequest.result);
      countRequest.onerror = () => reject(countRequest.error);
    });
  })).toBe(sessionCountBeforeResume + 1);
});

test('settings persists theme and backup restore', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByText('导入单词本')).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('主题').selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByLabel('昵称').fill('Alice');
  await page.getByText('备份与恢复').click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON' }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  expect(backupPath).toBeTruthy();
  await page.goto('/settings');
  await page.getByLabel('昵称').fill('Bob');
  await page.goto('/backup');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('input[type=file]').setInputFiles(backupPath!);
  await expect(page.getByText('备份恢复完成')).toBeVisible();
  await page.goto('/settings');
  await expect(page.getByLabel('昵称')).toHaveValue('Alice');
});

test('CSV import previews, validates and persists a new word book', async ({ page }) => {
  await page.goto('/import');
  await page.locator('input[type=file]').setInputFiles(path.resolve('public/import-template.csv'));
  await expect(page.getByText('字段映射')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('前 20 行预览')).toBeVisible();
  await page.getByLabel('词本名称').fill('自动化测试词本');
  await page.getByRole('button', { name: '确认导入' }).click();
  await expect(page.getByText('词本导入完成')).toBeVisible();
  await page.reload();
  await page.goto('/plan');
  await expect(page.getByText('自动化测试词本')).toBeVisible();
});

test('downloaded CSV template is Excel-compatible UTF-8', async ({ page }) => {
  await page.goto('/import');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: '下载导入模板' }).click();
  const download = await downloadPromise;
  const downloadedPath = await download.path();
  expect(downloadedPath).toBeTruthy();
  const content = await readFile(downloadedPath!);
  expect([...content.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  expect(content.toString('utf8')).toContain('自由的；免费的；释放');
});

test('PWA starts and keeps local core pages available offline', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByText('Target').first()).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Target').first()).toBeVisible();
  await page.goto('/settings');
  await expect(page.getByText('导入单词本')).toBeVisible();
  await context.setOffline(false);
});

test('auto pronunciation, resume card and full nickname persist together', async ({ page }) => {
  await page.route('**/api/speech/audio?**', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: '测试环境未启用神经语音' })
  }));
  await page.addInitScript(() => {
    const spoken: string[] = [];
    const spokenRates: Array<{ text: string; rate: number; voice?: string }> = [];
    const voices = [
      { lang: 'en-US', name: 'Test English', voiceURI: 'test-local', localService: true },
      { lang: 'en-US', name: 'Natural English', voiceURI: 'test-natural', localService: false }
    ];
    Object.defineProperty(window, '__spokenWords', { value: spoken, configurable: true });
    Object.defineProperty(window, '__spokenRates', { value: spokenRates, configurable: true });
    let active: MockUtterance | undefined;
    class MockUtterance {
      text: string;
      lang = '';
      rate = 1;
      voice: SpeechSynthesisVoice | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      constructor(text: string) { this.text = text; }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: MockUtterance, configurable: true });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {
          const previous = active;
          active = undefined;
          previous?.onerror?.({ error: 'interrupted' });
        },
        getVoices: () => voices,
        speak: (utterance: MockUtterance) => {
          active = utterance;
          spoken.push(utterance.text);
          spokenRates.push({ text: utterance.text, rate: utterance.rate, voice: utterance.voice?.name });
          if (utterance.text === 'be') window.setTimeout(() => utterance.onerror?.({ error: 'synthesis-failed' }), 0);
        }
      }
    });
  });
  await openPlanWithRange(page, '浏览模式', 3);
  await page.getByRole('button', { name: '打开学习设置' }).click();
  await expect(page.getByRole('dialog', { name: '学习设置' })).toBeVisible();
  await page.getByLabel('朗读声音', { exact: true }).selectOption('system');
  await page.waitForTimeout(50);
  await page.locator('.auto-pronounce-control').filter({ hasText: '自动朗读' }).click();
  await expect(page.getByLabel('浏览时自动朗读')).toBeChecked();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __spokenWords: string[] }).__spokenWords)).toContain('the');
  await page.getByRole('button', { name: '快速 1.3 倍速' }).click();
  await expect(page.getByRole('button', { name: '快速 1.3 倍速' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '试听' }).click();
  await page.getByRole('button', { name: '关闭学习设置' }).click();
  await expect(page.getByRole('dialog', { name: '学习设置' })).toBeHidden();
  await page.getByRole('button', { name: '下一个' }).click();
  await expect(page.locator('.browse-card h1')).toHaveText('be');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __spokenWords: string[] }).__spokenWords)).toContain('be');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __spokenRates: Array<{ text: string; rate: number; voice?: string }> }).__spokenRates.find((item) => item.text === 'be')?.rate)).toBe(1.3);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __spokenRates: Array<{ text: string; rate: number; voice?: string }> }).__spokenRates.find((item) => item.text === 'be')?.voice)).toBe('Test English');
  await expect(page.getByRole('status')).toContainText('朗读暂不可用');
  await page.getByRole('button', { name: '退出学习' }).click();
  await page.locator('.hero-stats').click();
  await expect(page.locator('.browse-card h1')).toHaveText('be');
  await page.getByRole('button', { name: '打开学习设置' }).click();
  await expect(page.getByRole('button', { name: '快速 1.3 倍速' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('朗读声音', { exact: true }).selectOption('en-US-GuyNeural');
  await expect(page.getByLabel('朗读声音', { exact: true })).toHaveValue('en-US-GuyNeural');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '学习设置' })).toBeHidden();
  await page.goto('/settings');
  await expect(page.getByLabel('朗读速度')).toHaveValue('1.3');
  await expect(page.getByLabel('朗读声音', { exact: true })).toHaveValue('en-US-GuyNeural');
  await page.getByLabel('朗读声音', { exact: true }).selectOption('system');
  await page.getByRole('button', { name: '试听朗读声音' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __spokenRates: Array<{ text: string; rate: number; voice?: string }> }).__spokenRates.findLast((item) => item.text === 'welcome')?.voice)).toBe('Test English');
  await page.getByLabel('昵称').fill('Long Learner Name');
  await page.getByRole('link', { name: /首页/ }).click();
  await expect(page.locator('.profile-chip strong')).toHaveText('Long Learner Name');
});
