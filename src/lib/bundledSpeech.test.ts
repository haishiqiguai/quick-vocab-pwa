import { describe, expect, it } from 'vitest';
import { normalizeBundledTerm, resolveBundledSpeechEntry, type BundledSpeechManifest } from './bundledSpeech';

const manifest: BundledSpeechManifest = {
  version: 1,
  voice: 'en-US-AriaNeural',
  rate: 1,
  files: 1,
  bytes: 123,
  entries: { 'mother-in-law': '/audio/bundled/example.mp3' }
};

describe('bundled speech resolution', () => {
  it('normalizes case and whitespace before resolving a bundled word', () => {
    expect(normalizeBundledTerm('  Mother-in-Law  ')).toBe('mother-in-law');
    expect(resolveBundledSpeechEntry(manifest, ' Mother-in-Law ', 'en-US-AriaNeural', 1)).toBe('/audio/bundled/example.mp3');
  });

  it('falls through when the term, voice or rate is not bundled', () => {
    expect(resolveBundledSpeechEntry(manifest, 'other', 'en-US-AriaNeural', 1)).toBeUndefined();
    expect(resolveBundledSpeechEntry(manifest, 'mother-in-law', 'en-US-GuyNeural', 1)).toBeUndefined();
    expect(resolveBundledSpeechEntry(manifest, 'mother-in-law', 'en-US-AriaNeural', 0.85)).toBeUndefined();
  });
});
