import { QueueStrategy, TextToSpeech } from '@capacitor-community/text-to-speech';
import type { AppSettings, SpeechEngine } from '../types';
import { getBundledMeaningSpeechUrl } from './bundledMeaningSpeech';
import { getBundledSpeechUrl } from './bundledSpeech';
import { isNativeAndroid } from './platform';
import { neuralAudioUrl } from './speechApi';

export const SPEECH_RATE_PRESETS = [
  { value: 0.75, label: '慢速' },
  { value: 0.85, label: '较慢' },
  { value: 1, label: '标准' },
  { value: 1.15, label: '较快' },
  { value: 1.3, label: '快速' }
] as const;

export interface SpeakOptions {
  quiet?: boolean;
  rate?: number;
  engine?: SpeechEngine;
  neuralVoice?: string;
  voiceId?: string;
  onError?: (message: string) => void;
}

export type SpeechPlaybackResult = 'completed' | 'stopped' | 'failed';

let activeUtterance: SpeechSynthesisUtterance | undefined;
let preferredEnglishVoice: SpeechSynthesisVoice | undefined;
let activeAudio: HTMLAudioElement | undefined;
let activeAudioUrl: string | undefined;
let activeRequest: AbortController | undefined;
let activePlaybackDone: ((result: SpeechPlaybackResult) => void) | undefined;
let chineseSpeechWarmed = false;
let chineseSpeechWarmup: Promise<void> | undefined;
let speechGeneration = 0;

function finishActivePlayback(result: SpeechPlaybackResult) {
  const done = activePlaybackDone;
  activePlaybackDone = undefined;
  done?.(result);
}

export function normalizeSpeechRate(rate: unknown): number {
  return typeof rate === 'number' && Number.isFinite(rate)
    ? Math.min(2, Math.max(0.5, rate))
    : 1;
}

export function speechVoiceId(voice: SpeechSynthesisVoice): string {
  return voice.voiceURI || `${voice.name}::${voice.lang}`;
}

export function getEnglishSpeechVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return voices
    .filter((voice) => /^en([-_]|$)/i.test(voice.lang))
    .sort((left, right) => left.lang.localeCompare(right.lang) || left.name.localeCompare(right.name));
}

export function getChineseSpeechVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return voices
    .filter((voice) => /^zh([-_]|$)/i.test(voice.lang))
    .sort((left, right) => left.lang.localeCompare(right.lang) || left.name.localeCompare(right.name));
}

export function warmUpChineseSpeech(): Promise<void> {
  if (isNativeAndroid()) return Promise.resolve();
  if (chineseSpeechWarmed || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return Promise.resolve();
  if (chineseSpeechWarmup) return chineseSpeechWarmup;
  const synthesizer = window.speechSynthesis;
  if (synthesizer.speaking || synthesizer.pending) return Promise.resolve();
  const voice = getChineseSpeechVoices(synthesizer.getVoices())[0];
  chineseSpeechWarmup = new Promise((resolve) => {
    const finish = (warmed: boolean) => {
      chineseSpeechWarmed ||= warmed;
      chineseSpeechWarmup = undefined;
      resolve();
    };
    const utterance = new SpeechSynthesisUtterance('。');
    utterance.lang = 'zh-CN';
    utterance.volume = 0;
    if (voice) utterance.voice = voice;
    utterance.onend = () => finish(true);
    utterance.onerror = () => finish(false);
    try {
      synthesizer.speak(utterance);
    } catch {
      finish(false);
    }
  });
  return chineseSpeechWarmup;
}

export function formatMeaningForSpeech(meaning: string): string {
  const partsOfSpeech: Array<[RegExp, string]> = [
    [/\bmodal\s+v\./gi, '情态动词，'],
    [/\baux\.?\s*v\./gi, '助动词，'],
    [/\bvt\./gi, '及物动词，'],
    [/\bvi\./gi, '不及物动词，'],
    [/\badj\./gi, '形容词，'],
    [/\badv\./gi, '副词，'],
    [/\bprep\./gi, '介词，'],
    [/\bpron\./gi, '代词，'],
    [/\bconj\./gi, '连词，'],
    [/\bnum\./gi, '数词，'],
    [/\bart\./gi, '冠词，'],
    [/\bint\./gi, '感叹词，'],
    [/\babbr\./gi, '缩写词，'],
    [/\bpl\./gi, '复数，'],
    [/\bn\./gi, '名词，'],
    [/\bv\./gi, '动词，']
  ];
  return partsOfSpeech.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), meaning);
}

function getPreferredEnglishVoice(voices: SpeechSynthesisVoice[], selectedVoiceId?: string) {
  const englishVoices = getEnglishSpeechVoices(voices);
  const selectedVoice = englishVoices.find((voice) => speechVoiceId(voice) === selectedVoiceId);
  if (selectedVoice) return selectedVoice;
  if (preferredEnglishVoice && voices.includes(preferredEnglishVoice)) return preferredEnglishVoice;
  preferredEnglishVoice = englishVoices.sort((left, right) => {
    const score = (voice: SpeechSynthesisVoice) =>
      (voice.localService ? 2 : 0) + (/^en-US$/i.test(voice.lang) ? 1 : 0);
    return score(right) - score(left);
  })[0];
  return preferredEnglishVoice;
}

function reportSpeechError(options: SpeakOptions, message: string) {
  options.onError?.(message);
  if (!options.quiet) alert(message);
}

export function stopSpeaking(): void {
  speechGeneration += 1;
  finishActivePlayback('stopped');
  activeRequest?.abort();
  activeRequest = undefined;
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.removeAttribute('src');
    activeAudio.load();
    activeAudio = undefined;
  }
  if (activeAudioUrl) {
    URL.revokeObjectURL(activeAudioUrl);
    activeAudioUrl = undefined;
  }
  if ('speechSynthesis' in window) {
    if (activeUtterance) activeUtterance.onerror = null;
    window.speechSynthesis.cancel();
  }
  activeUtterance = undefined;
  if (isNativeAndroid()) void TextToSpeech.stop().catch(() => undefined);
}

function speakWithBrowserSystemAndWait(term: string, language: 'en-US' | 'zh-CN', options: SpeakOptions): Promise<SpeechPlaybackResult> {
  if (!('speechSynthesis' in window)) {
    reportSpeechError(options, language === 'zh-CN' ? '当前浏览器不支持中文系统朗读' : '当前浏览器不支持系统朗读');
    return Promise.resolve('failed');
  }
  const synthesizer = window.speechSynthesis;
  const voices = language === 'zh-CN' ? getChineseSpeechVoices(synthesizer.getVoices()) : getEnglishSpeechVoices(synthesizer.getVoices());
  if (synthesizer.getVoices().length > 0 && !voices[0]) {
    reportSpeechError(options, language === 'zh-CN' ? '本机没有可用的中文语音' : '本机没有可用的英语语音，请先安装英语语音包');
    return Promise.resolve('failed');
  }
  stopSpeaking();
  return new Promise((resolve) => {
    const complete = (result: SpeechPlaybackResult) => {
      if (activeUtterance === utterance) activeUtterance = undefined;
      if (activePlaybackDone === complete) activePlaybackDone = undefined;
      resolve(result);
    };
    const utterance = new SpeechSynthesisUtterance(term);
    activeUtterance = utterance;
    activePlaybackDone = complete;
    utterance.lang = language;
    utterance.rate = normalizeSpeechRate(options.rate);
    if (voices[0]) utterance.voice = voices[0];
    utterance.onend = () => complete('completed');
    utterance.onerror = (event) => {
      if (event.error === 'canceled' || event.error === 'interrupted') return complete('stopped');
      reportSpeechError(options, language === 'zh-CN' ? '中文朗读暂不可用' : '系统朗读暂不可用');
      complete('failed');
    };
    if (synthesizer.paused) synthesizer.resume();
    synthesizer.speak(utterance);
  });
}

async function speakWithNativeSystemAndWait(term: string, language: 'en-US' | 'zh-CN', options: SpeakOptions): Promise<SpeechPlaybackResult> {
  stopSpeaking();
  const generation = speechGeneration;
  try {
    const { supported } = await TextToSpeech.isLanguageSupported({ lang: language });
    if (generation !== speechGeneration) return 'stopped';
    if (!supported) {
      reportSpeechError(options, language === 'zh-CN'
        ? '手机未安装中文语音包，请在系统文字转语音设置中安装'
        : '手机未安装英语语音包，请在系统文字转语音设置中安装');
      return 'failed';
    }
  } catch {
    if (generation !== speechGeneration) return 'stopped';
    reportSpeechError(options, '手机系统语音暂不可用，请检查系统文字转语音设置');
    return 'failed';
  }

  await TextToSpeech.stop().catch(() => undefined);
  if (generation !== speechGeneration) return 'stopped';
  return await new Promise((resolve) => {
    let settled = false;
    const complete = (result: SpeechPlaybackResult) => {
      if (settled) return;
      settled = true;
      if (activePlaybackDone === complete) activePlaybackDone = undefined;
      resolve(result);
    };
    activePlaybackDone = complete;
    if (generation !== speechGeneration) return complete('stopped');
    void TextToSpeech.speak({
      text: term,
      lang: language,
      rate: normalizeSpeechRate(options.rate),
      pitch: 1,
      volume: 1,
      queueStrategy: QueueStrategy.Flush
    }).then(() => complete(generation === speechGeneration ? 'completed' : 'stopped')).catch(() => {
      if (generation !== speechGeneration) return complete('stopped');
      reportSpeechError(options, language === 'zh-CN' ? '手机中文语音朗读失败' : '手机英语语音朗读失败');
      complete('failed');
    });
  });
}

function speakWithSystemAndWait(term: string, language: 'en-US' | 'zh-CN', options: SpeakOptions): Promise<SpeechPlaybackResult> {
  return isNativeAndroid()
    ? speakWithNativeSystemAndWait(term, language, options)
    : speakWithBrowserSystemAndWait(term, language, options);
}

async function speakWithNeuralAndWait(term: string, options: SpeakOptions): Promise<SpeechPlaybackResult> {
  stopSpeaking();
  const controller = new AbortController();
  activeRequest = controller;
  try {
    const response = await fetch(neuralAudioUrl(term, options.neuralVoice ?? 'en-US-AriaNeural', normalizeSpeechRate(options.rate)), {
      signal: controller.signal
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(payload.error || '神经语音暂不可用');
    }
    const blob = await response.blob();
    if (controller.signal.aborted) return 'stopped';
    const objectUrl = URL.createObjectURL(blob);
    const audio = new Audio(objectUrl);
    activeAudio = audio;
    activeAudioUrl = objectUrl;
    activeRequest = undefined;
    return await new Promise((resolve) => {
      const complete = (result: SpeechPlaybackResult) => {
        if (activeAudio === audio) activeAudio = undefined;
        if (activeAudioUrl === objectUrl) activeAudioUrl = undefined;
        if (activePlaybackDone === complete) activePlaybackDone = undefined;
        URL.revokeObjectURL(objectUrl);
        resolve(result);
      };
      activePlaybackDone = complete;
      audio.addEventListener('ended', () => complete('completed'), { once: true });
      audio.addEventListener('error', () => complete('failed'), { once: true });
      void audio.play().catch((error: unknown) => {
        reportSpeechError(options, error instanceof Error ? error.message : '神经语音暂不可用');
        complete('failed');
      });
    });
  } catch (error) {
    if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return 'stopped';
    activeRequest = undefined;
    reportSpeechError(options, error instanceof Error ? error.message : '神经语音暂不可用');
    return 'failed';
  }
}

async function playBundledAndWait(term: string, options: SpeakOptions): Promise<SpeechPlaybackResult> {
  stopSpeaking();
  const generation = speechGeneration;
  const url = await getBundledSpeechUrl(
    term,
    options.neuralVoice ?? 'en-US-AriaNeural',
    normalizeSpeechRate(options.rate)
  );
  if (generation !== speechGeneration) return 'stopped';
  if (!url) return 'failed';
  const audio = new Audio(url);
  activeAudio = audio;
  return await new Promise((resolve) => {
    let settled = false;
    const complete = (result: SpeechPlaybackResult) => {
      if (settled) return;
      settled = true;
      if (activeAudio === audio) activeAudio = undefined;
      if (activePlaybackDone === complete) activePlaybackDone = undefined;
      resolve(result);
    };
    activePlaybackDone = complete;
    audio.addEventListener('ended', () => complete('completed'), { once: true });
    audio.addEventListener('error', () => complete('failed'), { once: true });
    void audio.play().catch(() => complete('failed'));
  });
}

async function playBundledMeaningAndWait(wordId: string, options: SpeakOptions): Promise<SpeechPlaybackResult> {
  stopSpeaking();
  const generation = speechGeneration;
  const url = await getBundledMeaningSpeechUrl(wordId);
  if (generation !== speechGeneration) return 'stopped';
  if (!url) return 'failed';
  const audio = new Audio(url);
  audio.playbackRate = normalizeSpeechRate(options.rate);
  audio.preservesPitch = true;
  activeAudio = audio;
  return await new Promise((resolve) => {
    let settled = false;
    const complete = (result: SpeechPlaybackResult) => {
      if (settled) return;
      settled = true;
      if (activeAudio === audio) activeAudio = undefined;
      if (activePlaybackDone === complete) activePlaybackDone = undefined;
      resolve(result);
    };
    activePlaybackDone = complete;
    audio.addEventListener('ended', () => complete('completed'), { once: true });
    audio.addEventListener('error', () => complete('failed'), { once: true });
    void audio.play().catch(() => complete('failed'));
  });
}

export async function runWithSpeechFallback(
  primary: () => Promise<SpeechPlaybackResult>,
  fallback: () => Promise<SpeechPlaybackResult>
): Promise<SpeechPlaybackResult> {
  const result = await primary();
  return result === 'failed' ? fallback() : result;
}

async function speakWithBundledFallbackAndWait(term: string, options: SpeakOptions): Promise<SpeechPlaybackResult> {
  return runWithSpeechFallback(
    () => playBundledAndWait(term, options),
    () => speakWithSystemAndWait(term, 'en-US', options)
  );
}

function speakWithBrowserSystem(term: string, options: SpeakOptions): boolean {
  if (!('speechSynthesis' in window)) {
    reportSpeechError(options, '当前浏览器不支持系统朗读');
    return false;
  }
  const synthesizer = window.speechSynthesis;
  const voices = synthesizer.getVoices();
  const englishVoice = getPreferredEnglishVoice(voices, options.voiceId);
  if (voices.length > 0 && !englishVoice) {
    reportSpeechError(options, '本机没有可用的英语语音，请先安装英语语音包');
    return false;
  }
  stopSpeaking();
  const utterance = new SpeechSynthesisUtterance(term);
  activeUtterance = utterance;
  utterance.lang = 'en-US';
  utterance.rate = normalizeSpeechRate(options.rate);
  if (englishVoice) utterance.voice = englishVoice;
  utterance.onend = () => { if (activeUtterance === utterance) activeUtterance = undefined; };
  utterance.onerror = (event) => {
    if (activeUtterance === utterance) activeUtterance = undefined;
    if (event.error === 'canceled' || event.error === 'interrupted') return;
    reportSpeechError(options, '系统朗读暂不可用');
  };
  if (synthesizer.paused) synthesizer.resume();
  synthesizer.speak(utterance);
  return true;
}

async function speakWithSystem(term: string, options: SpeakOptions): Promise<boolean> {
  if (isNativeAndroid()) return await speakWithNativeSystemAndWait(term, 'en-US', options) === 'completed';
  return speakWithBrowserSystem(term, options);
}

async function speakWithNeural(term: string, options: SpeakOptions): Promise<boolean> {
  stopSpeaking();
  const controller = new AbortController();
  activeRequest = controller;
  try {
    const response = await fetch(neuralAudioUrl(term, options.neuralVoice ?? 'en-US-AriaNeural', normalizeSpeechRate(options.rate)), {
      signal: controller.signal
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(payload.error || '神经语音暂不可用');
    }
    const blob = await response.blob();
    if (controller.signal.aborted) return false;
    const objectUrl = URL.createObjectURL(blob);
    const audio = new Audio(objectUrl);
    activeAudio = audio;
    activeAudioUrl = objectUrl;
    activeRequest = undefined;
    const cleanup = () => {
      if (activeAudio === audio) activeAudio = undefined;
      if (activeAudioUrl === objectUrl) activeAudioUrl = undefined;
      URL.revokeObjectURL(objectUrl);
    };
    audio.addEventListener('ended', cleanup, { once: true });
    audio.addEventListener('error', cleanup, { once: true });
    await audio.play();
    return true;
  } catch (error) {
    if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return false;
    activeRequest = undefined;
    reportSpeechError(options, error instanceof Error ? error.message : '神经语音暂不可用');
    return false;
  }
}

export function speakWord(term: string, options: SpeakOptions = {}): Promise<boolean> {
  if (options.engine === 'system') return speakWithSystem(term, options);
  if (!isNativeAndroid()) return speakWithNeural(term, options);
  return playBundledAndWait(term, { ...options, quiet: true }).then((result) => (
    result === 'completed' ? true : result === 'stopped' ? false : speakWithSystem(term, options)
  ));
}

export function speakWordAndWait(term: string, options: SpeakOptions = {}): Promise<SpeechPlaybackResult> {
  if (options.engine === 'system') return speakWithSystemAndWait(term, 'en-US', options);
  return isNativeAndroid()
    ? speakWithBundledFallbackAndWait(term, options)
    : speakWithNeuralAndWait(term, options);
}

export function speakChineseAndWait(wordId: string, text: string, options: SpeakOptions = {}): Promise<SpeechPlaybackResult> {
  if (!isNativeAndroid()) return speakWithSystemAndWait(text, 'zh-CN', options);
  return runWithSpeechFallback(
    () => playBundledMeaningAndWait(wordId, options),
    () => speakWithSystemAndWait(text, 'zh-CN', options)
  );
}

export function speechPlaybackCompleted(result: SpeechPlaybackResult): boolean {
  return result === 'completed';
}

export function speechOptionsFromSettings(settings: AppSettings, extra: Partial<SpeakOptions> = {}): SpeakOptions {
  return {
    engine: settings.speechEngine,
    rate: settings.speechRate,
    neuralVoice: settings.neuralVoice,
    voiceId: settings.speechVoice,
    ...extra
  };
}

export function prefetchSpeechWords(terms: string[], settings: AppSettings): void {
  if (settings.speechEngine !== 'neural' || isNativeAndroid()) return;
  for (const term of [...new Set(terms.filter(Boolean))].slice(0, 3)) {
    void fetch(neuralAudioUrl(term, settings.neuralVoice, settings.speechRate), { priority: 'low' } as RequestInit).catch(() => undefined);
  }
}
