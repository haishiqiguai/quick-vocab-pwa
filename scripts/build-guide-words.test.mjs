import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { convertGuideCsv, validateGuideQuestions, GUIDE_WORD_COUNT } from './build-guide-words.mjs';

const questions = fs.readFileSync('resources/seed/guide-questions.csv', 'utf8');
const source = fs.readFileSync('resources/seed/guide-words.csv', 'utf8');

describe('review guide source', () => {
  it('records every printed question and option and produces a complete deduplicated book', () => {
    const checked = validateGuideQuestions(questions);
    expect(checked.rows).toHaveLength(300);
    expect(checked.options).toHaveLength(1200);
    expect(checked.distinct).toHaveLength(GUIDE_WORD_COUNT);
    const words = convertGuideCsv(source, questions);
    expect(words).toHaveLength(GUIDE_WORD_COUNT);
    expect(new Set(words.map((word) => word.id)).size).toBe(GUIDE_WORD_COUNT);
    expect(words.every((word) => word.term && word.meaning && word.phonetic && word.tags[0] === 'guide')).toBe(true);
    expect(JSON.parse(fs.readFileSync('public/data/guide-words.json', 'utf8'))).toEqual(words);
  });

  it('rejects a missing option and a misplaced word', () => {
    expect(() => validateGuideQuestions(questions.replace(',towel,tower,tool,tooth,', ',towel,,tool,tooth,'))).toThrow('选项无效');
    expect(() => convertGuideCsv(source.replace('\ntower,', '\ntowel,'), questions)).toThrow('首次出现顺序');
  });
});
