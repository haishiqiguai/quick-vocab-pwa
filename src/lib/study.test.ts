import { describe, expect, it } from 'vitest';
import { applyStudyPlan, buildReviewOptions, moveWrongWordToBack, rangePresets, shuffleWords } from './study';
import type { StudyPlan, Word } from '../types';

const words: Word[] = [
  { id: 'a', bookId: 'b', order: 1, term: 'after', normalizedTerm: 'after', meaning: '在……之后', variants: [], tags: [], frequency: 200 },
  { id: 'b', bookId: 'b', order: 2, term: 'admit', normalizedTerm: 'admit', meaning: '承认', variants: [], tags: [], frequency: 10 },
  { id: 'c', bookId: 'b', order: 3, term: 'free', normalizedTerm: 'free', meaning: '自由的', variants: [], tags: [], frequency: 80 },
  { id: 'd', bookId: 'b', order: 4, term: 'excited', normalizedTerm: 'excited', meaning: '激动的', variants: [], tags: [] }
];

const plan: StudyPlan = { bookId: 'b', mode: 'browse', order: 'frequency', rangeStart: 1, rangeEnd: 3 };

describe('study utilities', () => {
  it('sorts by frequency before applying the range', () => {
    expect(applyStudyPlan(words, plan).map((word) => word.term)).toEqual(['admit', 'free', 'after']);
  });

  it('moves a wrong answer to the back of the queue', () => {
    expect(moveWrongWordToBack(['a', 'b', 'c'])).toEqual(['b', 'c', 'a']);
  });

  it('creates ranges no larger than 500', () => {
    expect(rangePresets(1201)).toEqual([[1, 500], [501, 1000], [1001, 1201]]);
  });

  it('builds one correct and three distinct distractors', () => {
    const options = buildReviewOptions(words[0], words, () => 0.2);
    expect(options).toHaveLength(4);
    expect(new Set(options).size).toBe(4);
    expect(options).toContain(words[0].meaning);
  });

  it('shuffles without mutating the source', () => {
    const source = [1, 2, 3, 4];
    const result = shuffleWords(source, () => 0);
    expect(source).toEqual([1, 2, 3, 4]);
    expect(result).not.toEqual(source);
  });
});
