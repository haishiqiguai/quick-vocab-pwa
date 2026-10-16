import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';

export const GUIDE_BOOK_ID = 'builtin-duikou-guide';
export const GUIDE_WORD_COUNT = 896;
export const QUESTION_COUNT = 300;
const WORD_HEADERS = ['word', 'meaning', 'phonetic', 'variants', 'frequency', 'tags'];
const QUESTION_HEADERS = ['number', 'page', 'clue', 'A', 'B', 'C', 'D', 'answer'];

function parseCsv(source, headers, label) {
  const parsed = Papa.parse(source.replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: 'greedy', transformHeader: (header) => header.trim() });
  if (parsed.errors.length) throw new Error(`${label} CSV 解析失败：${parsed.errors[0].message}`);
  if (JSON.stringify(parsed.meta.fields) !== JSON.stringify(headers)) throw new Error(`${label} CSV 表头必须为 ${headers.join(',')}`);
  return parsed.data.map((row) => Object.fromEntries(headers.map((header) => [header, String(row[header] ?? '').trim()])));
}

export function normalizedGuideTerm(term) {
  return term.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function validateGuideQuestions(source) {
  const rows = parseCsv(source, QUESTION_HEADERS, '题目');
  if (rows.length !== QUESTION_COUNT) throw new Error(`题目必须连续覆盖 1—${QUESTION_COUNT}，实际 ${rows.length} 题`);
  const options = [];
  for (const [index, row] of rows.entries()) {
    const expectedPage = index < 20 ? 1 : Math.min(14, Math.floor((index - 20) / 22) + 2);
    if (Number(row.number) !== index + 1 || Number(row.page) !== expectedPage) throw new Error(`第 ${index + 1} 题题号或页码错误`);
    if (!row.clue || !/^[ABCD]$/.test(row.answer)) throw new Error(`第 ${index + 1} 题缺少中文题干或答案`);
    for (const letter of 'ABCD') {
      const option = normalizedGuideTerm(row[letter]);
      if (!/^[a-z][a-z -]*[a-z]$|^[a-z]$/.test(option)) throw new Error(`第 ${index + 1} 题 ${letter} 选项无效：${row[letter]}`);
      options.push(option);
    }
  }
  if (options.length !== 1200) throw new Error('四选项记录必须恰好 1200 条');
  return { rows, options, distinct: [...new Set(options)] };
}

export function convertGuideCsv(wordsSource, questionsSource) {
  const questions = validateGuideQuestions(questionsSource);
  const rows = parseCsv(wordsSource, WORD_HEADERS, '词库');
  if (rows.length !== questions.distinct.length || rows.length !== GUIDE_WORD_COUNT) {
    throw new Error(`词库必须有 ${questions.distinct.length} 个去重词形，实际 ${rows.length}`);
  }
  return rows.map((row, index) => {
    const term = normalizedGuideTerm(row.word);
    if (term !== questions.distinct[index]) throw new Error(`第 ${index + 2} 行必须按题目首次出现顺序填写：${questions.distinct[index]}`);
    if (!/^(?:n|v|vt|vi|adj|adv|prep|pron|conj|num|int|art|abbr|pl|modal v)\./.test(row.meaning) || !/[\u3400-\u9fff]/.test(row.meaning)) {
      throw new Error(`第 ${index + 2} 行缺少词性或汉译：${term}`);
    }
    if (!/^\/.+\/$/.test(row.phonetic)) throw new Error(`第 ${index + 2} 行缺少音标：${term}`);
    if (row.frequency && (!Number.isFinite(Number(row.frequency)) || Number(row.frequency) <= 0)) throw new Error(`第 ${index + 2} 行词频必须为正数或留空`);
    if (row.tags !== 'guide') throw new Error(`第 ${index + 2} 行标签必须为 guide`);
    const slug = term.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'word';
    const digest = createHash('sha256').update(term).digest('hex').slice(0, 12);
    return {
      id: `${GUIDE_BOOK_ID}:${slug}-${digest}`,
      term,
      meaning: row.meaning,
      phonetic: row.phonetic.slice(1, -1),
      variants: row.variants.split('|').map((item) => item.trim()).filter(Boolean),
      ...(row.frequency ? { frequency: Number(row.frequency) } : {}),
      tags: ['guide']
    };
  });
}

export function buildGuideWords(wordsPath = 'resources/seed/guide-words.csv', questionsPath = 'resources/seed/guide-questions.csv', outputPath = 'public/data/guide-words.json') {
  const words = convertGuideCsv(fs.readFileSync(wordsPath, 'utf8'), fs.readFileSync(questionsPath, 'utf8'));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(words, null, 2)}\n`);
  return words;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const words = buildGuideWords();
  console.log(`Wrote ${words.length} validated guide words`);
}
