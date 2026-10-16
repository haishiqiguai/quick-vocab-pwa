import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, BUILTIN_BOOK_ID, GUIDE_BOOK_ID, PLAN_KEY, progressId, resetApplicationData } from './db';
import { ensureSeedData } from './seed';
import { restoreBackup } from './backup';

const source = {
  '/data/exam-words.json': [{ id: 'builtin-gaokao:old', term: 'old', meaning: 'adj. 旧的', phonetic: 'oʊld', variants: [], tags: ['gk'] }],
  '/data/guide-words.json': [{ id: 'builtin-duikou-guide:new', term: 'new', meaning: 'adj. 新的', phonetic: 'nuː', variants: [], tags: ['guide'] }]
};

beforeEach(async () => {
  await db.delete();
  await db.open();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => source[url as keyof typeof source] })));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await db.delete();
});

describe('built-in book migration', () => {
  it('adds both books to a new install and does not duplicate them on restart', async () => {
    await ensureSeedData();
    await ensureSeedData();
    expect(await db.wordBooks.count()).toBe(2);
    expect(await db.words.count()).toBe(2);
    expect((await db.meta.get(PLAN_KEY))?.value).toMatchObject({ bookId: BUILTIN_BOOK_ID, rangeEnd: 1 });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });

  it('adds the new book to an older installation while preserving the plan and progress', async () => {
    await db.wordBooks.add({ id: BUILTIN_BOOK_ID, name: '旧词本', source: 'builtin', wordCount: 1, createdAt: '2026-01-01' });
    await db.words.add({ id: 'builtin-gaokao:old', bookId: BUILTIN_BOOK_ID, order: 1, term: 'old', normalizedTerm: 'old', meaning: 'adj. 旧的', variants: [], tags: [] });
    const plan = { bookId: BUILTIN_BOOK_ID, mode: 'browse' as const, order: 'frequency' as const, rangeStart: 1, rangeEnd: 1 };
    await db.meta.put({ key: PLAN_KEY, value: plan });
    await db.progress.add({ id: progressId(BUILTIN_BOOK_ID, 'builtin-gaokao:old'), bookId: BUILTIN_BOOK_ID, wordId: 'builtin-gaokao:old', viewedCount: 2, favorite: true, correctCount: 1, wrongCount: 0 });
    await ensureSeedData();
    expect((await db.wordBooks.get(BUILTIN_BOOK_ID))?.name).toBe('旧词本');
    expect(await db.wordBooks.get(GUIDE_BOOK_ID)).toMatchObject({ wordCount: 1 });
    expect((await db.meta.get(PLAN_KEY))?.value).toEqual(plan);
    expect((await db.progress.toArray())[0]).toMatchObject({ viewedCount: 2, favorite: true });
  });

  it('recreates both built-in books after reset and adds the new book after restoring an older backup', async () => {
    await ensureSeedData();
    await resetApplicationData();
    await ensureSeedData();
    expect(await db.wordBooks.count()).toBe(2);

    const backup = {
      version: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      wordBooks: [{ id: BUILTIN_BOOK_ID, name: '旧词本', source: 'builtin', wordCount: 1, createdAt: '2026-01-01' }],
      words: [{ id: 'builtin-gaokao:old', bookId: BUILTIN_BOOK_ID, order: 1, term: 'old', normalizedTerm: 'old', meaning: 'adj. 旧的', variants: [], tags: [] }],
      progress: [{ id: progressId(BUILTIN_BOOK_ID, 'builtin-gaokao:old'), bookId: BUILTIN_BOOK_ID, wordId: 'builtin-gaokao:old', viewedCount: 2, favorite: true, correctCount: 1, wrongCount: 0 }],
      sessions: [],
      meta: [{ key: PLAN_KEY, value: { bookId: BUILTIN_BOOK_ID, mode: 'browse', order: 'frequency', rangeStart: 1, rangeEnd: 1 } }]
    };
    await restoreBackup({ text: async () => JSON.stringify(backup) } as File);
    await ensureSeedData();
    expect(await db.wordBooks.count()).toBe(2);
    expect(await db.wordBooks.get(GUIDE_BOOK_ID)).toMatchObject({ wordCount: 1 });
    expect((await db.progress.toArray())[0]).toMatchObject({ favorite: true, viewedCount: 2 });
  });
});
