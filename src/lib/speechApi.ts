export const NEURAL_SPEECH_VOICES = [
  { id: 'en-US-AriaNeural', name: 'Aria', locale: 'en-US', label: '美式女声 · 自然清晰' },
  { id: 'en-US-GuyNeural', name: 'Guy', locale: 'en-US', label: '美式男声 · 沉稳' },
  { id: 'en-GB-SoniaNeural', name: 'Sonia', locale: 'en-GB', label: '英式女声 · 清晰' }
] as const;

export interface SpeechProfile {
  voice: string;
  rate: number;
  files: number;
  bytes: number;
  total?: number;
}

export interface SpeechStatus {
  available: boolean;
  engine: string;
  voices: typeof NEURAL_SPEECH_VOICES;
  rates: number[];
  cache: { files: number; bytes: number };
}

export interface SpeechPrecacheJob {
  id: string;
  bookId: string;
  voice: string;
  rate: number;
  status: 'queued' | 'running' | 'pausing' | 'paused' | 'completed';
  total: number;
  completed: number;
  cached: number;
  generated: number;
  failed: number;
  bytes: number;
  errors: Array<{ term: string; message: string }>;
  createdAt: string;
  updatedAt: string;
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error || '神经语音服务暂不可用');
  return payload as T;
}

export function neuralAudioUrl(word: string, voice: string, rate: number): string {
  const params = new URLSearchParams({ word, voice, rate: String(rate) });
  return `/api/speech/audio?${params}`;
}

export function getSpeechStatus(): Promise<SpeechStatus> {
  return requestJson('/api/speech/status');
}

export function getSpeechProfile(voice: string, rate: number): Promise<SpeechProfile> {
  return requestJson(`/api/speech/profile?${new URLSearchParams({ voice, rate: String(rate) })}`);
}

export function getSpeechProfileForWords(words: string[], voice: string, rate: number): Promise<SpeechProfile> {
  return requestJson('/api/speech/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ words, voice, rate })
  });
}

export function startSpeechPrecache(bookId: string, words: string[], voice: string, rate: number): Promise<SpeechPrecacheJob> {
  return requestJson('/api/speech/precache', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookId, words, voice, rate })
  });
}

export function getSpeechPrecacheJob(id: string): Promise<SpeechPrecacheJob> {
  return requestJson(`/api/speech/precache/${encodeURIComponent(id)}`);
}

export function cancelSpeechPrecacheJob(id: string): Promise<SpeechPrecacheJob> {
  return requestJson(`/api/speech/precache/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
}

export function deleteSpeechProfile(voice: string, rate: number): Promise<SpeechProfile & { deleted: true }> {
  return requestJson(`/api/speech/cache?${new URLSearchParams({ voice, rate: String(rate) })}`, { method: 'DELETE' });
}

export function formatSpeechBytes(bytes: number): string {
  if (!bytes) return '0 MB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}
