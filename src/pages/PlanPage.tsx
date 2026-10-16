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
  const [rangeInput, setRangeInput] = useState({ rangeStart: String(plan.rangeStart), rangeEnd: String(plan.rangeEnd) });
  const selectedBook = books.find((book) => book.id === draft.bookId) ?? books[0];
  // Live queries retain their previous result while the next book is loading.
  const countedBook = useLiveQuery(async () => selectedBook ? {
    bookId: selectedBook.id,
    count: await db.words.where('bookId').equals(selectedBook.id).count()
  } : undefined, [selectedBook?.id]);
  const wordCount = countedBook?.bookId === selectedBook?.id ? countedBook?.count ?? 0 : selectedBook?.wordCount ?? 0;
  const presets = useMemo(() => rangePresets(wordCount), [wordCount]);

  useEffect(() => {
    if (wordCount <= 0) return;
    for (const field of ['rangeStart', 'rangeEnd'] as const) {
      const value = Math.max(1, Math.min(draft[field], wordCount));
      if (value !== draft[field]) {
        setDraft((current) => ({ ...current, [field]: value }));
        setRangeInput((current) => ({ ...current, [field]: String(value) }));
      }
    }
  }, [draft.rangeStart, draft.rangeEnd, wordCount]);

  function selectRange(rangeStart: number, rangeEnd: number) {
    setDraft((current) => ({ ...current, rangeStart, rangeEnd }));
    setRangeInput({ rangeStart: String(rangeStart), rangeEnd: String(rangeEnd) });
  }

  function boundedIndex(value: string, fallback: number) {
    const number = value.trim() === '' ? fallback : Number(value);
    return Math.max(1, Math.min(Math.trunc(Number.isFinite(number) ? number : fallback), wordCount || 1));
  }

  function finishEditing(field: 'rangeStart' | 'rangeEnd') {
    const value = boundedIndex(rangeInput[field], draft[field]);
    setRangeInput((current) => ({ ...current, [field]: String(value) }));
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function selectBook(bookId: string) {
    const book = books.find((item) => item.id === bookId);
    if (bookId === draft.bookId) return;
    const rangeEnd = Math.min(500, book?.wordCount || 1);
    setDraft((current) => ({ ...current, bookId, rangeStart: 1, rangeEnd }));
    setRangeInput({ rangeStart: '1', rangeEnd: String(rangeEnd) });
  }

  async function save(start = false) {
    if (wordCount <= 0) return;
    const rangeStart = boundedIndex(rangeInput.rangeStart, draft.rangeStart);
    const valid = {
      ...draft,
      rangeStart,
      rangeEnd: Math.max(rangeStart, boundedIndex(rangeInput.rangeEnd, draft.rangeEnd))
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
        <fieldset><legend>学习范围 <small>Learning Range</small></legend><div className="range-presets">{presets.map(([start, end]) => <button key={start} className={Number(rangeInput.rangeStart) === start && Number(rangeInput.rangeEnd) === end ? 'selected' : ''} onClick={() => selectRange(start, end)}>{start}–{end}</button>)}</div><div className="custom-range"><label>起始<input type="number" inputMode="numeric" min={1} max={wordCount} step={1} value={rangeInput.rangeStart} onChange={(event) => setRangeInput({ ...rangeInput, rangeStart: event.target.value })} onBlur={() => finishEditing('rangeStart')} /></label><span>—</span><label>结束<input type="number" inputMode="numeric" min={1} max={wordCount} step={1} value={rangeInput.rangeEnd} onChange={(event) => setRangeInput({ ...rangeInput, rangeEnd: event.target.value })} onBlur={() => finishEditing('rangeEnd')} /></label></div></fieldset>
        <div className="sticky-actions"><Button className="secondary" disabled={wordCount <= 0} onClick={() => void save(false)}>保存计划</Button><Button disabled={wordCount <= 0} onClick={() => void save(true)}>保存并开始</Button></div>
      </div>
    </div>
  );
}
