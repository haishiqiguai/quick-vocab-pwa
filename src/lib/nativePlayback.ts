import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { AppSettings, Word } from '../types';
import { getBundledMeaningSpeechUrl } from './bundledMeaningSpeech';
import { getBundledSpeechUrl } from './bundledSpeech';
import { formatMeaningForSpeech, normalizeSpeechRate } from './speech';

export type NativePlaybackState = 'idle' | 'preparing' | 'playing' | 'paused' | 'completed' | 'failed';

export interface NativePlaybackItem {
  wordId: string;
  studyIndex: number;
  term: string;
  meaning: string;
  englishAssetPath?: string;
  meaningAssetPath?: string;
}

export interface NativePlaybackStartOptions {
  sessionId: string;
  startIndex: number;
  repeatCount: number;
  intervalMs: number;
  rate: number;
  playWord: boolean;
  playMeaning: boolean;
  items: NativePlaybackItem[];
}

export interface NativePlaybackStatus {
  sessionId?: string;
  state: NativePlaybackState;
  currentIndex: number;
  completedThroughIndex: number;
  currentWordId?: string;
  failureReason?: string;
}

export interface NativePlaybackReconciliation {
  completedIndexes: number[];
  acknowledgedThroughIndex: number;
  currentIndex: number;
  autoPlaybackState: 'idle' | 'playing' | 'paused';
  failureReason?: string;
}

interface NativePlaybackPluginContract {
  start(options: NativePlaybackStartOptions): Promise<NativePlaybackStatus>;
  pause(options: { sessionId: string }): Promise<NativePlaybackStatus>;
  resume(options: { sessionId: string }): Promise<NativePlaybackStatus>;
  stop(options: { sessionId: string }): Promise<NativePlaybackStatus>;
  getStatus(): Promise<NativePlaybackStatus>;
  addListener(eventName: 'playbackStatus', listener: (status: NativePlaybackStatus) => void): Promise<PluginListenerHandle>;
}

export const NativePlayback = registerPlugin<NativePlaybackPluginContract>('NativePlayback');

export function shouldUseNativeAutoPlayback(nativeAndroid: boolean, mode: 'browse' | 'review'): boolean {
  return nativeAndroid && mode === 'browse';
}

interface BuildNativePlaybackStartOptions {
  sessionId: string;
  words: Word[];
  startIndex: number;
  settings: AppSettings;
  resolveEnglishAsset?: (term: string) => Promise<string | undefined>;
  resolveMeaningAsset?: (wordId: string) => Promise<string | undefined>;
}

export async function buildNativePlaybackStart({
  sessionId,
  words,
  startIndex,
  settings,
  resolveEnglishAsset = (term) => getBundledSpeechUrl(term, settings.neuralVoice, 1),
  resolveMeaningAsset = getBundledMeaningSpeechUrl
}: BuildNativePlaybackStartOptions): Promise<NativePlaybackStartOptions> {
  const safeStartIndex = Math.min(Math.max(0, Math.trunc(startIndex)), words.length);
  const useBundledAudio = settings.speechEngine === 'neural' && settings.neuralVoice === 'en-US-AriaNeural';
  const items = await Promise.all(words.slice(safeStartIndex).map(async (word, offset) => {
    const [englishAssetPath, meaningAssetPath] = await Promise.all([
      useBundledAudio && settings.autoPlayWord ? resolveEnglishAsset(word.term) : undefined,
      useBundledAudio && settings.autoPlayMeaning ? resolveMeaningAsset(word.id) : undefined
    ]);
    return {
      wordId: word.id,
      studyIndex: safeStartIndex + offset,
      term: word.term,
      meaning: formatMeaningForSpeech(word.meaning),
      ...(englishAssetPath ? { englishAssetPath } : {}),
      ...(meaningAssetPath ? { meaningAssetPath } : {})
    };
  }));

  return {
    sessionId,
    startIndex: safeStartIndex,
    repeatCount: Math.min(10, Math.max(1, Math.trunc(settings.autoPlayRepeatCount))),
    intervalMs: Math.min(60_000, Math.max(0, Math.trunc(settings.autoPlayInterval * 1000))),
    rate: normalizeSpeechRate(settings.speechRate),
    playWord: settings.autoPlayWord,
    playMeaning: settings.autoPlayMeaning,
    items
  };
}

export function completedStudyIndexes(
  acknowledgedThroughIndex: number,
  completedThroughIndex: number,
  studyLength: number
): number[] {
  const start = Math.min(studyLength, Math.max(0, Math.trunc(acknowledgedThroughIndex)));
  const end = Math.min(studyLength, Math.max(start, Math.trunc(completedThroughIndex)));
  return Array.from({ length: end - start }, (_, offset) => start + offset);
}

export function isNativePlaybackStatusForSession(sessionId: string | undefined, status: NativePlaybackStatus): boolean {
  return Boolean(sessionId && status.sessionId === sessionId);
}

export function reconcileNativePlaybackStatus(
  acknowledgedThroughIndex: number,
  status: NativePlaybackStatus,
  studyLength: number
): NativePlaybackReconciliation {
  const completedIndexes = completedStudyIndexes(acknowledgedThroughIndex, status.completedThroughIndex, studyLength);
  const acknowledged = completedIndexes.length
    ? completedIndexes[completedIndexes.length - 1] + 1
    : Math.min(studyLength, Math.max(0, Math.trunc(acknowledgedThroughIndex)));
  const currentIndex = studyLength > 0
    ? Math.min(studyLength - 1, Math.max(0, Math.trunc(status.currentIndex)))
    : 0;
  const autoPlaybackState = status.state === 'playing' || status.state === 'preparing'
    ? 'playing'
    : status.state === 'paused' ? 'paused' : 'idle';
  return {
    completedIndexes,
    acknowledgedThroughIndex: acknowledged,
    currentIndex,
    autoPlaybackState,
    ...(status.failureReason ? { failureReason: status.failureReason } : {})
  };
}
