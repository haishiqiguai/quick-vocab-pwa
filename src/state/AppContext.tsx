import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings, getStudyPlan, saveSettings, saveStudyPlan } from '../lib/db';
import { ensureSeedData } from '../lib/seed';
import type { AppSettings, StudyPlan, WordBook } from '../types';

interface AppContextValue {
  loading: boolean;
  error?: string;
  books: WordBook[];
  activeBook?: WordBook;
  settings: AppSettings;
  plan: StudyPlan;
  updateSettings: (settings: AppSettings) => Promise<void>;
  updatePlan: (plan: StudyPlan) => Promise<void>;
  reload: () => Promise<void>;
}

const fallbackSettings: AppSettings = {
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

const fallbackPlan: StudyPlan = {
  bookId: 'builtin-gaokao',
  mode: 'browse',
  order: 'frequency',
  rangeStart: 1,
  rangeEnd: 500
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [settings, setSettings] = useState<AppSettings>(fallbackSettings);
  const [plan, setPlan] = useState<StudyPlan>(fallbackPlan);
  const initialized = useRef(false);
  const books = useLiveQuery(() => db.wordBooks.orderBy('createdAt').toArray(), [], []) ?? [];

  const reload = useCallback(async () => {
    if (!initialized.current) setLoading(true);
    setError(undefined);
    try {
      await ensureSeedData();
      const [nextSettings, nextPlan] = await Promise.all([getSettings(), getStudyPlan()]);
      setSettings(nextSettings);
      setPlan(nextPlan);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '初始化失败');
    } finally {
      initialized.current = true;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const root = document.documentElement;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = settings.theme === 'dark' || (settings.theme === 'system' && prefersDark);
    root.dataset.theme = dark ? 'dark' : 'light';
  }, [settings.theme]);

  const updateSettings = useCallback(async (next: AppSettings) => {
    setSettings(next);
    await saveSettings(next);
  }, []);

  const updatePlan = useCallback(async (next: StudyPlan) => {
    await saveStudyPlan(next);
    setPlan(next);
  }, []);

  const value = useMemo<AppContextValue>(() => ({
    loading,
    error,
    books,
    activeBook: books.find((book) => book.id === plan.bookId),
    settings,
    plan,
    updateSettings,
    updatePlan,
    reload
  }), [loading, error, books, settings, plan, updateSettings, updatePlan, reload]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
