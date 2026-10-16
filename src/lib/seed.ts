import { db, BUILTIN_BOOK_ID, GUIDE_BOOK_ID, defaultPlan, defaultSettings, PLAN_KEY, repairCompletedBrowseSessions, SETTINGS_KEY } from './db';
import type { SeedWord, Word, WordBook } from '../types';

function wordId(bookId: string, term: string, index: number): string {
  const normalized = term.trim().toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, '-');
  return `${bookId}:${normalized || index}`;
}

async function ensureBuiltinBook(bookId: string, file: string, name: string, description: string): Promise<void> {
  const existing = await db.wordBooks.get(bookId);
  if (!existing) {
    const response = await fetch(file);
    if (!response.ok) throw new Error(`内置词库加载失败：${name}`);
    const seed = (await response.json()) as SeedWord[];
    const words: Word[] = seed.map((item, index) => ({
      id: item.id ?? wordId(bookId, item.term, index),
      bookId,
      order: index + 1,
      term: item.term.trim(),
      normalizedTerm: item.term.trim().toLocaleLowerCase('en-US'),
      meaning: item.meaning.trim(),
      phonetic: item.phonetic?.trim() || undefined,
      variants: item.variants ?? [],
      frequency: item.frequency,
      tags: item.tags ?? (bookId === BUILTIN_BOOK_ID ? ['gk'] : ['guide'])
    }));
    const book: WordBook = {
      id: bookId,
      name,
      source: 'builtin',
      wordCount: words.length,
      createdAt: new Date().toISOString(),
      description
    };
    await db.transaction('rw', db.wordBooks, db.words, async () => {
      await db.wordBooks.add(book);
      await db.words.bulkAdd(words);
    });
  }
}

export async function ensureSeedData(): Promise<void> {
  await ensureBuiltinBook(BUILTIN_BOOK_ID, '/data/exam-words.json', '高考真题词汇', '自制导入版 · 校对整理完成 · 357 词');
  await ensureBuiltinBook(GUIDE_BOOK_ID, '/data/guide-words.json', '对口升学复习指导词汇', '复习指导 300 题四选项 · 去重后 896 词');

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
