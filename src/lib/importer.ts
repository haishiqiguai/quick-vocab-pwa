import Papa from 'papaparse';
import readXlsxFile, { readSheetNames } from 'read-excel-file';
import { db } from './db';
import { createLocalId } from './id';
import type {
  ColumnMapping,
  ImportResult,
  ImportRow,
  ParsedImport,
  Word,
  WordBook
} from '../types';

export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 50_000;

const aliases = {
  word: ['word', 'term', 'front', '单词', '词语'],
  meaning: ['meaning', 'translation', 'back', '释义', '中文', '中文释义'],
  phonetic: ['phonetic', 'pronunciation', '音标', '发音'],
  variants: ['variants', 'variant', 'exchange', '词形', '变体', '词形变化'],
  frequency: ['frequency', 'frq', 'bnc', '词频', '频率'],
  tags: ['tags', 'tag', '标签', '分类']
} as const;

const emptyMapping: ColumnMapping = {
  word: -1,
  meaning: -1,
  phonetic: -1,
  variants: -1,
  frequency: -1,
  tags: -1
};

function text(value: ImportRow[number]): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function findAlias(headers: string[], key: keyof ColumnMapping): number {
  return headers.findIndex((header) => aliases[key].includes(header.trim().toLocaleLowerCase() as never));
}

export function normalizeTerm(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

export function analyzeRows(inputRows: ImportRow[]): ParsedImport {
  const rows = inputRows.filter((row) => row.some((value) => text(value) !== ''));
  if (!rows.length) throw new Error('文件中没有可读取的数据');

  const first = rows[0].map(text);
  const detected: ColumnMapping = {
    word: findAlias(first, 'word'),
    meaning: findAlias(first, 'meaning'),
    phonetic: findAlias(first, 'phonetic'),
    variants: findAlias(first, 'variants'),
    frequency: findAlias(first, 'frequency'),
    tags: findAlias(first, 'tags')
  };
  const hasHeader = detected.word >= 0 && detected.meaning >= 0;
  const width = Math.max(...rows.map((row) => row.length));
  const headers = hasHeader
    ? first.map((header, index) => header || `第 ${index + 1} 列`)
    : Array.from({ length: width }, (_, index) => `第 ${index + 1} 列`);
  const mapping = hasHeader
    ? detected
    : { ...emptyMapping, word: 0, meaning: 1, phonetic: width > 2 ? 2 : -1 };

  const dataRows = hasHeader ? rows.slice(1) : rows;
  if (dataRows.length > MAX_IMPORT_ROWS) throw new Error(`单次最多导入 ${MAX_IMPORT_ROWS.toLocaleString()} 行`);
  return { rows: dataRows, headers, hasHeader, mapping };
}

export async function parseCsvFile(file: File): Promise<ParsedImport> {
  const content = await file.text();
  const parsed = Papa.parse<Array<string>>(content, { skipEmptyLines: 'greedy' });
  if (parsed.errors.length && !parsed.data.length) throw new Error(parsed.errors[0].message);
  return analyzeRows(parsed.data as ImportRow[]);
}

export async function getWorkbookSheets(file: File): Promise<string[]> {
  return readSheetNames(file);
}

export async function parseXlsxFile(file: File, sheet?: string): Promise<ParsedImport> {
  const rows = await readXlsxFile(file, sheet ? { sheet } : undefined);
  return analyzeRows(rows as ImportRow[]);
}

export async function parseImportFile(file: File, sheet?: string): Promise<ParsedImport> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error('文件不能超过 20 MB');
  const extension = file.name.split('.').pop()?.toLocaleLowerCase();
  if (extension === 'csv') return parseCsvFile(file);
  if (extension === 'xlsx') return parseXlsxFile(file, sheet);
  throw new Error('仅支持 CSV 和 .xlsx 文件');
}

export function rowsToWords(
  rows: ImportRow[],
  mapping: ColumnMapping,
  bookId: string
): { words: Word[]; invalid: number; duplicates: number } {
  if (mapping.word < 0 || mapping.meaning < 0) throw new Error('请选择“单词”和“释义”列');
  const seen = new Map<string, Word>();
  let invalid = 0;
  let duplicates = 0;
  rows.slice(0, MAX_IMPORT_ROWS).forEach((row, index) => {
    const term = text(row[mapping.word]);
    const meaning = text(row[mapping.meaning]);
    const normalizedTerm = normalizeTerm(term);
    if (!normalizedTerm || !meaning) {
      invalid += 1;
      return;
    }
    if (seen.has(normalizedTerm)) duplicates += 1;
    const variants = mapping.variants >= 0
      ? text(row[mapping.variants]).split(/[|/;,，；]+/).map((item) => item.trim()).filter(Boolean)
      : [];
    const tags = mapping.tags >= 0
      ? text(row[mapping.tags]).split(/[|,，;；\s]+/).map((item) => item.trim()).filter(Boolean)
      : [];
    const frequencyValue = mapping.frequency >= 0 ? Number(text(row[mapping.frequency])) : Number.NaN;
    seen.set(normalizedTerm, {
      id: `${bookId}:${createLocalId()}`,
      bookId,
      order: index + 1,
      term,
      normalizedTerm,
      meaning,
      phonetic: mapping.phonetic >= 0 ? text(row[mapping.phonetic]) || undefined : undefined,
      variants,
      frequency: Number.isFinite(frequencyValue) && frequencyValue > 0 ? frequencyValue : undefined,
      tags
    });
  });
  return { words: Array.from(seen.values()), invalid, duplicates };
}

export async function importWordBook(options: {
  name: string;
  parsed: ParsedImport;
  mapping: ColumnMapping;
  targetBookId?: string;
  duplicateStrategy: 'skip' | 'replace';
}): Promise<ImportResult> {
  const targetBookId = options.targetBookId || `imported:${createLocalId()}`;
  const converted = rowsToWords(options.parsed.rows, options.mapping, targetBookId);
  if (!converted.words.length) throw new Error('没有符合要求的单词可以导入');
  let duplicateCount = converted.duplicates;
  let imported = 0;

  await db.transaction('rw', db.wordBooks, db.words, async () => {
    const existingBook = await db.wordBooks.get(targetBookId);
    const existingWords = existingBook ? await db.words.where('bookId').equals(targetBookId).toArray() : [];
    const byTerm = new Map(existingWords.map((word) => [word.normalizedTerm, word]));
    const additions: Word[] = [];

    for (const incoming of converted.words) {
      const duplicate = byTerm.get(incoming.normalizedTerm);
      if (duplicate) {
        duplicateCount += 1;
        if (options.duplicateStrategy === 'replace') {
          additions.push({ ...incoming, id: duplicate.id, order: duplicate.order });
          imported += 1;
        }
      } else {
        incoming.order = existingWords.length + additions.length + 1;
        additions.push(incoming);
        byTerm.set(incoming.normalizedTerm, incoming);
        imported += 1;
      }
    }

    if (additions.length) await db.words.bulkPut(additions);
    const wordCount = await db.words.where('bookId').equals(targetBookId).count();
    const book: WordBook = existingBook
      ? { ...existingBook, name: options.name.trim() || existingBook.name, wordCount }
      : {
          id: targetBookId,
          name: options.name.trim(),
          source: 'imported',
          wordCount,
          createdAt: new Date().toISOString(),
          description: '本地导入词本'
        };
    await db.wordBooks.put(book);
  });

  return { imported, duplicates: duplicateCount, invalid: converted.invalid, bookId: targetBookId };
}
