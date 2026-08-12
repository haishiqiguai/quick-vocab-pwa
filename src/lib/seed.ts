import { db, BUILTIN_BOOK_ID, defaultPlan, defaultSettings, PLAN_KEY, repairCompletedBrowseSessions, SETTINGS_KEY } from './db';
import type { SeedWord, Word, WordBook } from '../types';

function wordId(term: string, index: number): string {
  const normalized = term.trim().toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, '-');
  return `${BUILTIN_BOOK_ID}:${normalized || index}`;
}

export async function ensureSeedData(): Promise<void> {
  const existing = await db.wordBooks.get(BUILTIN_BOOK_ID);
  if (!existing) {
    const response = await fetch('/data/gaokao.json');
    if (!response.ok) throw new Error('内置高考词库加载失败');
    const seed = (await response.json()) as SeedWord[];
    const words: Word[] = seed.map((item, index) => ({
      id: wordId(item.term, index),
      bookId: BUILTIN_BOOK_ID,
      order: index + 1,
      term: item.term.trim(),
      normalizedTerm: item.term.trim().toLocaleLowerCase('en-US'),
      meaning: item.meaning.trim(),
      phonetic: item.phonetic?.trim() || undefined,
      variants: item.variants ?? [],
      frequency: item.frequency,
      tags: item.tags ?? ['gk']
    }));
    const book: WordBook = {
      id: BUILTIN_BOOK_ID,
      name: '开放高考词汇',
      source: 'builtin',
      wordCount: words.length,
      createdAt: new Date().toISOString(),
      license: 'ECDICT · MIT License',
      description: '从 ECDICT 的 gk 标签筛选并按词频整理'
    };
    await db.transaction('rw', db.wordBooks, db.words, async () => {
      await db.wordBooks.add(book);
      await db.words.bulkAdd(words);
    });
  }

  const [settings, plan, book] = await Promise.all([
    db.meta.get(SETTINGS_KEY),
    db.meta.get(PLAN_KEY),
    db.wordBooks.get(BUILTIN_BOOK_ID)
  ]);
  if (!settings) await db.meta.put({ key: SETTINGS_KEY, value: defaultSettings });
  if (!plan) {
    await db.meta.put({
      key: PLAN_KEY,
      value: { ...defaultPlan, rangeEnd: Math.min(500, book?.wordCount ?? 500) }
    });
  }
  await repairCompletedBrowseSessions();
}
