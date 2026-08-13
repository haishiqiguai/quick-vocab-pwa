import { describe, expect, it } from 'vitest';
import { calculateDailyActivity, calculateStudyStats } from './stats';
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

  it('keeps historical active days from sessions when word timestamps were overwritten', () => {
    const all = [progress('a1', 3, '2026-08-13T09:00:00+08:00')];
    const sessions: StudySession[] = [
      {
        id: 's2', bookId: 'a', mode: 'browse', rangeStart: 1, rangeEnd: 10,
        startedAt: '2026-08-02T09:00:00+08:00', endedAt: '2026-08-02T09:10:00+08:00',
        viewed: 1, correct: 0, wrong: 0, roundCompleted: false
      },
      {
        id: 's3', bookId: 'a', mode: 'review', rangeStart: 1, rangeEnd: 10,
        startedAt: '2026-08-07T09:00:00+08:00', endedAt: '2026-08-07T09:10:00+08:00',
        viewed: 2, correct: 1, wrong: 1, roundCompleted: false
      }
    ];
    const activity = calculateDailyActivity(all, sessions, [
      { bookId: 'a', date: '2026-08-09', count: 4 }
    ]);
    expect([...activity.entries()]).toEqual([
      ['2026-08-13', 1],
      ['2026-08-02', 1],
      ['2026-08-07', 2],
      ['2026-08-09', 4]
    ]);
  });
});
