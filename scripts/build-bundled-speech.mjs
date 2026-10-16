import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SpeechService, normalizeTerm, speechCacheKey } from '../server/speech-service.mjs';
import { BUNDLED_WORD_FILES, readBundledWords } from './bundled-word-sources.mjs';

export const BUNDLED_VOICE = 'en-US-AriaNeural';
export const BUNDLED_RATE = 1;

function looksLikeMp3(audio) {
  return audio.length > 128 && (
    audio.subarray(0, 3).toString('ascii') === 'ID3'
    || (audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0)
  );
}

export async function buildBundledSpeech({
  wordsFile,
  wordsFiles = BUNDLED_WORD_FILES,
  outputDir = 'resources/android-audio/audio/bundled',
  manifestFile = 'resources/android-audio/audio/bundled-speech.json',
  service = new SpeechService()
} = {}) {
  const allWords = await readBundledWords(wordsFile ? [wordsFile] : wordsFiles);
  const words = [...new Map(allWords.map((word) => [normalizeTerm(word.term).toLocaleLowerCase('en-US'), word])).values()];

  const temporaryDir = `${outputDir}.building`;
  await fs.rm(temporaryDir, { recursive: true, force: true });
  await fs.mkdir(temporaryDir, { recursive: true });
  const entries = {};
  let bytes = 0;

  try {
    for (let index = 0; index < words.length; index += 1) {
      const term = normalizeTerm(words[index].term);
      const normalized = term.toLocaleLowerCase('en-US');
      const fileName = `${speechCacheKey(term, BUNDLED_VOICE, BUNDLED_RATE)}.mp3`;
      let audio;
      try {
        audio = await fs.readFile(path.join(outputDir, fileName));
        if (!looksLikeMp3(audio)) audio = undefined;
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
      audio ??= (await service.getAudio(term, BUNDLED_VOICE, BUNDLED_RATE)).audio;
      if (!looksLikeMp3(audio)) throw new Error(`${term} 的音频不是有效 MP3`);
      await fs.writeFile(path.join(temporaryDir, fileName), audio);
      entries[normalized] = `/audio/bundled/${fileName}`;
      bytes += audio.length;
      if ((index + 1) % 25 === 0 || index + 1 === words.length) {
        console.log(`Bundled speech ${index + 1}/${words.length}`);
      }
    }

    await fs.rm(outputDir, { recursive: true, force: true });
    await fs.rename(temporaryDir, outputDir);
    await fs.mkdir(path.dirname(manifestFile), { recursive: true });
    await fs.writeFile(manifestFile, `${JSON.stringify({
      version: 1,
      voice: BUNDLED_VOICE,
      rate: BUNDLED_RATE,
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
  const result = await buildBundledSpeech();
  console.log(`Wrote ${result.files} MP3 files (${result.bytes} bytes)`);
}
