export type LearningMode = 'browse' | 'review';
export type WordOrder = 'frequency' | 'random';
export type ThemeMode = 'system' | 'dark' | 'light';
export type StudyBackgroundMode = 'default' | 'eyeCare' | 'warmPaper' | 'coolGray';
export type SpeechEngine = 'neural' | 'system';

export interface WordBook {
  id: string;
  name: string;
  source: 'builtin' | 'imported';
  wordCount: number;
  createdAt: string;
  license?: string;
  description?: string;
}

export interface Word {
  id: string;
  bookId: string;
  order: number;
  term: string;
  normalizedTerm: string;
  meaning: string;
  phonetic?: string;
  variants: string[];
  frequency?: number;
  tags: string[];
}

export interface WordProgress {
  id: string;
  bookId: string;
  wordId: string;
  viewedCount: number;
  firstViewedAt?: string;
  lastViewedAt?: string;
  favorite: boolean;
  correctCount: number;
  wrongCount: number;
}

export interface StudyPlan {
  bookId: string;
  mode: LearningMode;
  order: WordOrder;
  rangeStart: number;
  rangeEnd: number;
}

export interface StudySession {
  id: string;
  bookId: string;
  mode: LearningMode;
  rangeStart: number;
  rangeEnd: number;
  startedAt: string;
  endedAt?: string;
  viewed: number;
  correct: number;
  wrong: number;
  roundCompleted: boolean;
  order?: WordOrder;
  wordIds?: string[];
  resumeIndex?: number;
  reviewQueue?: string[];
}

export interface AppSettings {
  theme: ThemeMode;
  studyBackground: StudyBackgroundMode;
  repetitiveLearning: boolean;
  autoPronounce: boolean;
  hidePhonetic: boolean;
  speechRate: number;
  speechEngine: SpeechEngine;
  neuralVoice: string;
  speechVoice?: string;
  nickname: string;
  avatar?: string;
}

export interface MetaRecord<T = unknown> {
  key: string;
  value: T;
}

export interface StudyActivityRecord {
  bookId: string;
  date: string;
  count: number;
}

export interface SeedWord {
  term: string;
  meaning: string;
  phonetic?: string;
  variants?: string[];
  frequency?: number;
  tags?: string[];
}

export interface ColumnMapping {
  word: number;
  meaning: number;
  phonetic: number;
  variants: number;
  frequency: number;
  tags: number;
}

export type ImportRow = Array<string | number | boolean | null | Date>;

export interface ParsedImport {
  rows: ImportRow[];
  headers: string[];
  hasHeader: boolean;
  mapping: ColumnMapping;
}

export interface ImportResult {
  imported: number;
  duplicates: number;
  invalid: number;
  bookId: string;
}

export interface BackupPayload {
  version: 1;
  exportedAt: string;
  wordBooks: WordBook[];
  words: Word[];
  progress: WordProgress[];
  sessions: StudySession[];
  meta: MetaRecord[];
}
