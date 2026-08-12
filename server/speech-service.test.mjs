import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  escapeXml,
  normalizeRate,
  normalizeTerm,
  SpeechService,
  speechCacheKey
} from './speech-service.mjs';

const temporaryDirs = [];

afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createService() {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'quick-vocab-speech-'));
  temporaryDirs.push(cacheDir);
  const calls = [];
  const service = new SpeechService({
    cacheDir,
    synthesize: async (term, voice, rate) => {
      calls.push({ term, voice, rate });
      return Buffer.from(`audio:${term}:${voice}:${rate}`);
    }
  });
  return { service, calls };
}

describe('speech input and cache keys', () => {
  it('normalizes safe vocabulary and rejects markup', () => {
    expect(normalizeTerm("  mother-in-law  ")).toBe('mother-in-law');
    expect(() => normalizeTerm('<speak>hello</speak>')).toThrow('不支持的字符');
    expect(normalizeRate('0.85')).toBe(0.85);
    expect(() => normalizeRate(0.9)).toThrow('不支持的朗读速度');
    expect(escapeXml("Tom & Jerry's")).toBe('Tom &amp; Jerry&apos;s');
  });

  it('uses case-insensitive stable cache keys', () => {
    expect(speechCacheKey('Welcome', 'en-US-AriaNeural', 1)).toBe(speechCacheKey(' welcome ', 'en-US-AriaNeural', 1));
  });
});

describe('speech cache and precache jobs', () => {
  it('merges duplicate generation and reads the cached file afterwards', async () => {
    const { service, calls } = await createService();
    const [left, right] = await Promise.all([
      service.getAudio('welcome', 'en-US-AriaNeural', 0.85),
      service.getAudio('welcome', 'en-US-AriaNeural', 0.85)
    ]);
    expect(calls).toHaveLength(1);
    expect(left.audio.equals(right.audio)).toBe(true);
    const cached = await service.getAudio('welcome', 'en-US-AriaNeural', 0.85);
    expect(cached.cached).toBe(true);
    expect(await readFile(cached.target)).toEqual(cached.audio);
  });

  it('skips duplicate terms and reuses cached words on a resumed submission', async () => {
    const { service } = await createService();
    const first = service.startPrecache({ bookId: 'book', words: ['one', 'two', 'one'], voice: 'en-US-AriaNeural', rate: 1 });
    let job = service.getJob(first.id);
    while (job.status !== 'completed') {
      await new Promise((resolve) => setTimeout(resolve, 5));
      job = service.getJob(first.id);
    }
    expect(job.total).toBe(2);
    expect(job.generated).toBe(2);
    const resumed = service.startPrecache({ bookId: 'book', words: ['one', 'two'], voice: 'en-US-AriaNeural', rate: 1 });
    let resumedJob = service.getJob(resumed.id);
    while (resumedJob.status !== 'completed') {
      await new Promise((resolve) => setTimeout(resolve, 5));
      resumedJob = service.getJob(resumed.id);
    }
    expect(resumedJob.cached).toBe(2);
    expect(resumedJob.generated).toBe(0);
  });

  it('pauses an active download and completes after resubmission', async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), 'quick-vocab-speech-'));
    temporaryDirs.push(cacheDir);
    const service = new SpeechService({
      cacheDir,
      synthesize: async (term) => {
        await new Promise((resolve) => setTimeout(resolve, 12));
        return Buffer.from(term);
      }
    });
    const words = ['one', 'two', 'three', 'four', 'five', 'six'];
    const first = service.startPrecache({ bookId: 'book', words, voice: 'en-US-AriaNeural', rate: 1 });
    service.cancelJob(first.id);
    let paused = service.getJob(first.id);
    while (paused.status !== 'paused') {
      await new Promise((resolve) => setTimeout(resolve, 5));
      paused = service.getJob(first.id);
    }
    expect(paused.completed).toBeLessThan(paused.total);
    const resumed = service.startPrecache({ bookId: 'book', words, voice: 'en-US-AriaNeural', rate: 1 });
    let completed = service.getJob(resumed.id);
    while (completed.status !== 'completed') {
      await new Promise((resolve) => setTimeout(resolve, 5));
      completed = service.getJob(resumed.id);
    }
    expect(completed.completed).toBe(words.length);
    expect(completed.failed).toBe(0);
  });

  it('limits all neural generation to two concurrent requests', async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), 'quick-vocab-speech-'));
    temporaryDirs.push(cacheDir);
    let active = 0;
    let peak = 0;
    const service = new SpeechService({
      cacheDir,
      synthesize: async (term) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return Buffer.from(term);
      }
    });
    await Promise.all(['one', 'two', 'three', 'four'].map((term) => service.getAudio(term, 'en-US-AriaNeural', 1)));
    expect(peak).toBe(2);
  });
});
