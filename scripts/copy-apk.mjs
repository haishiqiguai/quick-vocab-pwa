import fs from 'node:fs';
import path from 'node:path';

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const variant = process.argv[2] === 'debug' ? 'debug' : 'release';
const sourceName = variant === 'debug' ? 'app-debug.apk' : 'app-release.apk';
const source = path.join('android', 'app', 'build', 'outputs', 'apk', variant, sourceName);
const target = path.join('artifacts', `quick-vocab-${packageJson.version}-${variant}.apk`);
if (!fs.existsSync(source)) throw new Error(`找不到 APK：${source}`);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(source, target);
console.log(`APK copied to ${target} (${fs.statSync(target).size} bytes)`);
