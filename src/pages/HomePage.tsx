import { BookOpen, Heart, Search, Sparkles } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useNavigate } from '../lib/router';
import { Button, EmptyState } from '../components/ui';
import { db } from '../lib/db';
import { useApp } from '../state/AppContext';

export function HomePage() {
  const navigate = useNavigate();
  const { activeBook, plan, settings, updatePlan } = useApp();
  const [query, setQuery] = useState('');
  const progress = useLiveQuery(
    () => activeBook ? db.progress.where('bookId').equals(activeBook.id).toArray() : [],
    [activeBook?.id],
    []
  ) ?? [];
  const rounds = useLiveQuery(
    () => activeBook ? db.sessions.where('bookId').equals(activeBook.id).filter((session) => session.roundCompleted).count() : 0,
    [activeBook?.id],
    0
  ) ?? 0;
  const latestSession = useLiveQuery(async () => {
    if (!activeBook) return undefined;
    const sessions = await db.sessions.where('bookId').equals(activeBook.id).toArray();
    return sessions.sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0];
  }, [activeBook?.id]);
  const results = useLiveQuery(async () => {
    const term = query.trim().toLocaleLowerCase();
    if (!activeBook || term.length < 1) return [];
    const words = await db.words.where('bookId').equals(activeBook.id).toArray();
    return words.filter((word) => word.normalizedTerm.includes(term) || word.meaning.includes(query.trim())).slice(0, 8);
  }, [activeBook?.id, query], []) ?? [];

  const learned = useMemo(() => progress.filter((item) => item.viewedCount > 0).length, [progress]);
  const latestProgress = useMemo(() => progress
    .filter((item) => item.lastViewedAt)
    .sort((left, right) => String(right.lastViewedAt).localeCompare(String(left.lastViewedAt)))[0], [progress]);
  const resumeSession = latestSession && !latestSession.roundCompleted ? latestSession : undefined;
  const target = Math.max(0, plan.rangeEnd - plan.rangeStart + 1);

  async function start(mode: 'browse' | 'review') {
    await updatePlan({ ...plan, mode });
    navigate('/study');
  }

  async function resumeStudy() {
    if (!resumeSession) {
      navigate('/study');
      return;
    }
    await updatePlan({
      ...plan,
      bookId: resumeSession.bookId,
      mode: resumeSession.mode,
      order: resumeSession.order ?? plan.order,
      rangeStart: resumeSession.rangeStart,
      rangeEnd: resumeSession.rangeEnd
    });
    const params = new URLSearchParams({ resumeSession: resumeSession.id });
    if (!resumeSession.wordIds?.length && latestProgress) params.set('resumeWord', latestProgress.wordId);
    navigate(`/study?${params}`);
  }

  return (
    <div className="home-page page-content">
      <header className="home-topbar">
        <div className="profile-chip">
          {settings.avatar ? <img src={settings.avatar} alt="头像" /> : <span>{settings.nickname.slice(0, 1).toUpperCase()}</span>}
          <div><small>Welcome</small><strong>{settings.nickname}</strong></div>
        </div>
        <button className="icon-button" aria-label="搜索" onClick={() => document.getElementById('home-search')?.focus()}><Search /></button>
      </header>

      <button type="button" className="hero-stats" aria-label={resumeSession ? '继续上次学习进度' : '开始当前学习计划'} title={resumeSession ? '点击继续上次学习进度' : '点击开始学习'} onClick={() => void resumeStudy()}>
        <div><span>Target</span><strong>{target}</strong><small>当前目标</small></div>
        <div><span>Learned</span><strong>{learned}</strong><small>已学习</small></div>
        <div><span>Rounds</span><strong>{rounds}</strong><small>完成轮次</small></div>
        <em className="resume-hint">{resumeSession ? '继续上次进度 →' : '点击开始学习 →'}</em>
      </button>

      <section className="current-book-card">
        <div><small>Current vocabulary</small><h2>{activeBook?.name ?? '暂无词本'}</h2><p>{plan.rangeStart}–{plan.rangeEnd} · {plan.order === 'frequency' ? '词频顺序' : '随机顺序'}</p></div>
        <button onClick={() => navigate('/plan')}>修改计划</button>
      </section>

      <div className="study-actions">
        <Button onClick={() => void start('browse')}><BookOpen size={20} /><span><strong>开始浏览</strong><small>Target · 快速记忆核心释义</small></span></Button>
        <Button className="secondary" onClick={() => void start('review')}><Sparkles size={20} /><span><strong>快速复习</strong><small>Review · 错词自动重测</small></span></Button>
      </div>

      <section className="search-panel">
        <label htmlFor="home-search">搜索当前词本</label>
        <div className="search-input"><Search size={18} /><input id="home-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入单词或中文释义" /></div>
        {query && (
          <div className="search-results">
            {results.length ? results.map((word) => (
              <button key={word.id} onClick={() => navigate(`/words?q=${encodeURIComponent(word.term)}`)}>
                <span><strong>{word.term}</strong><small>{word.phonetic}</small></span><em>{word.meaning}</em>
              </button>
            )) : <EmptyState title="没有找到" detail="换一个关键词试试" />}
          </div>
        )}
      </section>

      <button className="favorite-shortcut" onClick={() => navigate('/favorites')}><Heart size={18} /> 生词本 <span>Vocabulary Builder</span></button>
    </div>
  );
}
