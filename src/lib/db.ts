import Dexie, { type EntityTable } from 'dexie';
import type {
  AppSettings,
  MetaRecord,
  StudyPlan,
  StudySession,
  StudyActivityRecord,
  Word,
  WordBook,
  WordProgress
} from '../types';

export const BUILTIN_BOOK_ID = 'builtin-gaokao';
export const PLAN_KEY = 'studyPlan';
export const SETTINGS_KEY = 'settings';
export const ACTIVITY_KEY_PREFIX = 'studyActivity:';

class VocabDatabase extends Dexie {
  wordBooks!: EntityTable<WordBook, 'id'>;
  words!: EntityTable<Word, 'id'>;
  progress!: EntityTable<WordProgress, 'id'>;
  sessions!: EntityTable<StudySession, 'id'>;
  meta!: EntityTable<MetaRecord, 'key'>;

  constructor() {
    super('quick-vocab-db');
    this.version(1).stores({
      wordBooks: 'id, source, createdAt',
      words: 'id, bookId, [bookId+normalizedTerm], order, frequency',
      progress: 'id, bookId, wordId, [bookId+wordId], lastViewedAt',
      sessions: 'id, bookId, mode, startedAt, endedAt, roundCompleted',
      meta: 'key'
    });
    this.version(2).stores({
      wordBooks: 'id, source, createdAt',
      words: 'id, bookId, [bookId+normalizedTerm], order, frequency',
      progress: 'id, bookId, wordId, [bookId+wordId], lastViewedAt',
      sessions: 'id, bookId, mode, startedAt, endedAt',
      meta: 'key'
    });
  }
}

export const db = new VocabDatabase();

export const defaultSettings: AppSettings = {
  theme: 'system',
  studyBackground: 'default',
  repetitiveLearning: true,
  autoPronounce: false,
  hidePhonetic: false,
  speechRate: 1,
  speechEngine: 'neural',
  neuralVoice: 'en-US-AriaNeural',
  nickname: 'Learner'
};

export const defaultPlan: StudyPlan = {
  bookId: BUILTIN_BOOK_ID,
  mode: 'browse',
  order: 'frequency',
  rangeStart: 1,
  rangeEnd: 500
};

export async function getSettings(): Promise<AppSettings> {
  const row = await db.meta.get(SETTINGS_KEY);
  return normalizeStoredSettings((row?.value as Partial<AppSettings>) ?? {});
}

export function normalizeStoredSettings(stored: Partial<AppSettings>): AppSettings {
  const storedSpeechRate = stored.speechRate === 0.9 ? 0.85 : stored.speechRate;
  const studyBackground = stored.studyBackground === 'default'
    || stored.studyBackground === 'eyeCare'
    || stored.studyBackground === 'warmPaper'
    || stored.studyBackground === 'coolGray'
    ? stored.studyBackground
    : defaultSettings.studyBackground;
  return {
    ...defaultSettings,
    ...stored,
    hidePhonetic: stored.hidePhonetic === true,
    studyBackground,
    speechEngine: stored.speechEngine === 'system' ? 'system' : 'neural',
    neuralVoice: typeof stored.neuralVoice === 'string' && stored.neuralVoice
      ? stored.neuralVoice
      : defaultSettings.neuralVoice,
    speechRate: typeof storedSpeechRate === 'number' && Number.isFinite(storedSpeechRate)
      ? Math.min(2, Math.max(0.5, storedSpeechRate))
      : defaultSettings.speechRate
  };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await db.meta.put({ key: SETTINGS_KEY, value: settings });
}

export function needsCompletedBrowseSessionRepair(session: StudySession): boolean {
  const rangeSize = session.rangeEnd - session.rangeStart + 1;
  return session.mode === 'browse'
    && !session.roundCompleted
    && Boolean(session.endedAt)
    && rangeSize > 0
    && session.viewed >= rangeSize;
}

export async function repairCompletedBrowseSessions(): Promise<number> {
  const sessions = await db.sessions.toArray();
  const repairs = sessions
    .filter(needsCompletedBrowseSessionRepair)
    .map((session) => ({ ...session, roundCompleted: true }));
  if (repairs.length) await db.sessions.bulkPut(repairs);
  return repairs.length;
}

export async function getStudyPlan(): Promise<StudyPlan> {
  const row = await db.meta.get(PLAN_KEY);
  return { ...defaultPlan, ...((row?.value as Partial<StudyPlan>) ?? {}) };
}

export async function saveStudyPlan(plan: StudyPlan): Promise<void> {
  await db.meta.put({ key: PLAN_KEY, value: plan });
}

export function progressId(bookId: string, wordId: string): string {
  return `${bookId}:${wordId}`;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function activityId(bookId: string, date: string): string {
  return `${ACTIVITY_KEY_PREFIX}${bookId}:${date}`;
}

async function incrementStudyActivity(bookId: string, date: string): Promise<void> {
  const key = activityId(bookId, date);
  const current = await db.meta.get(key);
  const stored = current?.value as Partial<StudyActivityRecord> | undefined;
  const count = typeof stored?.count === 'number' && Number.isFinite(stored.count) ? stored.count : 0;
  await db.meta.put({ key, value: { bookId, date, count: count + 1 } satisfies StudyActivityRecord });
}

export function isStudyActivityRecord(value: unknown): value is StudyActivityRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<StudyActivityRecord>;
  return typeof record.bookId === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(record.date ?? '')
    && typeof record.count === 'number'
    && Number.isFinite(record.count)
    && record.count > 0;
}

export async function getOrCreateProgress(bookId: string, wordId: string): Promise<WordProgress> {
  const id = progressId(bookId, wordId);
  return (
    (await db.progress.get(id)) ?? {
      id,
      bookId,
      wordId,
      viewedCount: 0,
      favorite: false,
      correctCount: 0,
      wrongCount: 0
    }
  );
}

export async function markWordViewed(word: Word): Promise<void> {
  const nowDate = new Date();
  const now = nowDate.toISOString();
  await db.transaction('rw', db.progress, db.meta, async () => {
    const current = await getOrCreateProgress(word.bookId, word.id);
    await db.progress.put({
      ...current,
      viewedCount: current.viewedCount + 1,
      firstViewedAt: current.firstViewedAt ?? now,
      lastViewedAt: now
    });
    await incrementStudyActivity(word.bookId, localDateKey(nowDate));
  });
}

export async function recordReview(word: Word, correct: boolean): Promise<void> {
  const nowDate = new Date();
  const now = nowDate.toISOString();
  await db.transaction('rw', db.progress, db.meta, async () => {
    const current = await getOrCreateProgress(word.bookId, word.id);
    await db.progress.put({
      ...current,
      viewedCount: current.viewedCount + 1,
      firstViewedAt: current.firstViewedAt ?? now,
      lastViewedAt: now,
      correctCount: current.correctCount + (correct ? 1 : 0),
      wrongCount: current.wrongCount + (correct ? 0 : 1)
    });
    await incrementStudyActivity(word.bookId, localDateKey(nowDate));
  });
}

export async function toggleFavorite(word: Word): Promise<boolean> {
  const current = await getOrCreateProgress(word.bookId, word.id);
  const favorite = !current.favorite;
  await db.progress.put({ ...current, favorite });
  return favorite;
}

export async function resetApplicationData(): Promise<void> {
  await db.transaction('rw', db.wordBooks, db.words, db.progress, db.sessions, db.meta, async () => {
    await Promise.all([
      db.wordBooks.clear(),
      db.words.clear(),
      db.progress.clear(),
      db.sessions.clear(),
      db.meta.clear()
    ]);
  });
}
