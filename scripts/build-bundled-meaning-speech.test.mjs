import { describe, expect, it } from 'vitest';
import { formatMeaningForBundledSpeech } from './build-bundled-meaning-speech.mjs';

describe('bundled Chinese speech text', () => {
  it('matches the runtime part-of-speech expansion', () => {
    expect(formatMeaningForBundledSpeech('n. 奖项；v. 授予；adj. 值得的；adv. 快速地'))
      .toBe('名词， 奖项；动词， 授予；形容词， 值得的；副词， 快速地');
  });
});
