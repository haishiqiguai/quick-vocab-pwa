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

async function readStoredSetting(page: Page, key: string): Promise<unknown> {
  return page.evaluate(async (settingKey) => {
    const request = indexedDB.open('quick-vocab-db');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const record = await new Promise<{ value?: Record<string, unknown> } | undefined>((resolve, reject) => {
        const getRequest = database.transaction('meta').objectStore('meta').get('settings');
        getRequest.onsuccess = () => resolve(getRequest.result);
        getRequest.onerror = () => reject(getRequest.error);
      });
      return record?.value?.[settingKey];
    } finally {
      database.close();
    }
  }, key);
}

test('first launch, plan navigation and responsive width', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Target').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('高考真题词汇')).toBeVisible();
  await expect(page.locator('.hero-stats div').filter({ hasText: 'Target' }).locator('strong')).toHaveText('357');
  await page.getByText('修改计划').click();
  await expect(page.getByText('学习计划')).toBeVisible();
  await expect(page.getByText('浏览模式')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('review guide book switches, searches, studies a range and saves a favorite', async ({ page }) => {
  await page.goto('/plan');
  await expect(page.getByText('对口升学复习指导词汇')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /对口升学复习指导词汇/ }).click();
  await page.getByLabel('结束').fill('2');
  await page.getByRole('button', { name: '保存并开始' }).click();
  await expect(page.locator('.browse-card h1')).toHaveText('towel');
  await page.getByRole('button', { name: '收藏' }).click();
  await page.getByRole('button', { name: '下一个' }).click();
  await expect(page.locator('.browse-card h1')).toHaveText('tower');
  await page.getByRole('button', { name: '退出学习' }).click();
  await expect(page.getByText('对口升学复习指导词汇')).toBeVisible();
  await page.getByLabel('搜索当前词本').fill('towel');
  await expect(page.getByText('n. 毛巾')).toBeVisible();
  await page.goto('/favorites');
  await expect(page.getByText('towel', { exact: true })).toBeVisible();
  await page.goto('/plan');
  await page.getByRole('button', { name: /测验模式/ }).click();
  await page.getByLabel('结束').fill('2');
  await page.getByRole('button', { name: '保存并开始' }).click();
  await expect(page.locator('.review-card h1')).toHaveText('towel');
  await page.locator('.review-options button').filter({ hasText: 'n. 毛巾' }).click();
  await expect(page.locator('.review-card h1')).toHaveText('tower');
  await page.locator('.review-options button').filter({ hasText: 'n. 塔；高楼' }).click();
  await expect(page.getByText('这一轮完成了')).toBeVisible();
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
  const correctMeaning = 'n. 奖项；奖品；奖金；v. 授予；颁发';
  const options = page.locator('.review-options button');
  await expect(options).toHaveCount(4);
  const optionTexts = await options.allTextContents();
  const wrongIndex = optionTexts.findIndex((text) => !text.includes(correctMeaning));
  await options.nth(wrongIndex).click();
  await expect(page.getByText('再记一次')).toBeVisible();
  await page.getByRole('button', { name: '继续' }).click();
  await page.locator('.review-options button').filter({ hasText: 'adj. 活跃的；积极的；主动的' }).click();
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
  await expect(page.locator('.review-card h1')).toHaveText('award');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __spokenWords: string[] }).__spokenWords)).toContain('award');
  const reviewOptions = page.locator('.review-options button');
  const optionTexts = await reviewOptions.allTextContents();
  const wrongIndex = optionTexts.findIndex((text) => !text.includes('n. 奖项；奖品；奖金；v. 授予；颁发'));
  await reviewOptions.nth(wrongIndex).click();
  await expect(page.getByText('再记一次')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __spokenWords: string[] }).__spokenWords.filter((word) => word === 'award').length)).toBe(2);
  await page.getByRole('button', { name: '继续' }).click();
  await expect(page.locator('.review-card h1')).toHaveText('active');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __spokenWords: string[] }).__spokenWords)).toContain('active');

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
  await expect(page.locator('.review-card h1')).toHaveText('active');
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

test('browse automatic playback repeats English, reads Chinese meaning and advances', async ({ page }) => {
  await page.addInitScript(() => {
    const spoken: Array<{ text: string; lang: string }> = [];
    const voices = [
      { lang: 'en-US', name: 'Test English', voiceURI: 'test-en', localService: true },
      { lang: 'zh-CN', name: 'Test Chinese', voiceURI: 'test-zh', localService: true }
    ];
    Object.defineProperty(window, '__autoPlaybackSpoken', { value: spoken, configurable: true });
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
        speak: (utterance: MockUtterance) => {
          spoken.push({ text: utterance.text, lang: utterance.lang });
          window.setTimeout(() => utterance.onend?.(), 5);
        }
      }
    });
  });
  await page.goto('/settings');
  await expect(page.getByText('播放设置')).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('朗读声音', { exact: true }).selectOption('system');
  await page.locator('.playback-setting').filter({ hasText: '自动播放' }).locator('label.switch').click();
  await page.getByLabel('单词循环次数').fill('2');
  await page.locator('.playback-setting').filter({ hasText: '播放单词中文意思' }).locator('label.switch').click();
  await expect(page.getByLabel('自动播放')).toBeChecked();
  await expect(page.getByLabel('播放单词中文意思')).toBeChecked();
  await expect.poll(() => readStoredSetting(page, 'autoPlayMeaning')).toBe(true);
  await page.reload();
  await expect(page.getByLabel('自动播放')).toBeChecked();
  await expect(page.getByLabel('单词循环次数')).toHaveValue('2');
  await expect(page.getByLabel('播放单词中文意思')).toBeChecked();

  await openPlanWithRange(page, '浏览模式', 2);
  await page.getByRole('button', { name: '打开学习设置' }).click();
  await expect(page.getByRole('dialog', { name: '学习设置' })).toContainText('自动播放');
  await expect(page.getByLabel('学习时自动播放')).toBeChecked();
  await expect(page.getByLabel('学习时单词循环次数')).toHaveValue('2');
  await expect(page.getByLabel('学习时播放中文意思')).toBeChecked();
  await page.getByRole('button', { name: '关闭学习设置' }).click();
  await page.getByRole('button', { name: '开始播放' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __autoPlaybackSpoken: Array<{ text: string; lang: string }> }).__autoPlaybackSpoken.filter((item) => item.text !== '。').slice(0, 6))).toEqual([
    { text: 'award', lang: 'en-US' },
    { text: 'award', lang: 'en-US' },
    { text: '名词， 奖项；奖品；奖金；动词， 授予；颁发', lang: 'zh-CN' },
    { text: 'active', lang: 'en-US' },
    { text: 'active', lang: 'en-US' },
    { text: '形容词， 活跃的；积极的；主动的', lang: 'zh-CN' }
  ]);
  await expect(page.getByText('这一轮完成了')).toBeVisible();
});

test('automatic playback pauses before advancing and resumes from the current word', async ({ page }) => {
  await page.addInitScript(() => {
    const spoken: string[] = [];
    const voices = [{ lang: 'en-US', name: 'Test English', voiceURI: 'test-en', localService: true }];
    Object.defineProperty(window, '__autoPlaybackPauseSpoken', { value: spoken, configurable: true });
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
        speak: (utterance: MockUtterance) => {
          spoken.push(utterance.text);
          window.setTimeout(() => utterance.onend?.(), 5);
        }
      }
    });
  });
  await page.goto('/settings');
  await expect(page.getByText('播放设置')).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('朗读声音', { exact: true }).selectOption('system');
  await page.locator('.playback-setting').filter({ hasText: '自动播放' }).locator('label.switch').click();
  await page.getByLabel('间隔时间').fill('1');
  await page.getByLabel('单词循环次数').fill('1');

  await openPlanWithRange(page, '浏览模式', 2);
  await page.getByRole('button', { name: '开始播放' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __autoPlaybackPauseSpoken: string[] }).__autoPlaybackPauseSpoken)).toContain('award');
  await page.getByRole('button', { name: '暂停播放' }).click();
  await page.waitForTimeout(100);
  await expect(page.locator('.browse-card h1')).toHaveText('award');
  await page.getByRole('button', { name: '继续播放' }).click();
  await expect(page.locator('.browse-card h1')).toHaveText('active', { timeout: 2_000 });
  await page.getByRole('button', { name: '停止' }).click();
  await expect(page.getByRole('button', { name: '开始播放' })).toBeVisible();
  await page.getByRole('button', { name: '开始播放' }).click();
  await page.getByRole('button', { name: '打开学习设置' }).click();
  const countWhileOpen = await page.evaluate(() => (window as unknown as { __autoPlaybackPauseSpoken: string[] }).__autoPlaybackPauseSpoken.length);
  await page.getByLabel('学习时播放间隔时间').fill('60');
  await page.waitForTimeout(1200);
  await expect(page.locator('.browse-card h1')).toHaveText('active');
  expect(await page.evaluate(() => (window as unknown as { __autoPlaybackPauseSpoken: string[] }).__autoPlaybackPauseSpoken.length)).toBe(countWhileOpen);
  await page.getByRole('button', { name: '关闭学习设置' }).click();
  await expect(page.getByRole('button', { name: '暂停播放' })).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(page.locator('.browse-card h1')).toHaveText('active');
  await page.getByRole('button', { name: '停止' }).click();
});

test('stopping automatic playback does not re-read the current word', async ({ page }) => {
  await page.addInitScript(() => {
    const spoken: string[] = [];
    const voices = [{ lang: 'en-US', name: 'Test English', voiceURI: 'test-en', localService: true }];
    Object.defineProperty(window, '__autoPlaybackStopSpoken', { value: spoken, configurable: true });
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
        speak: (utterance: MockUtterance) => {
          spoken.push(utterance.text);
          window.setTimeout(() => utterance.onend?.(), 30);
        }
      }
    });
  });
  await page.goto('/settings');
  await expect(page.getByText('播放设置')).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('朗读声音', { exact: true }).selectOption('system');
  await page.locator('.inline-setting').filter({ hasText: '自动朗读' }).locator('label.switch').click();
  await page.locator('.playback-setting').filter({ hasText: '自动播放' }).locator('label.switch').click();
  await page.getByLabel('间隔时间').fill('1');
  await page.getByLabel('单词循环次数').fill('1');

  await openPlanWithRange(page, '浏览模式', 2);
  await page.getByRole('button', { name: '开始播放' }).click();
  await expect(page.locator('.browse-card h1')).toHaveText('active', { timeout: 2_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __autoPlaybackStopSpoken: string[] }).__autoPlaybackStopSpoken.filter((word) => word === 'active').length)).toBe(1);
  await page.getByRole('button', { name: '停止' }).click();
  await page.waitForTimeout(100);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __autoPlaybackStopSpoken: string[] }).__autoPlaybackStopSpoken.filter((word) => word === 'active').length)).toBe(1);
});

test('automatic playback requires enabled playback content', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByText('播放设置')).toBeVisible({ timeout: 20_000 });
  await page.locator('.playback-setting').filter({ hasText: '自动播放' }).locator('label.switch').click();
  await page.getByLabel('播放单词', { exact: true }).locator('xpath=..').click();
  await expect(page.getByLabel('播放单词', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('播放单词中文意思')).not.toBeChecked();

  await openPlanWithRange(page, '浏览模式', 1);
  await page.getByRole('button', { name: '开始播放' }).click();
  await expect(page.getByRole('status')).toContainText('请至少开启“播放单词”或“播放单词中文意思”');
  await expect(page.locator('.browse-card h1')).toHaveText('award');
});

test('automatic playback stops on speech failure without advancing progress', async ({ page }) => {
  await page.addInitScript(() => {
    const voices = [{ lang: 'en-US', name: 'Test English', voiceURI: 'test-en', localService: true }];
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
        speak: (utterance: MockUtterance) => window.setTimeout(() => utterance.onerror?.({ error: 'synthesis-failed' }), 5)
      }
    });
  });
  await page.goto('/settings');
  await expect(page.getByText('播放设置')).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('朗读声音', { exact: true }).selectOption('system');
  await page.locator('.playback-setting').filter({ hasText: '自动播放' }).locator('label.switch').click();
  await page.getByLabel('单词循环次数').fill('1');

  await openPlanWithRange(page, '浏览模式', 2);
  await page.getByRole('button', { name: '开始播放' }).click();
  await expect(page.getByRole('status')).toContainText('英文朗读失败，自动播放已停止');
  await expect(page.getByRole('button', { name: '开始播放' })).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page.locator('.browse-card h1')).toHaveText('award');
  await expect(page.getByText('这一轮完成了')).not.toBeVisible();
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
          if (utterance.text === 'active') window.setTimeout(() => utterance.onerror?.({ error: 'synthesis-failed' }), 0);
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
  await page.getByRole('button', { name: '关闭学习设置' }).click();
  await expect(page.getByRole('dialog', { name: '学习设置' })).toBeHidden();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __spokenWords: string[] }).__spokenWords)).toContain('award');
  await page.getByRole('button', { name: '打开学习设置' }).click();
  await page.getByRole('button', { name: '快速 1.3 倍速' }).click();
  await expect(page.getByRole('button', { name: '快速 1.3 倍速' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '试听' }).click();
  await page.getByRole('button', { name: '关闭学习设置' }).click();
  await expect(page.getByRole('dialog', { name: '学习设置' })).toBeHidden();
  await page.getByRole('button', { name: '下一个' }).click();
  await expect(page.locator('.browse-card h1')).toHaveText('active');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __spokenWords: string[] }).__spokenWords)).toContain('active');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __spokenRates: Array<{ text: string; rate: number; voice?: string }> }).__spokenRates.find((item) => item.text === 'active')?.rate)).toBe(1.3);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __spokenRates: Array<{ text: string; rate: number; voice?: string }> }).__spokenRates.find((item) => item.text === 'active')?.voice)).toBe('Test English');
  await expect(page.getByRole('status')).toContainText('朗读暂不可用');
  await page.getByRole('button', { name: '退出学习' }).click();
  await page.locator('.hero-stats').click();
  await expect(page.locator('.browse-card h1')).toHaveText('active');
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
