import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { escapeXml } from '../server/speech-service.mjs';
import { BUNDLED_WORD_FILES, readBundledWords } from './bundled-word-sources.mjs';

export const BUNDLED_MEANING_VOICE = 'zh-CN-XiaoxiaoNeural';
export const BUNDLED_MEANING_RATE = 1;

export function formatMeaningForBundledSpeech(meaning) {
  const partsOfSpeech = [
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

function looksLikeMp3(audio) {
  return audio.length > 128 && (
    audio.subarray(0, 3).toString('ascii') === 'ID3'
    || (audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0)
  );
}

function meaningSpeechKey(word) {
  return createHash('sha256').update(JSON.stringify({
    version: 1,
    id: word.id,
    text: formatMeaningForBundledSpeech(word.meaning),
    voice: BUNDLED_MEANING_VOICE,
    rate: BUNDLED_MEANING_RATE
  })).digest('hex');
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.once('end', () => resolve(Buffer.concat(chunks)));
    stream.once('error', reject);
  });
}

async function synthesize(text) {
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(BUNDLED_MEANING_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(escapeXml(text), { rate: BUNDLED_MEANING_RATE });
    const audio = await streamToBuffer(audioStream);
    if (!looksLikeMp3(audio)) throw new Error('在线语音服务没有返回有效 MP3');
    return audio;
  } finally {
    tts.close();
  }
}

async function readCachedAudio(target) {
  try {
    const audio = await fs.readFile(target);
    return looksLikeMp3(audio) ? audio : undefined;
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  }
}

export async function buildBundledMeaningSpeech({
  wordsFile,
  wordsFiles = BUNDLED_WORD_FILES,
  outputDir = 'resources/android-audio/audio/bundled-meaning',
  manifestFile = 'resources/android-audio/audio/bundled-meaning-speech.json',
  cacheDir = 'runtime/bundled-meaning-cache',
  synthesizeAudio = synthesize
} = {}) {
  const words = await readBundledWords(wordsFile ? [wordsFile] : wordsFiles);

  const temporaryDir = `${outputDir}.building`;
  await fs.rm(temporaryDir, { recursive: true, force: true });
  await fs.mkdir(temporaryDir, { recursive: true });
  await fs.mkdir(cacheDir, { recursive: true });

  const entries = {};
  const audioSizes = Array(words.length).fill(0);
  let cursor = 0;
  let completed = 0;

  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= words.length) return;
      const word = words[index];
      const fileName = `${meaningSpeechKey(word)}.mp3`;
      const cacheFile = path.join(cacheDir, fileName);
      let audio = await readCachedAudio(cacheFile);
      audio ??= await readCachedAudio(path.join(outputDir, fileName));
      if (!audio) {
        audio = await synthesizeAudio(formatMeaningForBundledSpeech(word.meaning));
        const temporaryCache = `${cacheFile}.${process.pid}.${randomUUID()}.tmp`;
        await fs.writeFile(temporaryCache, audio);
        await fs.rename(temporaryCache, cacheFile);
      }
      await fs.writeFile(path.join(temporaryDir, fileName), audio);
      entries[word.id] = `/audio/bundled-meaning/${fileName}`;
      audioSizes[index] = audio.length;
      completed += 1;
      if (completed % 25 === 0 || completed === words.length) console.log(`Bundled Chinese speech ${completed}/${words.length}`);
    }
  };

  try {
    await Promise.all([worker(), worker()]);
    await fs.rm(outputDir, { recursive: true, force: true });
    await fs.rename(temporaryDir, outputDir);
    await fs.mkdir(path.dirname(manifestFile), { recursive: true });
    const bytes = audioSizes.reduce((sum, size) => sum + size, 0);
    await fs.writeFile(manifestFile, `${JSON.stringify({
      version: 1,
      voice: BUNDLED_MEANING_VOICE,
      sourceRate: BUNDLED_MEANING_RATE,
      files: words.length,
      bytes,
      entries
    }, null, 2)}\n`);
    return { files: words.length, bytes, entries };
  } catch (error) {
    await fs.rm(temporaryDir, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildBundledMeaningSpeech();
  console.log(`Wrote ${result.files} Chinese MP3 files (${result.bytes} bytes)`);
}
