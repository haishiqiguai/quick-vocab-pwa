import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';

const input = process.argv[2];
const output = process.argv[3] ?? 'public/data/gaokao.json';
if (!input) {
  console.error('Usage: node scripts/build-gaokao.mjs <ecdict.csv> [output.json]');
  process.exit(1);
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function conciseMeaning(value) {
  const lines = String(value ?? '')
    .replace(/\\r\\n|\\n|\\r/g, '\n')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const useful = lines.find((line) => !line.startsWith('[网络]')) ?? lines[0] ?? '';
  return useful.replace(/^([a-z]+\.|\[[^\]]+\])\s*/i, '').slice(0, 120).trim();
}

function variants(value) {
  return Array.from(new Set(String(value ?? '').split('/').map((item) => item.split(':').slice(1).join(':').trim()).filter(Boolean))).slice(0, 8);
}

const csv = fs.readFileSync(input, 'utf8');
const result = Papa.parse(csv, { header: true, skipEmptyLines: true });
if (result.errors.length) console.warn(`ECDICT parse warnings: ${result.errors.length}`);

const byTerm = new Map();
for (const row of result.data) {
  const tags = String(row.tag ?? '').split(/\s+/).filter(Boolean);
  if (!tags.includes('gk')) continue;
  const term = String(row.word ?? '').trim();
  const meaning = conciseMeaning(row.translation);
  if (!/^[A-Za-z][A-Za-z '\-.]*$/.test(term) || !meaning) continue;
  const frequency = positive(row.frq) ?? positive(row.bnc);
  const item = {
    term,
    meaning,
    ...(row.phonetic ? { phonetic: String(row.phonetic).trim() } : {}),
    variants: variants(row.exchange),
    ...(frequency ? { frequency } : {}),
    tags
  };
  const key = term.toLowerCase();
  if (!byTerm.has(key) || (frequency ?? Infinity) < (byTerm.get(key).frequency ?? Infinity)) byTerm.set(key, item);
}

const words = Array.from(byTerm.values()).sort((left, right) => (left.frequency ?? Infinity) - (right.frequency ?? Infinity) || left.term.localeCompare(right.term));
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(words, null, 2) + '\n');
console.log(`Wrote ${words.length} gk words to ${output}`);
