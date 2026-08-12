import { describe, expect, it } from 'vitest';
import { analyzeRows, MAX_IMPORT_ROWS, normalizeTerm, rowsToWords } from './importer';

describe('import parser', () => {
  it('detects Chinese headers and maps optional columns', () => {
    const parsed = analyzeRows([
      ['单词', '释义', '音标', '词形'],
      ['free', '自由的', 'friː', 'freely|freedom']
    ]);
    expect(parsed.hasHeader).toBe(true);
    expect(parsed.mapping.word).toBe(0);
    expect(parsed.mapping.meaning).toBe(1);
    expect(parsed.mapping.phonetic).toBe(2);
  });

  it('uses the first three columns for files without headers', () => {
    const parsed = analyzeRows([['free', '自由的', 'friː']]);
    expect(parsed.hasHeader).toBe(false);
    expect(parsed.mapping).toMatchObject({ word: 0, meaning: 1, phonetic: 2 });
  });

  it('deduplicates terms case-insensitively and counts invalid rows', () => {
    const parsed = analyzeRows([
      ['word', 'meaning'],
      ['Free', '自由的'],
      [' free ', '免费的'],
      ['', '无效']
    ]);
    const result = rowsToWords(parsed.rows, parsed.mapping, 'book');
    expect(result.words).toHaveLength(1);
    expect(result.words[0].meaning).toBe('免费的');
    expect(result.duplicates).toBe(1);
    expect(result.invalid).toBe(1);
    expect(normalizeTerm(' FREE ')).toBe('free');
  });
  it('enforces the 50,000 data-row limit with or without a header', () => {
    const tooMany = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, index) => [`word-${index}`, `含义-${index}`]);
    expect(() => analyzeRows(tooMany)).toThrow('50,000');
    expect(() => analyzeRows([['word', 'meaning'], ...tooMany])).toThrow('50,000');
  });
});
