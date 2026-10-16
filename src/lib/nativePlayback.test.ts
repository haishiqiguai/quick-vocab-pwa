import { describe, expect, it } from 'vitest';
import type { AppSettings, Word } from '../types';
import { buildNativePlaybackStart, completedStudyIndexes, isNativePlaybackStatusForSession, reconcileNativePlaybackStatus, shouldUseNativeAutoPlayback } from './nativePlayback';

const settings: AppSettings = {
  theme: 'system',
  studyBackground: 'default',
  repetitiveLearning: false,
  autoPronounce: true,
  autoPlayEnabled: true,
  autoPlayInterval: 2,
  autoPlayRepeatCount: 3,
  autoPlayWord: true,
  autoPlayMeaning: true,
  hidePhonetic: false,
  speechRate: 1.15,
  speechEngine: 'neural',
  neuralVoice: 'en-US-AriaNeural',
  nickname: '学习者'
};

const words: Word[] = [
  { id: 'word-0', bookId: 'book', order: 0, term: 'active', normalizedTerm: 'active', meaning: 'adj. 活跃的', variants: [], tags: [] },
  { id: 'word-1', bookId: 'book', order: 1, term: 'imported', normalizedTerm: 'imported', meaning: 'adj. 导入的', variants: [], tags: [] }
];

describe('native playback queue contract', () => {
  it('builds the remaining queue with absolute indexes and optional bundled assets', async () => {
    const request = await buildNativePlaybackStart({
      sessionId: 'session-1',
      words,
      startIndex: 1,
      settings,
      resolveEnglishAsset: async (term) => term === 'active' ? '/audio/en.mp3' : undefined,
      resolveMeaningAsset: async (wordId) => wordId === 'word-0' ? '/audio/zh.mp3' : undefined
    });

    expect(request).toEqual({
      sessionId: 'session-1',
      startIndex: 1,
      repeatCount: 3,
      intervalMs: 2000,
      rate: 1.15,
      playWord: true,
      playMeaning: true,
      items: [{
        wordId: 'word-1',
        studyIndex: 1,
        term: 'imported',
        meaning: '形容词， 导入的'
      }]
    });
  });

  it('keeps bundled paths when the remaining words have packaged audio', async () => {
    const request = await buildNativePlaybackStart({
      sessionId: 'session-2',
      words,
      startIndex: 0,
      settings,
      resolveEnglishAsset: async (term) => term === 'active' ? '/audio/en.mp3' : undefined,
      resolveMeaningAsset: async (wordId) => wordId === 'word-0' ? '/audio/zh.mp3' : undefined
    });

    expect(request.items[0]).toMatchObject({
      wordId: 'word-0',
      studyIndex: 0,
      englishAssetPath: '/audio/en.mp3',
      meaningAssetPath: '/audio/zh.mp3'
    });
  });

  it('omits bundled assets when the user explicitly selects Android system speech', async () => {
    const request = await buildNativePlaybackStart({
      sessionId: 'session-system',
      words,
      startIndex: 0,
      settings: { ...settings, speechEngine: 'system' },
      resolveEnglishAsset: async () => '/audio/en.mp3',
      resolveMeaningAsset: async () => '/audio/zh.mp3'
    });

    expect(request.items[0]).not.toHaveProperty('englishAssetPath');
    expect(request.items[0]).not.toHaveProperty('meaningAssetPath');
  });
});

describe('native playback progress reconciliation', () => {
  it('returns each newly completed absolute index exactly once', () => {
    expect(completedStudyIndexes(2, 5, 8)).toEqual([2, 3, 4]);
    expect(completedStudyIndexes(5, 5, 8)).toEqual([]);
    expect(completedStudyIndexes(6, 5, 8)).toEqual([]);
  });

  it('clamps malformed native status to the study range', () => {
    expect(completedStudyIndexes(-3, 99, 3)).toEqual([0, 1, 2]);
  });

  it('maps a background status to new progress, current word and controls', () => {
    expect(reconcileNativePlaybackStatus(2, {
      sessionId: 'native-1',
      state: 'playing',
      currentIndex: 5,
      completedThroughIndex: 5,
      currentWordId: 'word-5'
    }, 8)).toEqual({
      completedIndexes: [2, 3, 4],
      acknowledgedThroughIndex: 5,
      currentIndex: 5,
      autoPlaybackState: 'playing'
    });
  });

  it('does not advance or remain playing after a duplicate failure event', () => {
    expect(reconcileNativePlaybackStatus(3, {
      sessionId: 'native-1',
      state: 'failed',
      currentIndex: 3,
      completedThroughIndex: 3,
      failureReason: '语音不可用'
    }, 8)).toEqual({
      completedIndexes: [],
      acknowledgedThroughIndex: 3,
      currentIndex: 3,
      autoPlaybackState: 'idle',
      failureReason: '语音不可用'
    });
  });

  it('accepts status only from the active native session', () => {
    expect(isNativePlaybackStatusForSession('native-1', { sessionId: 'native-1', state: 'playing', currentIndex: 0, completedThroughIndex: 0 })).toBe(true);
    expect(isNativePlaybackStatusForSession('native-1', { sessionId: 'old', state: 'completed', currentIndex: 9, completedThroughIndex: 10 })).toBe(false);
  });
});

describe('native playback routing', () => {
  it('uses the native queue only for Android browse sessions', () => {
    expect(shouldUseNativeAutoPlayback(true, 'browse')).toBe(true);
    expect(shouldUseNativeAutoPlayback(false, 'browse')).toBe(false);
    expect(shouldUseNativeAutoPlayback(true, 'review')).toBe(false);
  });
});
