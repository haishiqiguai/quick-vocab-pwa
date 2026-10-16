import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, getStudyPlan, saveStudyPlan } from '../lib/db';
import { RouterProvider } from '../lib/router';
import type { StudyPlan, WordBook } from '../types';
import { PlanPage } from './PlanPage';

const books: WordBook[] = [
  { id: 'small', name: '357词本', wordCount: 357, source: 'imported', createdAt: '2026-10-09' },
  { id: 'large', name: '896词本', wordCount: 896, source: 'imported', createdAt: '2026-10-09' }
];
const initialPlan: StudyPlan = { bookId: 'small', mode: 'browse', order: 'frequency', rangeStart: 1, rangeEnd: 357 };

// Keep the actual page, live IndexedDB queries and plan persistence; only skip seed loading.
vi.mock('../state/AppContext', () => ({
  useApp: () => ({ books, plan: initialPlan, updatePlan: saveStudyPlan })
}));

async function openPlan() {
  const user = userEvent.setup();
  render(<RouterProvider><PlanPage /></RouterProvider>);
  await screen.findByRole('button', { name: '1–357' });
  return user;
}

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  await db.words.clear();
  await db.meta.clear();
  await db.words.bulkPut(books.flatMap((book) => Array.from({ length: book.wordCount }, (_, index) => ({
    id: `${book.id}-${index}`, bookId: book.id, order: index + 1,
    term: `word${index}`, normalizedTerm: `word${index}`, meaning: '词义', variants: [], tags: []
  }))));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('learning range editing', () => {
  it('does not clamp a new book using the previous book count', async () => {
    const user = await openPlan();
    await user.click(screen.getByRole('button', { name: /896词本/ }));
    await screen.findByRole('button', { name: '501–896' });
    expect(screen.getByLabelText('起始')).toHaveValue(1);
    expect(screen.getByLabelText('结束')).toHaveValue(500);
    await user.click(screen.getByRole('button', { name: '501–896' }));
    await user.click(screen.getByRole('button', { name: /357词本/ }));
    await screen.findByRole('button', { name: '1–357' });
    expect(screen.getByLabelText('起始')).toHaveValue(1);
    expect(screen.getByLabelText('结束')).toHaveValue(357);
  });

  it('allows clearing and typing the end without inserting zero or clamping mid-entry', async () => {
    const user = await openPlan();
    const end = screen.getByLabelText('结束');
    await user.clear(end);
    expect(end).toHaveValue(null);
    await user.type(end, '896');
    expect(end).toHaveValue(896);
    await user.tab();
    expect(end).toHaveValue(357);
  });

  it('allows clearing and replacing the start', async () => {
    const user = await openPlan();
    const start = screen.getByLabelText('起始');
    await user.clear(start);
    expect(start).toHaveValue(null);
    await user.type(start, '100');
    await user.click(screen.getByRole('button', { name: '保存计划' }));
    await waitFor(async () => expect(await getStudyPlan()).toMatchObject({ rangeStart: 100, rangeEnd: 357 }));
  });

  it('bounds both saved endpoints when the start exceeds the book size', async () => {
    const user = await openPlan();
    await user.clear(screen.getByLabelText('起始'));
    await user.type(screen.getByLabelText('起始'), '900');
    await user.click(screen.getByRole('button', { name: '保存计划' }));
    await waitFor(async () => expect(await getStudyPlan()).toMatchObject({ rangeStart: 357, rangeEnd: 357 }));
  });

  it('keeps an edited range when clicking the already selected book', async () => {
    const user = await openPlan();
    await user.clear(screen.getByLabelText('结束'));
    await user.type(screen.getByLabelText('结束'), '200');
    await user.click(screen.getByRole('button', { name: /357词本/ }));
    expect(screen.getByLabelText('结束')).toHaveValue(200);
  });

  it('restores an empty endpoint on blur without saving a zero', async () => {
    const user = await openPlan();
    await user.clear(screen.getByLabelText('结束'));
    await user.click(screen.getByRole('button', { name: '保存计划' }));
    await waitFor(async () => expect(await getStudyPlan()).toMatchObject({ rangeStart: 1, rangeEnd: 357 }));
  });

  it('saves integer endpoints in ascending order', async () => {
    const user = await openPlan();
    await user.clear(screen.getByLabelText('起始'));
    await user.type(screen.getByLabelText('起始'), '100.5');
    await user.clear(screen.getByLabelText('结束'));
    await user.type(screen.getByLabelText('结束'), '50');
    await user.click(screen.getByRole('button', { name: '保存计划' }));
    await waitFor(async () => expect(await getStudyPlan()).toMatchObject({ rangeStart: 100, rangeEnd: 100 }));
  });
});
