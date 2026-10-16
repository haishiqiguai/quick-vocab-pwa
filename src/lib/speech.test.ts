import { describe, expect, it } from 'vitest';
import { formatMeaningForSpeech, getChineseSpeechVoices, getEnglishSpeechVoices, normalizeSpeechRate, runWithSpeechFallback, speechPlaybackCompleted, speechVoiceId, warmUpChineseSpeech } from './speech';
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
    expect(getChineseSpeechVoices(voices)).toEqual([voices[1]]);
  });

  it('converts English part-of-speech abbreviations before Chinese narration', () => {
    expect(formatMeaningForSpeech('n. 奖项；v. 授予；adj. 值得的；adv. 快速地')).toBe('名词， 奖项；动词， 授予；形容词， 值得的；副词， 快速地');
    expect(formatMeaningForSpeech('vt. 完成；vi. 到达；prep. 在')).toBe('及物动词， 完成；不及物动词， 到达；介词， 在');
  });

  it('warms the Chinese system voice with a silent utterance', async () => {
    const spoken: SpeechSynthesisUtterance[] = [];
    class MockUtterance {
      text: string;
      lang = '';
      volume = 1;
      voice: SpeechSynthesisVoice | null = null;
      onend: ((event: SpeechSynthesisEvent) => void) | null = null;
      onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;
      constructor(text: string) { this.text = text; }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: MockUtterance });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speaking: false,
        pending: false,
        getVoices: () => [{ voiceURI: 'mandarin', name: '普通话', lang: 'zh-CN' }],
        speak: (utterance: MockUtterance) => {
          spoken.push(utterance as unknown as SpeechSynthesisUtterance);
          utterance.onend?.(new Event('end') as SpeechSynthesisEvent);
        }
      }
    });
    await warmUpChineseSpeech();
    expect(spoken).toHaveLength(1);
    expect(spoken[0]).toMatchObject({ text: '。', lang: 'zh-CN', volume: 0 });
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

  it('uses safe automatic playback defaults and limits restored values', () => {
    expect(normalizeStoredSettings({})).toMatchObject({
      autoPlayEnabled: false,
      autoPlayInterval: 0,
      autoPlayRepeatCount: 2,
      autoPlayWord: true,
      autoPlayMeaning: false
    });
    expect(normalizeStoredSettings({
      autoPlayEnabled: true,
      autoPlayInterval: 99,
      autoPlayRepeatCount: 0,
      autoPlayWord: false,
      autoPlayMeaning: true
    })).toMatchObject({
      autoPlayEnabled: true,
      autoPlayInterval: 60,
      autoPlayRepeatCount: 1,
      autoPlayWord: false,
      autoPlayMeaning: true
    });
  });
});

describe('offline speech fallback', () => {
  it('advances automatic playback only after a real completion', () => {
    expect(speechPlaybackCompleted('completed')).toBe(true);
    expect(speechPlaybackCompleted('stopped')).toBe(false);
    expect(speechPlaybackCompleted('failed')).toBe(false);
  });

  it('uses the system fallback exactly once when bundled playback fails', async () => {
    let fallbackCalls = 0;
    const result = await runWithSpeechFallback(
      async () => 'failed',
      async () => { fallbackCalls += 1; return 'completed'; }
    );
    expect(result).toBe('completed');
    expect(fallbackCalls).toBe(1);
  });

  it('does not fall back after successful or explicitly stopped playback', async () => {
    let fallbackCalls = 0;
    const fallback = async () => { fallbackCalls += 1; return 'completed' as const; };
    expect(await runWithSpeechFallback(async () => 'completed', fallback)).toBe('completed');
    expect(await runWithSpeechFallback(async () => 'stopped', fallback)).toBe('stopped');
    expect(fallbackCalls).toBe(0);
  });
});
