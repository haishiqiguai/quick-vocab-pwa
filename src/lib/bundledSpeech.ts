import { isNativeAndroid } from './platform';

export interface BundledSpeechManifest {
  version: number;
  voice: string;
  rate: number;
  files: number;
  bytes: number;
  entries: Record<string, string>;
}

let manifestPromise: Promise<BundledSpeechManifest | undefined> | undefined;

export function normalizeBundledTerm(term: string): string {
  return term.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function resolveBundledSpeechEntry(
  manifest: BundledSpeechManifest,
  term: string,
  voice: string,
  rate: number
): string | undefined {
  if (manifest.version !== 1 || manifest.voice !== voice || manifest.rate !== rate) return undefined;
  return manifest.entries[normalizeBundledTerm(term)];
}

async function loadManifest(): Promise<BundledSpeechManifest | undefined> {
  if (!isNativeAndroid()) return undefined;
  manifestPromise ??= fetch('/audio/bundled-speech.json')
    .then(async (response) => response.ok ? await response.json() as BundledSpeechManifest : undefined)
    .catch(() => undefined);
  return manifestPromise;
}

export async function getBundledSpeechUrl(term: string, voice: string, rate: number): Promise<string | undefined> {
  const manifest = await loadManifest();
  if (!manifest) return undefined;
  return resolveBundledSpeechEntry(manifest, term, voice, rate);
}
