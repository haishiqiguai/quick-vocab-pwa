import { describe, expect, it } from 'vitest';
import { calculateStudyStats } from './stats';
import type { StudySession, WordProgress } from '../types';

const progress = (id: string, viewedCount: number, lastViewedAt: string, correctCount = 0, wrongCount = 0): WordProgress => ({
  id,
  bookId: id.startsWith('a') ? 'a' : 'b',
  wordId: id,
  viewedCount,
  lastViewedAt,
  favorite: false,
  correctCount,
  wrongCount
});

describe('study statistics', () => {
  it('separates active completion from cumulative and today totals', () => {
    const now = new Date('2026-08-02T12:00:00+08:00');
    const all = [
      progress('a1', 2, '2026-08-02T09:00:00+08:00', 3, 1),
      progress('a2', 0, '2026-08-01T09:00:00+08:00'),
      progress('b1', 1, '2026-08-01T10:00:00+08:00', 1, 0)
    ];
    const sessions: StudySession[] = [{
      id: 's1', bookId: 'a', mode: 'browse', rangeStart: 1, rangeEnd: 10,
      startedAt: '2026-08-02T09:00:00+08:00', endedAt: '2026-08-02T09:10:00+08:00',
      viewed: 2, correct: 0, wrong: 0, roundCompleted: false
    }];
    expect(calculateStudyStats(all.slice(0, 2), all, sessions, now)).toEqual({
      learned: 1,
      cumulativeLearned: 2,
      correct: 4,
      wrong: 1,
      totalTime: 600_000,
      todayTime: 600_000,
      todayLearned: 1
    });
  });
});
