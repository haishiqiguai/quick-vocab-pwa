import { describe, expect, it } from 'vitest';
import { resolveBundledMeaningSpeechEntry, type BundledMeaningSpeechManifest } from './bundledMeaningSpeech';

const manifest: BundledMeaningSpeechManifest = {
  version: 1,
  voice: 'zh-CN-XiaoxiaoNeural',
  sourceRate: 1,
  files: 1,
  bytes: 1024,
  entries: { 'word-1': '/audio/bundled-meaning/word-1.mp3' }
};

describe('bundled Chinese meaning speech', () => {
  it('resolves a stable word id from the expected profile', () => {
    expect(resolveBundledMeaningSpeechEntry(manifest, 'word-1')).toBe('/audio/bundled-meaning/word-1.mp3');
  });

  it('rejects unknown words and mismatched profiles', () => {
    expect(resolveBundledMeaningSpeechEntry(manifest, 'word-2')).toBeUndefined();
    expect(resolveBundledMeaningSpeechEntry({ ...manifest, voice: 'other' }, 'word-1')).toBeUndefined();
  });
});
