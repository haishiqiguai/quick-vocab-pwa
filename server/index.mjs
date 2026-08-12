import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SpeechInputError, SpeechService } from './speech-service.mjs';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, '..');
const distDir = path.join(rootDir, 'dist');
const speech = process.env.QUICK_VOCAB_DISABLE_ONLINE_TTS === '1'
  ? new SpeechService({ synthesize: async () => { throw new Error('自动化测试已禁用在线语音生成'); } })
  : new SpeechService();
const localOnly = process.argv.includes('--local');
const localPort = Number(process.env.QUICK_VOCAB_LOCAL_PORT || 4173);
const mobilePort = Number(process.env.QUICK_VOCAB_MOBILE_PORT || 4174);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

function json(response, status, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  response.end(body);
}

async function readJson(request, maxBytes = 5 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new SpeechInputError('请求内容过大');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new SpeechInputError('请求内容不是有效的 JSON');
  }
}

async function handleSpeechApi(request, response, url) {
  if (request.method === 'GET' && url.pathname === '/api/speech/status') {
    return json(response, 200, await speech.getStatus());
  }
  if (request.method === 'GET' && url.pathname === '/api/speech/profile') {
    return json(response, 200, await speech.getProfile(url.searchParams.get('voice'), url.searchParams.get('rate')));
  }
  if (request.method === 'POST' && url.pathname === '/api/speech/profile') {
    const body = await readJson(request);
    return json(response, 200, await speech.getProfileForTerms(body.words, body.voice, body.rate));
  }
  if (request.method === 'GET' && url.pathname === '/api/speech/audio') {
    const result = await speech.getAudio(url.searchParams.get('word'), url.searchParams.get('voice'), url.searchParams.get('rate'));
    response.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Content-Length': result.audio.length,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Speech-Cache': result.cached ? 'HIT' : 'MISS'
    });
    response.end(result.audio);
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/speech/precache') {
    return json(response, 202, speech.startPrecache(await readJson(request)));
  }
  const jobMatch = url.pathname.match(/^\/api\/speech\/precache\/([0-9a-f-]+)(?:\/(cancel))?$/i);
  if (jobMatch && request.method === 'GET' && !jobMatch[2]) {
    const job = speech.getJob(jobMatch[1]);
    return job ? json(response, 200, job) : json(response, 404, { error: '找不到该下载任务' });
  }
  if (jobMatch && request.method === 'POST' && jobMatch[2] === 'cancel') {
    const job = speech.cancelJob(jobMatch[1]);
    return job ? json(response, 200, job) : json(response, 404, { error: '找不到该下载任务' });
  }
  if (request.method === 'DELETE' && url.pathname === '/api/speech/cache') {
    return json(response, 200, await speech.deleteProfile(url.searchParams.get('voice'), url.searchParams.get('rate')));
  }
  return json(response, 404, { error: '找不到该语音接口' });
}

async function serveStatic(request, response, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const candidate = path.resolve(distDir, requested);
  if (!candidate.startsWith(`${distDir}${path.sep}`) && candidate !== path.join(distDir, 'index.html')) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  let target = candidate;
  try {
    const stat = await fs.stat(target);
    if (!stat.isFile()) throw Object.assign(new Error('Not found'), { code: 'ENOENT' });
  } catch (error) {
    if (error?.code !== 'ENOENT' || !request.headers.accept?.includes('text/html')) {
      response.writeHead(404).end('Not found');
      return;
    }
    target = path.join(distDir, 'index.html');
  }
  const body = await fs.readFile(target);
  const extension = path.extname(target).toLowerCase();
  response.writeHead(200, {
    'Content-Type': contentTypes[extension] ?? 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': target.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600'
  });
  if (request.method === 'HEAD') response.end();
  else response.end(body);
}

async function handler(request, response) {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
    if (url.pathname.startsWith('/api/speech/')) return await handleSpeechApi(request, response, url);
    if (!['GET', 'HEAD'].includes(request.method ?? 'GET')) return json(response, 405, { error: 'Method not allowed' });
    return await serveStatic(request, response, url);
  } catch (error) {
    const status = error instanceof SpeechInputError ? error.statusCode : 503;
    const message = error instanceof SpeechInputError
      ? error.message
      : '神经语音暂不可用，请检查电脑网络后重试';
    if (!response.headersSent) json(response, status, { error: message });
    else response.destroy(error instanceof Error ? error : undefined);
    if (!(error instanceof SpeechInputError)) console.error('[speech]', error);
  }
}

function listen(host, port) {
  return new Promise((resolve, reject) => {
    const server = createServer(handler);
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      resolve(server);
    });
  });
}

try {
  await fs.access(path.join(distDir, 'index.html'));
} catch {
  console.error('找不到 dist/index.html，请先运行 npm.cmd run build。');
  process.exit(1);
}

const servers = [];
try {
  servers.push(await listen('127.0.0.1', localPort));
  if (!localOnly) servers.push(await listen('0.0.0.0', mobilePort));
  console.log(`电脑地址: http://127.0.0.1:${localPort}`);
  if (!localOnly) console.log(`手机端口: ${mobilePort}（请使用启动窗口显示的局域网地址）`);
  console.log('神经语音服务已启动；关闭此窗口将停止手机访问和朗读。');
} catch (error) {
  for (const server of servers) server.close();
  if (error?.code === 'EADDRINUSE') console.error(`端口 ${error.port ?? `${localPort}/${mobilePort}`} 已被占用，请关闭旧的启动窗口后重试。`);
  else console.error('服务器启动失败：', error);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    for (const server of servers) server.close();
    process.exit(0);
  });
}

const exitAfterMs = Number(process.env.QUICK_VOCAB_EXIT_AFTER_MS || 0);
if (Number.isFinite(exitAfterMs) && exitAfterMs > 0) {
  setTimeout(() => {
    for (const server of servers) server.close();
    process.exit(0);
  }, exitAfterMs);
}
