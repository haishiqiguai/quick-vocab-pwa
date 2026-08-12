import { CloudDownload, HardDrive, Pause, Play, RefreshCw, Trash2, WifiOff } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '../lib/db';
import {
  cancelSpeechPrecacheJob,
  deleteSpeechProfile,
  formatSpeechBytes,
  getSpeechPrecacheJob,
  getSpeechProfileForWords,
  getSpeechStatus,
  startSpeechPrecache,
  type SpeechPrecacheJob,
  type SpeechProfile
} from '../lib/speechApi';
import { useApp } from '../state/AppContext';

export function SpeechCacheCard() {
  const { activeBook, settings } = useApp();
  const words = useLiveQuery(
    () => activeBook ? db.words.where('bookId').equals(activeBook.id).sortBy('order') : [],
    [activeBook?.id],
    []
  ) ?? [];
  const terms = useMemo(() => words.map((word) => word.term), [words]);
  const [connected, setConnected] = useState<boolean>();
  const [profile, setProfile] = useState<SpeechProfile>();
  const [job, setJob] = useState<SpeechPrecacheJob>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    if (!terms.length) return;
    try {
      await getSpeechStatus();
      setConnected(true);
      setProfile(await getSpeechProfileForWords(terms, settings.neuralVoice, settings.speechRate));
      setError(undefined);
    } catch (cause) {
      setConnected(false);
      setError(cause instanceof Error ? cause.message : '电脑语音服务未连接');
    }
  }, [settings.neuralVoice, settings.speechRate, terms]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!job || !['queued', 'running', 'pausing'].includes(job.status)) return;
    const timer = window.setInterval(() => {
      void getSpeechPrecacheJob(job.id).then((next) => {
        setJob(next);
        if (next.status === 'completed' || next.status === 'paused') void refresh();
      }).catch((cause) => setError(cause instanceof Error ? cause.message : '无法读取下载进度'));
    }, 700);
    return () => window.clearInterval(timer);
  }, [job?.id, job?.status, refresh]);

  async function startDownload() {
    if (!activeBook || !terms.length) return;
    setBusy(true);
    setError(undefined);
    try {
      setJob(await startSpeechPrecache(activeBook.id, terms, settings.neuralVoice, settings.speechRate));
      setConnected(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '语音包下载失败');
    } finally {
      setBusy(false);
    }
  }

  async function pauseDownload() {
    if (!job) return;
    try { setJob(await cancelSpeechPrecacheJob(job.id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '暂停失败'); }
  }

  async function removeCache() {
    if (!profile?.files) return;
    if (!confirm(`删除 ${settings.neuralVoice}、${settings.speechRate}× 的全部本地语音缓存？`)) return;
    setBusy(true);
    try {
      await deleteSpeechProfile(settings.neuralVoice, settings.speechRate);
      setJob(undefined);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '删除缓存失败');
    } finally {
      setBusy(false);
    }
  }

  const completed = job?.completed ?? profile?.files ?? 0;
  const total = job?.total ?? profile?.total ?? terms.length;
  const percent = total ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  const averageBytes = profile?.files ? profile.bytes / profile.files : 7 * 1024;
  const estimatedBytes = Math.round(averageBytes * terms.length);
  const running = job && ['queued', 'running', 'pausing'].includes(job.status);
  const complete = total > 0 && (profile?.files ?? 0) >= total;

  return (
    <section className="speech-cache-card" aria-labelledby="speech-cache-title">
      <header>
        <span className="settings-icon"><CloudDownload /></span>
        <div><h2 id="speech-cache-title">离线语音包</h2><small>Offline neural voice</small></div>
        <span className={`speech-service-state ${connected ? 'online' : 'offline'}`}>
          {connected ? '服务已连接' : '未连接'}
        </span>
      </header>
      <div className="speech-cache-summary">
        <div className="speech-cache-progress" style={{ '--progress': `${percent}%` } as React.CSSProperties}><strong>{percent}%</strong></div>
        <div>
          <strong>{activeBook?.name ?? '当前词本'}</strong>
          <p>{profile?.files ?? 0} / {total || words.length} 个单词已缓存</p>
          <small><HardDrive size={13} /> 已用 {formatSpeechBytes(profile?.bytes ?? 0)} · 预计 {formatSpeechBytes(estimatedBytes)}</small>
        </div>
      </div>
      {job && <div className="speech-job-detail"><span>本次：{job.completed}/{job.total}</span><span>新下载 {job.generated}</span><span>已存在 {job.cached}</span><span className={job.failed ? 'error' : ''}>失败 {job.failed}</span></div>}
      <div className="speech-cache-actions">
        {running
          ? <button type="button" onClick={() => void pauseDownload()}><Pause size={16} />暂停</button>
          : <button type="button" className="primary" disabled={busy || complete || !terms.length} onClick={() => void startDownload()}>{job?.status === 'paused' ? <Play size={16} /> : <CloudDownload size={16} />}{job?.status === 'paused' ? '继续下载' : complete ? '已全部下载' : '下载当前词本'}</button>}
        <button type="button" disabled={busy || !profile?.files} onClick={() => void removeCache()}><Trash2 size={16} />删除缓存</button>
        <button type="button" aria-label="刷新语音包状态" disabled={busy} onClick={() => void refresh()}><RefreshCw size={16} /></button>
      </div>
      {error && <p className="speech-cache-error" role="status"><WifiOff size={15} />{error}。请确认使用新的启动脚本，并保持电脑窗口开启。</p>}
      <p className="speech-privacy-note">下载时只会发送英语单词到 Microsoft 在线朗读服务，不发送释义、昵称或学习记录。下载完成后，电脑断网时仍可通过局域网使用缓存。</p>
    </section>
  );
}
