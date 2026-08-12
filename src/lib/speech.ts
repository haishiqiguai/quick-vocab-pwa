import type { AppSettings, SpeechEngine } from '../types';
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

let activeUtterance: SpeechSynthesisUtterance | undefined;
let preferredEnglishVoice: SpeechSynthesisVoice | undefined;
let activeAudio: HTMLAudioElement | undefined;
let activeAudioUrl: string | undefined;
let activeRequest: AbortController | undefined;

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
}

function speakWithSystem(term: string, options: SpeakOptions): boolean {
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
  return options.engine === 'system'
    ? Promise.resolve(speakWithSystem(term, options))
    : speakWithNeural(term, options);
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
  if (settings.speechEngine !== 'neural') return;
  for (const term of [...new Set(terms.filter(Boolean))].slice(0, 3)) {
    void fetch(neuralAudioUrl(term, settings.neuralVoice, settings.speechRate), { priority: 'low' } as RequestInit).catch(() => undefined);
  }
}
