import fs from 'node:fs/promises';

export const BUNDLED_WORD_FILES = ['public/data/exam-words.json', 'public/data/guide-words.json'];
export const BUNDLED_WORD_COUNTS = [357, 896];

export async function readBundledWords(files = BUNDLED_WORD_FILES) {
  const groups = await Promise.all(files.map(async (file) => JSON.parse(await fs.readFile(file, 'utf8'))));
  groups.forEach((words, index) => {
    if (!Array.isArray(words) || (files === BUNDLED_WORD_FILES && words.length !== BUNDLED_WORD_COUNTS[index])) {
      throw new Error(`语音源词本数量错误：${files[index]}`);
    }
    if (words.some((word) => !word.id || !word.term || !word.meaning)) throw new Error(`语音源词本包含不完整词卡：${files[index]}`);
  });
  const words = groups.flat();
  if (new Set(words.map((word) => word.id)).size !== words.length) throw new Error('语音源词本包含重复 ID');
  return words;
}
