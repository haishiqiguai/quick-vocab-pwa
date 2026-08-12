import { describe, expect, it } from 'vitest';
import { validateBackup } from './backup';

const valid = {
  version: 1,
  exportedAt: '2026-08-02T00:00:00.000Z',
  wordBooks: [{ id: 'b', name: 'Book', source: 'imported', wordCount: 1, createdAt: '2026-08-02T00:00:00.000Z' }],
  words: [{ id: 'w', bookId: 'b', order: 1, term: 'word', normalizedTerm: 'word', meaning: '单词', variants: [], tags: [] }],
  progress: [{ id: 'p', bookId: 'b', wordId: 'w', viewedCount: 1, favorite: false, correctCount: 0, wrongCount: 0 }],
  sessions: [{ id: 's', bookId: 'b', mode: 'browse', rangeStart: 1, rangeEnd: 1, startedAt: '2026-08-02T00:00:00.000Z', viewed: 1, correct: 0, wrong: 0, roundCompleted: true }],
  meta: [{ key: 'studyPlan', value: {} }]
};

describe('backup validation', () => {
  it('accepts a structurally valid version 1 backup', () => {
    expect(validateBackup(valid).wordBooks).toHaveLength(1);
  });

  it('rejects malformed word records before replacing data', () => {
    expect(() => validateBackup({ ...valid, words: [{ id: 'bad' }] })).toThrow('单词结构无效');
  });

  it('rejects unsupported versions', () => {
    expect(() => validateBackup({ ...valid, version: 2 })).toThrow('不支持此备份版本');
  });
});
