import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '../lib/router';
import { Button, PageHeader } from '../components/ui';
import { db } from '../lib/db';
import { rangePresets } from '../lib/study';
import { useApp } from '../state/AppContext';
import type { StudyPlan } from '../types';

export function PlanPage() {
  const navigate = useNavigate();
  const { books, plan, updatePlan } = useApp();
  const [draft, setDraft] = useState<StudyPlan>(plan);
  const selectedBook = books.find((book) => book.id === draft.bookId) ?? books[0];
  const wordCount = useLiveQuery(() => selectedBook ? db.words.where('bookId').equals(selectedBook.id).count() : 0, [selectedBook?.id], 0) ?? 0;
  const presets = useMemo(() => rangePresets(wordCount), [wordCount]);

  useEffect(() => {
    if (selectedBook && draft.rangeEnd > wordCount && wordCount > 0) setDraft((current) => ({ ...current, rangeEnd: wordCount }));
  }, [draft.rangeEnd, selectedBook, wordCount]);

  function selectBook(bookId: string) {
    const book = books.find((item) => item.id === bookId);
    setDraft((current) => ({ ...current, bookId, rangeStart: 1, rangeEnd: Math.min(500, book?.wordCount ?? 500) }));
  }

  async function save(start = false) {
    const valid = {
      ...draft,
      rangeStart: Math.max(1, Math.min(draft.rangeStart, wordCount || 1)),
      rangeEnd: Math.max(draft.rangeStart, Math.min(draft.rangeEnd, wordCount || 1))
    };
    await updatePlan(valid);
    navigate(start ? '/study' : '/');
  }

  return (
    <div className="standalone-page plan-page">
      <PageHeader title="学习计划" subtitle="Study Plan" back />
      <div className="plan-form page-content-narrow">
        <fieldset><legend>学习模式 <small>Learning Mode</small></legend><div className="option-grid two"><button className={draft.mode === 'browse' ? 'selected' : ''} onClick={() => setDraft({ ...draft, mode: 'browse' })}><strong>浏览模式</strong><small>Browse Mode</small></button><button className={draft.mode === 'review' ? 'selected' : ''} onClick={() => setDraft({ ...draft, mode: 'review' })}><strong>测验模式</strong><small>Review Mode</small></button></div></fieldset>
        <fieldset><legend>单词顺序 <small>Words Order</small></legend><div className="option-grid two"><button className={draft.order === 'frequency' ? 'selected' : ''} onClick={() => setDraft({ ...draft, order: 'frequency' })}><strong>词频顺序</strong><small>Test Frequency</small></button><button className={draft.order === 'random' ? 'selected' : ''} onClick={() => setDraft({ ...draft, order: 'random' })}><strong>随机顺序</strong><small>Random</small></button></div></fieldset>
        <fieldset><legend>学习词本 <small>Vocabulary</small></legend><div className="book-options">{books.map((book) => <button key={book.id} className={book.id === draft.bookId ? 'selected' : ''} onClick={() => selectBook(book.id)}><span><strong>{book.name}</strong><small>{book.description}</small></span><em>{book.wordCount}</em></button>)}</div></fieldset>
        <fieldset><legend>学习范围 <small>Learning Range</small></legend><div className="range-presets">{presets.map(([start, end]) => <button key={start} className={draft.rangeStart === start && draft.rangeEnd === end ? 'selected' : ''} onClick={() => setDraft({ ...draft, rangeStart: start, rangeEnd: end })}>{start}–{end}</button>)}</div><div className="custom-range"><label>起始<input type="number" min={1} max={wordCount} value={draft.rangeStart} onChange={(event) => setDraft({ ...draft, rangeStart: Number(event.target.value) })} /></label><span>—</span><label>结束<input type="number" min={1} max={wordCount} value={draft.rangeEnd} onChange={(event) => setDraft({ ...draft, rangeEnd: Number(event.target.value) })} /></label></div></fieldset>
        <div className="sticky-actions"><Button className="secondary" onClick={() => void save(false)}>保存计划</Button><Button onClick={() => void save(true)}>保存并开始</Button></div>
      </div>
    </div>
  );
}
