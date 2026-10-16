import { isNativeAndroid } from './platform';

export interface BundledMeaningSpeechManifest {
  version: number;
  voice: string;
  sourceRate: number;
  files: number;
  bytes: number;
  entries: Record<string, string>;
}

let manifestPromise: Promise<BundledMeaningSpeechManifest | undefined> | undefined;

export function resolveBundledMeaningSpeechEntry(
  manifest: BundledMeaningSpeechManifest,
  wordId: string
): string | undefined {
  if (manifest.version !== 1 || manifest.voice !== 'zh-CN-XiaoxiaoNeural' || manifest.sourceRate !== 1) return undefined;
  return manifest.entries[wordId];
}

async function loadManifest(): Promise<BundledMeaningSpeechManifest | undefined> {
  if (!isNativeAndroid()) return undefined;
  manifestPromise ??= fetch('/audio/bundled-meaning-speech.json')
    .then(async (response) => response.ok ? await response.json() as BundledMeaningSpeechManifest : undefined)
    .catch(() => undefined);
  return manifestPromise;
}

export async function getBundledMeaningSpeechUrl(wordId: string): Promise<string | undefined> {
  const manifest = await loadManifest();
  return manifest ? resolveBundledMeaningSpeechEntry(manifest, wordId) : undefined;
}
