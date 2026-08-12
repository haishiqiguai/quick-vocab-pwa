import type { StudyPlan, Word } from '../types';

export function shuffleWords<T>(items: T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function applyStudyPlan(words: Word[], plan: StudyPlan): Word[] {
  const ordered = [...words].sort((left, right) => {
    if (plan.order === 'frequency') {
      const leftFrequency = left.frequency && left.frequency > 0 ? left.frequency : Number.MAX_SAFE_INTEGER;
      const rightFrequency = right.frequency && right.frequency > 0 ? right.frequency : Number.MAX_SAFE_INTEGER;
      return leftFrequency - rightFrequency || left.order - right.order;
    }
    return left.order - right.order;
  });
  const selected = ordered.slice(Math.max(0, plan.rangeStart - 1), Math.max(plan.rangeStart, plan.rangeEnd));
  return plan.order === 'random' ? shuffleWords(selected) : selected;
}

export function rangePresets(wordCount: number, chunkSize = 500): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (let start = 1; start <= wordCount; start += chunkSize) {
    ranges.push([start, Math.min(wordCount, start + chunkSize - 1)]);
  }
  return ranges;
}

export function buildReviewOptions(current: Word, allWords: Word[], random: () => number = Math.random): string[] {
  const meanings = Array.from(
    new Set(allWords.filter((word) => word.id !== current.id).map((word) => word.meaning).filter(Boolean))
  );
  const distractors = shuffleWords(meanings, random).slice(0, 3);
  return shuffleWords([current.meaning, ...distractors], random);
}

export function moveWrongWordToBack(queue: string[]): string[] {
  if (queue.length <= 1) return queue;
  return [...queue.slice(1), queue[0]];
}
