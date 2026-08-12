import { subDays } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { PageHeader } from '../components/ui';
import { db } from '../lib/db';
import { dayKey, formatDuration } from '../lib/format';
import { calculateStudyStats } from '../lib/stats';
import { useApp } from '../state/AppContext';

export function DashboardPage() {
  const { activeBook } = useApp();
  const activeProgress = useLiveQuery(() => activeBook ? db.progress.where('bookId').equals(activeBook.id).toArray() : [], [activeBook?.id], []) ?? [];
  const allProgress = useLiveQuery(() => db.progress.toArray(), [], []) ?? [];
  const sessions = useLiveQuery(() => db.sessions.toArray(), [], []) ?? [];
  const now = new Date();
  const stats = useMemo(
    () => calculateStudyStats(activeProgress, allProgress, sessions, now),
    [activeProgress, allProgress, sessions]
  );

  const activity = useMemo(() => {
    const counts = new Map<string, number>();
    allProgress.forEach((item) => {
      if (item.lastViewedAt) counts.set(dayKey(item.lastViewedAt), (counts.get(dayKey(item.lastViewedAt)) ?? 0) + 1);
    });
    return Array.from({ length: 28 }, (_, index) => {
      const date = subDays(now, 27 - index);
      return { date, count: counts.get(dayKey(date)) ?? 0 };
    });
  }, [allProgress]);

  const totalAnswers = stats.correct + stats.wrong;
  const accuracy = totalAnswers ? Math.round((stats.correct / totalAnswers) * 100) : 0;
  const completion = activeBook?.wordCount ? Math.round((stats.learned / activeBook.wordCount) * 100) : 0;
  const remaining = Math.max(0, (activeBook?.wordCount ?? 0) - stats.learned);
  const activeDays = activity.filter(({ count }) => count > 0).length;

  return (
    <div className="page-content dashboard-page">
      <PageHeader title="学习数据" subtitle="Dashboard" />
      <section className="dashboard-overview">
        <div className="overview-top">
          <div>
            <small>Current vocabulary</small>
            <h1>{activeBook?.name ?? '暂无词本'}</h1>
          </div>
          <strong>{completion}<span>%</span></strong>
        </div>
        <div className="overview-progress" aria-label={`当前词本已完成 ${completion}%`}>
          <i style={{ width: `${completion}%` }} />
        </div>
        <div className="overview-foot">
          <span><b>{stats.learned}</b> 已学习</span>
          <span><b>{remaining}</b> 待学习</span>
          <span><b>{activeBook?.wordCount ?? 0}</b> 总词数</span>
        </div>
      </section>
      <section className="dashboard-summary-grid">
        <article className="summary-card">
          <header><span>今天</span><small>Today</small></header>
          <div className="summary-values">
            <div><strong>{stats.todayLearned}</strong><span>个单词</span></div>
            <div><strong>{formatDuration(stats.todayTime)}</strong><span>学习时长</span></div>
          </div>
        </article>
        <article className="summary-card">
          <header><span>累计</span><small>All time</small></header>
          <div className="summary-values">
            <div><strong>{stats.cumulativeLearned}</strong><span>个单词</span></div>
            <div><strong>{formatDuration(stats.totalTime)}</strong><span>学习时长</span></div>
          </div>
        </article>
        <article className="summary-card accuracy-card">
          <header><span>答题表现</span><small>Review</small></header>
          <div className="accuracy-value"><strong>{accuracy}<span>%</span></strong><em>{totalAnswers ? '当前正确率' : '还没有答题记录'}</em></div>
          <p>{stats.correct} 对 · {stats.wrong} 错 · 共 {totalAnswers} 次</p>
        </article>
      </section>
      <section className="calendar-card dashboard-calendar">
        <div className="calendar-copy">
          <small>最近 28 天 · Activity</small>
          <h2>学习节奏</h2>
          <p>有学习记录的天数</p>
          <strong>{activeDays}<span> / 28 天</span></strong>
          <div className="activity-legend"><span>少</span><i /><i className="level-1" /><i className="level-2" /><i className="level-3" /><i className="level-4" /><span>多</span></div>
        </div>
        <div className="activity-grid">
          {activity.map(({ date, count }) => (
            <div key={dayKey(date)} className={`activity-cell level-${Math.min(4, Math.ceil(count / 10))}`} title={`${dayKey(date)}：${count} 个`}>
              <span>{date.getDate()}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
