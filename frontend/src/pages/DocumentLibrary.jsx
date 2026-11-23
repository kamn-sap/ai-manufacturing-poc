import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowUpFromLine, Check, Clock3, FileCheck2, FileText, RefreshCw, Search, X } from 'lucide-react';
import { api, jsonBody } from '../api';

const kinds = [
  ['work-instruction', '作業標準書'],
  ['manual', 'マニュアル'],
  ['faq', 'FAQ'],
  ['trouble-history', 'トラブル履歴'],
  ['design', '設計書'],
];
const statusNames = { uploading: 'アップロード中', queued: '取り込み待ち', processing: '解析中', ready: '利用可能', failed: '取り込み失敗' };
const allowedTypes = '.txt,.md,.markdown,.pdf,.docx,.xlsx';

export default function DocumentLibrary() {
  const [documents, setDocuments] = useState([]);
  const [kind, setKind] = useState('work-instruction');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  async function refresh() {
    try {
      const result = await api('/knowledge');
      setDocuments(result.documents);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 8000);
    return () => window.clearInterval(timer);
  }, []);

  async function upload(file) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const { document, uploadUrl, uploadHeaders } = await api('/knowledge/upload-url', {
        method: 'POST',
        body: jsonBody({ fileName: file.name, kind }),
      });
      const response = await fetch(uploadUrl, { method: 'PUT', headers: uploadHeaders, body: file });
      if (!response.ok) throw new Error('S3へのアップロードに失敗しました。');
      await api(`/knowledge/${document.id}/complete`, { method: 'POST', body: jsonBody({}) });
      await refresh();
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const visibleDocuments = documents.filter((document) => document.fileName.toLowerCase().includes(query.toLowerCase()));
  const readyCount = documents.filter((document) => document.status === 'ready').length;
  const processingCount = documents.filter((document) => ['queued', 'processing', 'uploading'].includes(document.status)).length;

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div><p className="eyebrow">KNOWLEDGE BASE</p><h1>文書ライブラリ</h1><p className="muted">現場の手順書や設計書を登録し、検索できるナレッジにします。</p></div>
        <button className="button button-primary" onClick={() => inputRef.current?.click()} disabled={busy}><ArrowUpFromLine size={17} />{busy ? 'アップロード中…' : '文書を登録'}</button>
        <input ref={inputRef} className="visually-hidden" type="file" accept={allowedTypes} onChange={(event) => upload(event.target.files?.[0])} />
      </div>

      <div className="stat-grid">
        <div className="stat-card"><div className="stat-icon stat-violet"><FileText size={18} /></div><div><span>登録文書</span><strong>{documents.length}<small> 件</small></strong></div><span className="stat-caption">ライブラリ全体</span></div>
        <div className="stat-card"><div className="stat-icon stat-green"><FileCheck2 size={18} /></div><div><span>検索可能</span><strong>{readyCount}<small> 件</small></strong></div><span className="stat-caption">取り込み完了</span></div>
        <div className="stat-card"><div className="stat-icon stat-amber"><Clock3 size={18} /></div><div><span>取り込み中</span><strong>{processingCount}<small> 件</small></strong></div><span className="stat-caption">バックグラウンド処理</span></div>
      </div>

      <section className="panel upload-panel">
        <div className="panel-title-row"><div><h2>ナレッジを追加</h2><p className="muted">ファイルを選択すると、安全な署名付きURLで保存し検索索引を作成します。</p></div><span className="secure-label"><Check size={14} /> S3暗号化ストレージ</span></div>
        <div className="upload-controls">
          <label className="select-label">文書の種別<select value={kind} onChange={(event) => setKind(event.target.value)}>{kinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <button className="upload-dropzone" disabled={busy} onClick={() => inputRef.current?.click()}>
            <span className="upload-icon"><ArrowUpFromLine size={20} /></span>
            <span><strong>ファイルを選択してアップロード</strong><small>TXT · Markdown · PDF · DOCX · XLSX</small></span>
            <span className="button button-secondary">ファイルを選択</span>
          </button>
        </div>
        <p className="inline-notice"><AlertCircle size={15} /> OCR・動画・図面解析は対象外です。機密情報を含まない文書を登録してください。</p>
      </section>

      <section className="panel">
        <div className="panel-title-row list-heading"><div><h2>登録済み文書</h2><p className="muted">取り込み状態と検索利用可否を確認できます。</p></div><button className="icon-button" title="更新" onClick={refresh}><RefreshCw size={17} /></button></div>
        {error && <div className="alert-error" role="alert"><AlertCircle size={16} />{error}<button onClick={() => setError('')} aria-label="閉じる"><X size={15} /></button></div>}
        <div className="toolbar"><div className="search-field"><Search size={16} /><input placeholder="文書名で検索" value={query} onChange={(event) => setQuery(event.target.value)} /></div><span className="result-count">{visibleDocuments.length} 件</span></div>
        <div className="document-list">
          {visibleDocuments.map((document) => (
            <article key={document.id} id={document.id} className="document-row">
              <div className="file-icon"><FileText size={18} /></div>
              <div className="document-name"><strong>{document.fileName}</strong><span>{kinds.find(([value]) => value === document.kind)?.[1] || document.kind} · v{document.version}</span></div>
              <span className={`status-badge status-${document.status}`}><i />{statusNames[document.status] || document.status}</span>
              <span className="document-date">{new Date(document.createdAt).toLocaleDateString('ja-JP')}</span>
              {document.error && <span className="document-error" title={document.error}><AlertCircle size={15} /></span>}
            </article>
          ))}
          {!visibleDocuments.length && <div className="empty-state"><FileText size={25} /><strong>{query ? '文書が見つかりません' : 'まだ文書がありません'}</strong><span>{query ? '別のキーワードで検索してください。' : '作業標準書やFAQを登録してナレッジを始めましょう。'}</span></div>}
        </div>
      </section>
    </div>
  );
}
