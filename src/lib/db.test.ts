import { describe, expect, it } from 'vitest';
import { needsCompletedBrowseSessionRepair, normalizeStoredSettings } from './db';
import type { StudySession } from '../types';

function session(overrides: Partial<StudySession> = {}): StudySession {
  return {
    id: 'session',
    bookId: 'book',
    mode: 'browse',
    rangeStart: 1,
    rangeEnd: 357,
    startedAt: '2026-08-03T00:00:00.000Z',
    endedAt: '2026-08-03T01:00:00.000Z',
    viewed: 357,
    correct: 0,
    wrong: 0,
    roundCompleted: false,
    ...overrides
  };
}

describe('legacy browse round repair', () => {
  it('repairs a finished browse range that missed its completion flag', () => {
    expect(needsCompletedBrowseSessionRepair(session())).toBe(true);
  });

  it('does not repair partial browse sessions or review sessions', () => {
    expect(needsCompletedBrowseSessionRepair(session({ viewed: 356 }))).toBe(false);
    expect(needsCompletedBrowseSessionRepair(session({ mode: 'review' }))).toBe(false);
  });
});

describe('study background settings migration', () => {
  it('uses the default background for old or invalid settings', () => {
    expect(normalizeStoredSettings({}).studyBackground).toBe('default');
    expect(normalizeStoredSettings({ studyBackground: 'invalid' as never }).studyBackground).toBe('default');
  });

  it.each(['default', 'eyeCare', 'warmPaper', 'coolGray'] as const)('restores %s', (studyBackground) => {
    expect(normalizeStoredSettings({ studyBackground }).studyBackground).toBe(studyBackground);
  });
});
