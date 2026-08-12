import { CheckCircle2, Download, FileSpreadsheet, UploadCloud } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from '../lib/router';
import { Button, PageHeader } from '../components/ui';
import { getWorkbookSheets, importWordBook, parseImportFile, rowsToWords } from '../lib/importer';
import { useApp } from '../state/AppContext';
import type { ColumnMapping, ImportResult, ParsedImport } from '../types';

const fields: Array<{ key: keyof ColumnMapping; label: string; required?: boolean }> = [
  { key: 'word', label: '单词 Word', required: true },
  { key: 'meaning', label: '释义 Meaning', required: true },
  { key: 'phonetic', label: '音标 Phonetic' },
  { key: 'variants', label: '词形 Variants' },
  { key: 'frequency', label: '词频 Frequency' },
  { key: 'tags', label: '标签 Tags' }
];

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return value instanceof Date ? value.toLocaleDateString() : String(value);
}

export function ImportPage() {
  const navigate = useNavigate();
  const { books, plan, updatePlan, reload } = useApp();
  const [file, setFile] = useState<File>();
  const [sheets, setSheets] = useState<string[]>([]);
  const [sheet, setSheet] = useState('');
  const [parsed, setParsed] = useState<ParsedImport>();
  const [mapping, setMapping] = useState<ColumnMapping>();
  const [name, setName] = useState('');
  const [targetBookId, setTargetBookId] = useState('new');
  const [strategy, setStrategy] = useState<'skip' | 'replace'>('skip');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResult>();

  const previewStats = useMemo(() => {
    if (!parsed || !mapping) return undefined;
    try { return rowsToWords(parsed.rows, mapping, 'preview'); } catch { return undefined; }
  }, [parsed, mapping]);

  async function loadFile(nextFile?: File) {
    if (!nextFile) return;
    setBusy(true); setError(''); setResult(undefined);
    try {
      const extension = nextFile.name.split('.').pop()?.toLowerCase();
      let nextSheets: string[] = [];
      let selected = '';
      if (extension === 'xlsx') {
        nextSheets = await getWorkbookSheets(nextFile);
        selected = nextSheets[0] ?? '';
      }
      const nextParsed = await parseImportFile(nextFile, selected || undefined);
      setFile(nextFile); setSheets(nextSheets); setSheet(selected); setParsed(nextParsed); setMapping(nextParsed.mapping);
      setName(nextFile.name.replace(/\.(csv|xlsx)$/i, ''));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '文件解析失败');
    } finally { setBusy(false); }
  }

  async function selectSheet(nextSheet: string) {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const nextParsed = await parseImportFile(file, nextSheet);
      setSheet(nextSheet); setParsed(nextParsed); setMapping(nextParsed.mapping);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '工作表读取失败'); }
    finally { setBusy(false); }
  }

  function selectTarget(value: string) {
    setTargetBookId(value);
    if (value !== 'new') setName(books.find((book) => book.id === value)?.name ?? name);
  }

  async function confirmImport() {
    if (!parsed || !mapping || !name.trim()) return setError('请填写词本名称并完成字段映射');
    setBusy(true); setError('');
    try {
      const nextResult = await importWordBook({
        name,
        parsed,
        mapping,
        targetBookId: targetBookId === 'new' ? undefined : targetBookId,
        duplicateStrategy: strategy
      });
      setResult(nextResult);
      await updatePlan({ ...plan, bookId: nextResult.bookId, rangeStart: 1, rangeEnd: Math.min(500, nextResult.imported || parsed.rows.length) });
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '导入失败'); }
    finally { setBusy(false); }
  }

  return (
    <div className="standalone-page import-page">
      <PageHeader title="导入单词本" subtitle="Vocabulary Import" back />
      <div className="page-content-narrow">
        {!parsed && <label className="drop-zone"><UploadCloud size={42} /><strong>{busy ? '正在读取…' : '选择 CSV 或 Excel 文件'}</strong><p>最大 20 MB / 50,000 行，仅支持 .csv 与 .xlsx；手机端会显示全部文件</p><input type="file" disabled={busy} onChange={(event) => void loadFile(event.target.files?.[0])} /></label>}
        <a className="template-link" href="/import-template.csv" download><Download size={17} /> 下载导入模板</a>
        {error && <div className="alert error">{error}</div>}

        {parsed && mapping && !result && <>
          <section className="import-card file-summary"><FileSpreadsheet /><div><strong>{file?.name}</strong><small>{parsed.rows.length.toLocaleString()} 行 · {parsed.hasHeader ? '检测到表头' : '无表头模式'}</small></div><button onClick={() => { setParsed(undefined); setFile(undefined); }}>更换</button></section>
          {sheets.length > 1 && <section className="import-card"><label>工作表<select value={sheet} onChange={(event) => void selectSheet(event.target.value)}>{sheets.map((item) => <option key={item}>{item}</option>)}</select></label></section>}
          <section className="import-card"><h2>字段映射</h2><p>必填列必须同时选择，未使用的可选列保持“忽略”。</p><div className="mapping-grid">{fields.map((field) => <label key={field.key}><span>{field.label}{field.required && <em>*</em>}</span><select value={mapping[field.key]} onChange={(event) => setMapping({ ...mapping, [field.key]: Number(event.target.value) })}><option value={-1}>忽略</option>{parsed.headers.map((header, index) => <option key={`${header}-${index}`} value={index}>{header}</option>)}</select></label>)}</div></section>
          <section className="import-card"><h2>前 20 行预览</h2><div className="table-scroll"><table><thead><tr>{parsed.headers.map((header, index) => <th key={`${header}-${index}`}>{header}</th>)}</tr></thead><tbody>{parsed.rows.slice(0, 20).map((row, rowIndex) => <tr key={rowIndex}>{parsed.headers.map((_, columnIndex) => <td key={columnIndex}>{cellText(row[columnIndex])}</td>)}</tr>)}</tbody></table></div><p className="validation-summary">可导入 {previewStats?.words.length ?? 0} 行 · 文件内重复 {previewStats?.duplicates ?? 0} 行 · 无效 {previewStats?.invalid ?? 0} 行</p></section>
          <section className="import-card import-options"><label>导入位置<select value={targetBookId} onChange={(event) => selectTarget(event.target.value)}><option value="new">新建单词本</option>{books.filter((book) => book.source === 'imported').map((book) => <option key={book.id} value={book.id}>合并到：{book.name}</option>)}</select></label><label>词本名称<input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} /></label><label>重复单词<select value={strategy} onChange={(event) => setStrategy(event.target.value as typeof strategy)}><option value="skip">跳过重复项</option><option value="replace">用新内容覆盖</option></select></label></section>
          <Button disabled={busy || !previewStats?.words.length} onClick={() => void confirmImport()}>{busy ? '正在导入…' : '确认导入'}</Button>
        </>}

        {result && <section className="import-success"><CheckCircle2 /><small>Import complete</small><h1>词本导入完成</h1><p>成功写入 {result.imported} 个，重复 {result.duplicates} 个，无效 {result.invalid} 个。</p><Button onClick={() => navigate('/plan')}>查看学习计划</Button><Button className="secondary" onClick={() => navigate('/')}>返回首页</Button></section>}
      </div>
    </div>
  );
}
