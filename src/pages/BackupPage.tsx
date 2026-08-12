import { Download, RefreshCcw, ShieldCheck, Upload } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from '../lib/router';
import { Button, PageHeader } from '../components/ui';
import { downloadBackup, restoreBackup } from '../lib/backup';
import { resetApplicationData } from '../lib/db';
import { useApp } from '../state/AppContext';

export function BackupPage() {
  const navigate = useNavigate();
  const { reload } = useApp();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function restore(file?: File) {
    if (!file) return;
    if (!confirm('恢复备份会覆盖当前浏览器中的全部词本和学习记录，是否继续？')) return;
    setBusy(true); setMessage('');
    try { await restoreBackup(file); await reload(); setMessage('备份恢复完成'); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : '恢复失败'); }
    finally { setBusy(false); }
  }

  async function reset() {
    if (!confirm('这会删除所有导入词本和学习记录，且无法撤销。确认重置？')) return;
    setBusy(true);
    await resetApplicationData();
    await reload();
    setBusy(false);
    navigate('/');
  }

  return <div className="standalone-page backup-page"><PageHeader title="备份与恢复" subtitle="Local Data Backup" back /><div className="page-content-narrow"><div className="backup-notice"><ShieldCheck /><div><strong>你的数据不会上传</strong><p>备份文件在浏览器内生成，恢复也完全在本机完成。</p></div></div><section className="backup-card"><Download /><div><h2>导出完整备份</h2><p>包含词本、学习记录、生词本、设置和学习计划。</p></div><Button onClick={() => void downloadBackup()}>导出 JSON</Button></section><section className="backup-card"><Upload /><div><h2>从备份恢复</h2><p>只接受本软件生成的版本 1 JSON 文件。</p></div><label className="button">选择备份<input type="file" accept="application/json,.json" disabled={busy} onChange={(event) => void restore(event.target.files?.[0])} /></label></section>{message && <div className="alert">{message}</div>}<section className="danger-zone"><RefreshCcw /><div><h2>恢复初始状态</h2><p>删除所有本地数据，重新建立内置高考词库。</p></div><button disabled={busy} onClick={() => void reset()}>清空并重置</button></section></div></div>;
}
