import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = 'resources/android-audio';
const books = ['public/data/exam-words.json', 'public/data/guide-words.json'].map((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
if (books[0].length !== 357 || books[1].length !== 896) throw new Error('两个语音源词本的词数不匹配');
const words = books.flat();
const englishTerms = new Set(words.map((word) => word.term.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')));

const profiles = [
  {
    label: 'Aria English',
    manifestPath: path.join(root, 'audio', 'bundled-speech.json'),
    validate: (manifest) => manifest.voice === 'en-US-AriaNeural' && manifest.rate === 1,
    expectedKeys: englishTerms
  },
  {
    label: 'Xiaoxiao Chinese',
    manifestPath: path.join(root, 'audio', 'bundled-meaning-speech.json'),
    validate: (manifest) => manifest.voice === 'zh-CN-XiaoxiaoNeural' && manifest.sourceRate === 1,
    expectedKeys: new Set(words.map((word) => word.id))
  }
];

const ffprobeCheck = spawnSync('ffprobe', ['-version'], { encoding: 'utf8' });
if (ffprobeCheck.status !== 0) throw new Error('验证预装语音需要 ffprobe，但当前环境没有可用的 ffprobe');

function probeDuration(target) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', target]);
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.once('error', reject);
    child.once('close', (code) => code === 0 && Number(output.trim()) > 0 ? resolve() : reject(new Error(`MP3 无法解码：${target}`)));
  });
}

for (const profile of profiles) {
  const manifest = JSON.parse(fs.readFileSync(profile.manifestPath, 'utf8'));
  const entries = Object.entries(manifest.entries ?? {});
  if (manifest.version !== 1 || !profile.validate(manifest) || manifest.files !== profile.expectedKeys.size || entries.length !== profile.expectedKeys.size) {
    throw new Error(`${profile.label} 清单必须包含 ${profile.expectedKeys.size} 个正确配置的音频`);
  }
  if (new Set(entries.map(([key]) => key)).size !== profile.expectedKeys.size
    || entries.some(([key]) => !profile.expectedKeys.has(key))) {
    throw new Error(`${profile.label} 清单与两本词源数据不一致`);
  }

  let bytes = 0;
  const targets = [];
  for (const [key, url] of entries) {
    const target = path.join(root, String(url).replace(/^\/+/, '').replaceAll('/', path.sep));
    const audio = fs.readFileSync(target);
    const validHeader = audio.length > 128 && (
      audio.subarray(0, 3).toString('ascii') === 'ID3'
      || (audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0)
    );
    if (!validHeader) throw new Error(`${key} 缺少有效 MP3：${target}`);
    targets.push(target);
    bytes += audio.length;
  }
  if (bytes !== manifest.bytes) throw new Error(`${profile.label} 字节数不匹配：${bytes} != ${manifest.bytes}`);
  let cursor = 0;
  const worker = async () => {
    while (cursor < targets.length) {
      const target = targets[cursor++];
      await probeDuration(target);
    }
  };
  await Promise.all(Array.from({ length: Math.min(12, targets.length) }, () => worker()));
  console.log(`Verified ${profile.label}: ${entries.length} MP3 files (${bytes} bytes)`);
}
