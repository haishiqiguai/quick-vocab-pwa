import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';

export const EXPECTED_HEADERS = ['word', 'meaning', 'phonetic', 'variants', 'frequency', 'tags'];
export const EXPECTED_WORD_COUNT = 357;
export const BUILTIN_BOOK_ID = 'builtin-gaokao';

function splitList(value) {
  return String(value ?? '')
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
}

function stableWordId(term) {
  const normalized = term.trim().toLocaleLowerCase('en-US');
  const slug = normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'word';
  const digest = createHash('sha256').update(normalized).digest('hex').slice(0, 12);
  return `${BUILTIN_BOOK_ID}:${slug}-${digest}`;
}

export function convertExamCsv(csvText) {
  const result = Papa.parse(csvText.replace(/^\uFEFF/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim()
  });
  if (result.errors.length) {
    const details = result.errors.slice(0, 5).map((error) => `第 ${Number(error.row ?? 0) + 2} 行：${error.message}`).join('\n');
    throw new Error(`CSV 解析失败：\n${details}`);
  }
  const headers = result.meta.fields ?? [];
  if (headers.length !== EXPECTED_HEADERS.length || !EXPECTED_HEADERS.every((header, index) => headers[index] === header)) {
    throw new Error(`CSV 表头必须严格为：${EXPECTED_HEADERS.join(', ')}`);
  }

  const seen = new Set();
  const words = result.data.map((row, index) => {
    const values = Object.fromEntries(EXPECTED_HEADERS.map((header) => [header, String(row[header] ?? '').trim()]));
    const missingField = ['word', 'meaning', 'phonetic', 'variants', 'tags'].find((field) => !values[field]);
    if (missingField) throw new Error(`第 ${index + 2} 行缺少 ${missingField}`);
    const term = values.word;
    const meaning = values.meaning;
    const key = term.toLocaleLowerCase('en-US');
    if (seen.has(key)) throw new Error(`第 ${index + 2} 行存在重复单词：${term}`);
    seen.add(key);
    const frequencyText = values.frequency;
    const frequency = frequencyText ? Number(frequencyText) : undefined;
    if (frequencyText && (!Number.isFinite(frequency) || frequency <= 0)) {
      throw new Error(`第 ${index + 2} 行 frequency 必须是正数或留空`);
    }
    return {
      id: stableWordId(term),
      term,
      meaning,
      phonetic: values.phonetic.replace(/^\/?|\/?$/g, ''),
      variants: splitList(values.variants),
      ...(frequency ? { frequency } : {}),
      tags: splitList(values.tags)
    };
  });

  if (words.length !== EXPECTED_WORD_COUNT) {
    throw new Error(`词数必须为 ${EXPECTED_WORD_COUNT}，实际为 ${words.length}`);
  }
  return words;
}

export function buildExamWords(input, output) {
  const words = convertExamCsv(fs.readFileSync(input, 'utf8'));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(words, null, 2)}\n`);
  return words;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const input = process.argv[2] ?? 'resources/seed/exam-words.csv';
  const output = process.argv[3] ?? 'public/data/exam-words.json';
  const words = buildExamWords(input, output);
  console.log(`Wrote ${words.length} validated exam words to ${output}`);
}
