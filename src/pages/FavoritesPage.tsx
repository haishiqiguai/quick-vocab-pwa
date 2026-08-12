import { Heart, Volume2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { EmptyState, PageHeader } from '../components/ui';
import { db, toggleFavorite } from '../lib/db';
import { speakWord, speechOptionsFromSettings } from '../lib/speech';
import { useApp } from '../state/AppContext';
import type { Word } from '../types';

export function FavoritesPage() {
  const { settings } = useApp();
  const progress = useLiveQuery(async () => (await db.progress.toArray()).filter((item) => item.favorite), [], []) ?? [];
  const ids = useMemo(() => progress.map((item) => item.wordId), [progress]);
  const available = useLiveQuery(async (): Promise<Word[]> => {
    if (!ids.length) return [];
    const rows = await db.words.bulkGet(ids);
    return rows.flatMap((word) => word ? [word] : []);
  }, [ids.join('|')], []) ?? [];
  return (
    <div className="standalone-page list-page">
      <PageHeader title="生词本" subtitle="Vocabulary Builder" back />
      <div className="page-content-narrow">
        <p className="page-intro">在 Target 学习页点击爱心收藏的单词会出现在这里。</p>
        <div className="word-list favorite-list">
          {available.map((word) => <article key={word.id}><div className="word-main"><h3>{word.term}<button onClick={() => void speakWord(word.term, speechOptionsFromSettings(settings))} aria-label="朗读"><Volume2 size={16} /></button></h3><small>{word.phonetic}</small><p>{word.meaning}</p>{word.variants.length > 0 && <em>{word.variants.join(' · ')}</em>}</div><button className="heart-button active" onClick={() => void toggleFavorite(word)} aria-label="取消收藏"><Heart size={20} fill="currentColor" /></button></article>)}
        </div>
        {!available.length && <EmptyState title="生词本还是空的" detail="遇到特别陌生的单词时，点击爱心单独强化" />}
      </div>
    </div>
  );
}
