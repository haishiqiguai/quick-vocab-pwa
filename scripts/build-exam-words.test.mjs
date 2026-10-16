import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { convertExamCsv, EXPECTED_WORD_COUNT } from './build-exam-words.mjs';

describe('exam word source', () => {
  it('contains exactly 357 complete, unique words with stable IDs', () => {
    const source = fs.readFileSync('resources/seed/exam-words.csv', 'utf8');
    const words = convertExamCsv(source);
    expect(words).toHaveLength(EXPECTED_WORD_COUNT);
    expect(new Set(words.map((word) => word.term.toLocaleLowerCase('en-US'))).size).toBe(EXPECTED_WORD_COUNT);
    expect(new Set(words.map((word) => word.id)).size).toBe(EXPECTED_WORD_COUNT);
    expect(words.every((word) => word.term && word.meaning && word.phonetic && word.variants.length && word.tags.length && word.id.startsWith('builtin-gaokao:'))).toBe(true);
    expect(JSON.parse(fs.readFileSync('public/data/exam-words.json', 'utf8'))).toEqual(words);
  });

  it('rejects required empty fields and duplicate terms', () => {
    const source = fs.readFileSync('resources/seed/exam-words.csv', 'utf8');
    expect(() => convertExamCsv(source.replace('/əˈwɔːd/', ''))).toThrow('缺少 phonetic');
    expect(() => convertExamCsv(source.replace('\nactive,', '\naward,'))).toThrow('重复单词');
  });
});
