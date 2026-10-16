import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveSupport: undefined as undefined | ((value: { supported: boolean }) => void),
  speak: vi.fn(async () => undefined),
  stop: vi.fn(async () => undefined)
}));

vi.mock('./platform', () => ({ isNativeAndroid: () => true }));
vi.mock('@capacitor-community/text-to-speech', () => ({
  QueueStrategy: { Flush: 0 },
  TextToSpeech: {
    isLanguageSupported: vi.fn(() => new Promise<{ supported: boolean }>((resolve) => { mocks.resolveSupport = resolve; })),
    speak: mocks.speak,
    stop: mocks.stop
  }
}));

import { speakWordAndWait, stopSpeaking } from './speech';

describe('native speech cancellation generation', () => {
  beforeEach(() => {
    mocks.resolveSupport = undefined;
    mocks.speak.mockClear();
    mocks.stop.mockClear();
  });

  it('does not start TTS after stop wins an asynchronous language check', async () => {
    const result = speakWordAndWait('active', { engine: 'system', quiet: true });
    await Promise.resolve();

    stopSpeaking();
    mocks.resolveSupport?.({ supported: true });

    await expect(result).resolves.toBe('stopped');
    expect(mocks.speak).not.toHaveBeenCalled();
  });
});
