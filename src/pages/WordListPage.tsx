import { Heart, Search, Volume2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useSearchParams } from '../lib/router';
import { Button, EmptyState, PageHeader } from '../components/ui';
import { db, toggleFavorite } from '../lib/db';
import { speakWord, speechOptionsFromSettings } from '../lib/speech';
import { useApp } from '../state/AppContext';

type Filter = 'all' | 'unlearned' | 'learned';

export function WordListPage() {
  const { activeBook, settings } = useApp();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(100);
  const words = useLiveQuery(() => activeBook ? db.words.where('bookId').equals(activeBook.id).sortBy('order') : [], [activeBook?.id], []) ?? [];
  const progress = useLiveQuery(() => activeBook ? db.progress.where('bookId').equals(activeBook.id).toArray() : [], [activeBook?.id], []) ?? [];
  const progressMap = useMemo(() => new Map(progress.map((item) => [item.wordId, item])), [progress]);
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return words.filter((word) => {
      const learned = (progressMap.get(word.id)?.viewedCount ?? 0) > 0;
      const matchesFilter = filter === 'all' || (filter === 'learned' ? learned : !learned);
      return matchesFilter && (!term || word.normalizedTerm.includes(term) || word.meaning.includes(query.trim()));
    });
  }, [words, progressMap, query, filter]);

  return (
    <div className="standalone-page list-page">
      <PageHeader title="单词列表" subtitle="Vocabulary List" back />
      <div className="page-content-narrow">
        <div className="search-input"><Search size={18} /><input value={query} onChange={(event) => { setQuery(event.target.value); setLimit(100); }} placeholder="搜索单词或释义" /></div>
        <div className="segmented-control"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>全部 <span>{words.length}</span></button><button className={filter === 'unlearned' ? 'active' : ''} onClick={() => setFilter('unlearned')}>未学习</button><button className={filter === 'learned' ? 'active' : ''} onClick={() => setFilter('learned')}>已学习</button></div>
        <div className="word-list">
          {filtered.slice(0, limit).map((word) => {
            const item = progressMap.get(word.id);
            return <article key={word.id} className={item?.viewedCount ? 'learned' : ''}><div className="word-order">{word.order}</div><div className="word-main"><h3>{word.term}<button onClick={() => void speakWord(word.term, speechOptionsFromSettings(settings))} aria-label={`朗读 ${word.term}`}><Volume2 size={16} /></button></h3><small>{word.phonetic}</small><p>{word.meaning}</p></div><button className={`heart-button ${item?.favorite ? 'active' : ''}`} onClick={() => void toggleFavorite(word)} aria-label="收藏"><Heart size={20} fill={item?.favorite ? 'currentColor' : 'none'} /></button></article>;
          })}
        </div>
        {!filtered.length && <EmptyState title="没有单词" detail="调整筛选条件或导入新的单词本" />}
        {filtered.length > limit && <Button className="secondary load-more" onClick={() => setLimit((current) => current + 100)}>再显示 100 个</Button>}
      </div>
    </div>
  );
}
