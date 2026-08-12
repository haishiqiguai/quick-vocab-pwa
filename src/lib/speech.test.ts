import { describe, expect, it } from 'vitest';
import { getEnglishSpeechVoices, normalizeSpeechRate, speechVoiceId } from './speech';
import { normalizeStoredSettings } from './db';

describe('normalizeSpeechRate', () => {
  it('keeps supported presets and falls back for invalid values', () => {
    expect(normalizeSpeechRate(0.75)).toBe(0.75);
    expect(normalizeSpeechRate(0.85)).toBe(0.85);
    expect(normalizeSpeechRate(1.3)).toBe(1.3);
    expect(normalizeSpeechRate(undefined)).toBe(1);
  });

  it('limits restored values to a safe browser range', () => {
    expect(normalizeSpeechRate(0.1)).toBe(0.5);
    expect(normalizeSpeechRate(4)).toBe(2);
  });
});

describe('speech voice helpers', () => {
  it('keeps only English voices and uses a stable identifier', () => {
    const voices = [
      { voiceURI: 'english-natural', name: 'Natural', lang: 'en-US' },
      { voiceURI: 'mandarin', name: '普通话', lang: 'zh-CN' }
    ] as SpeechSynthesisVoice[];
    expect(getEnglishSpeechVoices(voices)).toEqual([voices[0]]);
    expect(speechVoiceId(voices[0])).toBe('english-natural');
  });
});

describe('speech settings migration', () => {
  it('keeps the old browser voice while enabling Aria neural voice by default', () => {
    const settings = normalizeStoredSettings({ speechRate: 0.9, speechVoice: 'old-system-voice' });
    expect(settings.speechRate).toBe(0.85);
    expect(settings.speechEngine).toBe('neural');
    expect(settings.neuralVoice).toBe('en-US-AriaNeural');
    expect(settings.speechVoice).toBe('old-system-voice');
  });

  it('preserves an explicit system engine choice', () => {
    expect(normalizeStoredSettings({ speechEngine: 'system' }).speechEngine).toBe('system');
  });

  it('keeps phonetics visible for old settings and restores an explicit hidden choice', () => {
    expect(normalizeStoredSettings({}).hidePhonetic).toBe(false);
    expect(normalizeStoredSettings({ hidePhonetic: true }).hidePhonetic).toBe(true);
  });
});
