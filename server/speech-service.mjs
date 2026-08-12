import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

export const SPEECH_VOICES = [
  { id: 'en-US-AriaNeural', name: 'Aria', locale: 'en-US', gender: 'Female', label: '美式女声 · 自然清晰' },
  { id: 'en-US-GuyNeural', name: 'Guy', locale: 'en-US', gender: 'Male', label: '美式男声 · 沉稳' },
  { id: 'en-GB-SoniaNeural', name: 'Sonia', locale: 'en-GB', gender: 'Female', label: '英式女声 · 清晰' }
];

export const SPEECH_RATES = [0.75, 0.85, 1, 1.15, 1.3];
const VOICE_IDS = new Set(SPEECH_VOICES.map((voice) => voice.id));
const RATE_KEYS = new Set(SPEECH_RATES.map((rate) => String(rate)));
const MAX_TERM_LENGTH = 80;
const CACHE_VERSION = 1;

const currentDir = path.dirname(fileURLToPath(import.meta.url));
export const defaultCacheDir = path.resolve(currentDir, '..', 'runtime', 'tts-cache');

export function normalizeTerm(value) {
  if (typeof value !== 'string') throw new SpeechInputError('单词必须是文本');
  const term = value.trim().replace(/\s+/g, ' ');
  if (!term) throw new SpeechInputError('单词不能为空');
  if (term.length > MAX_TERM_LENGTH) throw new SpeechInputError(`单词不能超过 ${MAX_TERM_LENGTH} 个字符`);
  if (!/^[\p{L}\p{M}\d\s.'’(),/&-]+$/u.test(term)) throw new SpeechInputError('单词包含不支持的字符');
  return term;
}

export function normalizeVoice(value) {
  const voice = typeof value === 'string' ? value : '';
  if (!VOICE_IDS.has(voice)) throw new SpeechInputError('不支持的朗读声音');
  return voice;
}

export function normalizeRate(value) {
  const numeric = typeof value === 'number' ? value : Number(value);
  const key = String(numeric);
  if (!Number.isFinite(numeric) || !RATE_KEYS.has(key)) throw new SpeechInputError('不支持的朗读速度');
  return numeric;
}

export function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function speechCacheKey(term, voice, rate) {
  const normalized = normalizeTerm(term).toLocaleLowerCase('en-US');
  const selectedVoice = normalizeVoice(voice);
  const selectedRate = normalizeRate(rate);
  return createHash('sha256')
    .update(JSON.stringify({ version: CACHE_VERSION, term: normalized, voice: selectedVoice, rate: selectedRate }))
    .digest('hex');
}

export function speechProfileKey(voice, rate) {
  return `${normalizeVoice(voice)}__${normalizeRate(rate)}`;
}

export class SpeechInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SpeechInputError';
    this.statusCode = 400;
  }
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.once('end', () => resolve(Buffer.concat(chunks)));
    stream.once('error', reject);
  });
}

async function synthesizeWithEdge(term, voice, rate) {
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(escapeXml(term), { rate });
    const audio = await streamToBuffer(audioStream);
    if (!audio.length) throw new Error('在线语音服务没有返回音频');
    return audio;
  } finally {
    tts.close();
  }
}

async function listMp3Files(root) {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry) => {
      const target = path.join(root, entry.name);
      if (entry.isDirectory()) return listMp3Files(target);
      if (!entry.isFile() || !entry.name.endsWith('.mp3')) return [];
      const stat = await fs.stat(target);
      return [{ path: target, bytes: stat.size }];
    }));
    return nested.flat();
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

export class SpeechService {
  constructor({ cacheDir = defaultCacheDir, synthesize = synthesizeWithEdge } = {}) {
    this.cacheDir = cacheDir;
    this.synthesize = synthesize;
    this.inflight = new Map();
    this.jobs = new Map();
    this.activeSyntheses = 0;
    this.synthesisQueue = [];
  }

  async runSynthesis(task) {
    if (this.activeSyntheses >= 2) await new Promise((resolve) => this.synthesisQueue.push(resolve));
    this.activeSyntheses += 1;
    try {
      return await task();
    } finally {
      this.activeSyntheses -= 1;
      this.synthesisQueue.shift()?.();
    }
  }

  audioPath(term, voice, rate) {
    const profile = speechProfileKey(voice, rate);
    return path.join(this.cacheDir, profile, `${speechCacheKey(term, voice, rate)}.mp3`);
  }

  async hasAudio(term, voice, rate) {
    try {
      await fs.access(this.audioPath(term, voice, rate));
      return true;
    } catch {
      return false;
    }
  }

  async getAudio(termValue, voiceValue, rateValue) {
    const term = normalizeTerm(termValue);
    const voice = normalizeVoice(voiceValue);
    const rate = normalizeRate(rateValue);
    const target = this.audioPath(term, voice, rate);
    try {
      return { audio: await fs.readFile(target), cached: true, target };
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }

    const key = speechCacheKey(term, voice, rate);
    if (!this.inflight.has(key)) {
      const task = (async () => {
        const audio = await this.runSynthesis(() => this.synthesize(term, voice, rate));
        await fs.mkdir(path.dirname(target), { recursive: true });
        const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
        await fs.writeFile(temporary, audio);
        await fs.rename(temporary, target);
        return Buffer.from(audio);
      })().finally(() => this.inflight.delete(key));
      this.inflight.set(key, task);
    }
    return { audio: await this.inflight.get(key), cached: false, target };
  }

  async getProfile(voiceValue, rateValue) {
    const voice = normalizeVoice(voiceValue);
    const rate = normalizeRate(rateValue);
    const files = await listMp3Files(path.join(this.cacheDir, speechProfileKey(voice, rate)));
    return { voice, rate, files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0) };
  }

  async getProfileForTerms(words, voiceValue, rateValue) {
    const voice = normalizeVoice(voiceValue);
    const rate = normalizeRate(rateValue);
    if (!Array.isArray(words) || words.length > 50_000) throw new SpeechInputError('缓存检查的单词数量无效');
    const terms = [...new Map(words.map((value) => {
      const term = normalizeTerm(typeof value === 'string' ? value : value?.term);
      return [term.toLocaleLowerCase('en-US'), term];
    })).values()];
    const matches = Array(terms.length).fill(0);
    const cursor = { value: 0 };
    const checkWorker = async () => {
      while (true) {
        const index = cursor.value++;
        if (index >= terms.length) return;
        const target = this.audioPath(terms[index], voice, rate);
        try {
          const stat = await fs.stat(target);
          matches[index] = stat.size;
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(16, terms.length) }, () => checkWorker()));
    return {
      voice,
      rate,
      total: terms.length,
      files: matches.filter(Boolean).length,
      bytes: matches.reduce((sum, size) => sum + size, 0)
    };
  }

  async getStatus() {
    const files = await listMp3Files(this.cacheDir);
    return {
      available: true,
      engine: 'edge-read-aloud',
      voices: SPEECH_VOICES,
      rates: SPEECH_RATES,
      cache: { files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0) }
    };
  }

  startPrecache({ bookId, words, voice: voiceValue, rate: rateValue }) {
    const voice = normalizeVoice(voiceValue);
    const rate = normalizeRate(rateValue);
    if (!Array.isArray(words) || words.length === 0) throw new SpeechInputError('词本中没有可下载的单词');
    if (words.length > 50_000) throw new SpeechInputError('单次最多缓存 50,000 个单词');
    const uniqueTerms = [...new Map(words.map((value) => {
      const term = normalizeTerm(typeof value === 'string' ? value : value?.term);
      return [term.toLocaleLowerCase('en-US'), term];
    })).values()];
    const id = randomUUID();
    const job = {
      id,
      bookId: typeof bookId === 'string' ? bookId.slice(0, 120) : '',
      voice,
      rate,
      status: 'queued',
      total: uniqueTerms.length,
      completed: 0,
      cached: 0,
      generated: 0,
      failed: 0,
      bytes: 0,
      errors: [],
      cancelled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.jobs.set(id, job);
    void this.runPrecache(job, uniqueTerms);
    return this.publicJob(job);
  }

  async runPrecache(job, terms) {
    job.status = 'running';
    const cursor = { value: 0 };
    const worker = async () => {
      while (!job.cancelled) {
        const index = cursor.value++;
        if (index >= terms.length) return;
        const term = terms[index];
        try {
          const result = await this.getAudio(term, job.voice, job.rate);
          job[result.cached ? 'cached' : 'generated'] += 1;
          job.bytes += result.audio.length;
        } catch (error) {
          job.failed += 1;
          if (job.errors.length < 10) job.errors.push({ term, message: error instanceof Error ? error.message : '生成失败' });
        } finally {
          job.completed += 1;
          job.updatedAt = new Date().toISOString();
        }
      }
    };
    await Promise.all([worker(), worker()]);
    job.status = job.cancelled ? 'paused' : 'completed';
    job.updatedAt = new Date().toISOString();
  }

  publicJob(job) {
    if (!job) return undefined;
    const { cancelled: _cancelled, ...safe } = job;
    return { ...safe };
  }

  getJob(id) {
    return this.publicJob(this.jobs.get(id));
  }

  cancelJob(id) {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    if (job.status === 'queued' || job.status === 'running') {
      job.cancelled = true;
      job.status = 'pausing';
      job.updatedAt = new Date().toISOString();
    }
    return this.publicJob(job);
  }

  async deleteProfile(voiceValue, rateValue) {
    const voice = normalizeVoice(voiceValue);
    const rate = normalizeRate(rateValue);
    const profileDir = path.join(this.cacheDir, speechProfileKey(voice, rate));
    const before = await this.getProfile(voice, rate);
    await fs.rm(profileDir, { recursive: true, force: true });
    return { ...before, deleted: true };
  }
}
