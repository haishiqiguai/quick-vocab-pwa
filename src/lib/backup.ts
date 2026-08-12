import { db } from './db';
import type { BackupPayload } from '../types';

export async function createBackup(): Promise<BackupPayload> {
  const [wordBooks, words, progress, sessions, meta] = await Promise.all([
    db.wordBooks.toArray(),
    db.words.toArray(),
    db.progress.toArray(),
    db.sessions.toArray(),
    db.meta.toArray()
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    wordBooks,
    words,
    progress,
    sessions,
    meta
  };
}

export async function downloadBackup(): Promise<void> {
  const payload = await createBackup();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `quick-vocab-backup-${payload.exportedAt.slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function validateBackup(value: unknown): BackupPayload {
  if (!value || typeof value !== 'object') throw new Error('备份文件格式错误');
  const payload = value as Partial<BackupPayload>;
  if (payload.version !== 1) throw new Error('不支持此备份版本');
  for (const key of ['wordBooks', 'words', 'progress', 'sessions', 'meta'] as const) {
    if (!Array.isArray(payload[key])) throw new Error(`备份缺少 ${key} 数据`);
  }
  const record = (item: unknown): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item);
  const text = (item: Record<string, unknown>, key: string) => typeof item[key] === 'string' && item[key] !== '';
  const number = (item: Record<string, unknown>, key: string) => typeof item[key] === 'number' && Number.isFinite(item[key]);
  if (!payload.wordBooks!.every((item) => record(item) && text(item, 'id') && text(item, 'name') && number(item, 'wordCount'))) {
    throw new Error('备份中的词本结构无效');
  }
  if (!payload.words!.every((item) => record(item) && text(item, 'id') && text(item, 'bookId') && text(item, 'term') && text(item, 'meaning') && number(item, 'order'))) {
    throw new Error('备份中的单词结构无效');
  }
  if (!payload.progress!.every((item) => record(item) && text(item, 'id') && text(item, 'bookId') && text(item, 'wordId') && typeof item.favorite === 'boolean')) {
    throw new Error('备份中的学习进度结构无效');
  }
  if (!payload.sessions!.every((item) => record(item) && text(item, 'id') && text(item, 'bookId') && text(item, 'mode') && text(item, 'startedAt'))) {
    throw new Error('备份中的学习记录结构无效');
  }
  if (!payload.meta!.every((item) => record(item) && text(item, 'key') && 'value' in item)) {
    throw new Error('备份中的设置结构无效');
  }
  return payload as BackupPayload;
}

export async function restoreBackup(file: File): Promise<void> {
  const payload = validateBackup(JSON.parse(await file.text()) as unknown);
  await db.transaction('rw', db.wordBooks, db.words, db.progress, db.sessions, db.meta, async () => {
    await Promise.all([
      db.wordBooks.clear(),
      db.words.clear(),
      db.progress.clear(),
      db.sessions.clear(),
      db.meta.clear()
    ]);
    await db.wordBooks.bulkAdd(payload.wordBooks);
    await db.words.bulkAdd(payload.words);
    await db.progress.bulkAdd(payload.progress);
    await db.sessions.bulkAdd(payload.sessions);
    await db.meta.bulkAdd(payload.meta);
  });
}
