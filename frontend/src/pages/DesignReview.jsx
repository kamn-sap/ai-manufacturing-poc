import { useEffect, useState } from 'react';
import { AlertTriangle, Check, ChevronRight, ClipboardCheck, FileText, FlaskConical, Shield, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
import { api, jsonBody } from '../api';

export default function DesignReview() {
  const [documents, setDocuments] = useState([]);
  const [selected, setSelected] = useState([]);
  const [session, setSession] = useState(null);
  const [findings, setFindings] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editId, setEditId] = useState('');
  const [editText, setEditText] = useState('');

  useEffect(() => {
    api('/knowledge').then((result) => setDocuments(result.documents)).catch((requestError) => setError(requestError.message));
  }, []);

  function toggle(id) {
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  async function analyze() {
    if (!selected.length) return;
    setBusy(true);
    setError('');
    setAnalysis(null);
    setFindings([]);
    try {
      const { session: created } = await api('/review/sessions', { method: 'POST', body: jsonBody({ documentIds: selected }) });
      setSession(created);
      const result = await api(`/review/${created.id}/analyze`, { method: 'POST', body: jsonBody({}) });
      setSession(result.session);
      setFindings(result.findings);
      setAnalysis(result.session);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function disposition(id, value, text) {
    try {
      const { finding } = await api(`/review/findings/${id}`, {
        method: 'PATCH',
        body: jsonBody({ disposition: value, ...(text ? { editedText: text } : {}) }),
      });
      setFindings((current) => current.map((item) => item.id === id ? finding : item));
      setEditId('');
      setEditText('');
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  const readyDocuments = documents.filter((document) => document.status === 'ready' && document.kind === 'design');
  const reviewedCount = findings.filter((item) => item.disposition !== 'pending').length;

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div><p className="eyebrow">AI-ASSISTED QUALITY</p><h1>設計レビュー</h1><p className="muted">設計書から確認観点と指摘候補を抽出します。採否は必ず人が判断します。</p></div>
        <span className="review-mode"><Sparkles size={15} />候補生成 · ローカルLLM</span>
      </div>
      <div className="review-banner"><div className="banner-shield"><Shield size={20} /></div><div><strong>AIは「指摘候補」を提示します</strong><span>出力は確定指摘ではありません。根拠を確認し、人が採用・却下・修正を記録してください。</span></div><span className="human-review-tag">HUMAN REVIEW</span></div>

      <section className="panel review-setup">
        <div className="panel-title-row"><div><div className="step-label"><span>01</span> REVIEW SCOPE</div><h2>レビュー対象を選択</h2><p className="muted">取り込み済みの設計文書から最大10件を選択します。</p></div><span className="selection-count">{selected.length} 件選択中</span></div>
        <div className="review-doc-list">
          {readyDocuments.map((document) => (
            <label key={document.id} className={`review-doc-option ${selected.includes(document.id) ? 'checked' : ''}`}>
              <input type="checkbox" checked={selected.includes(document.id)} onChange={() => toggle(document.id)} />
              <span className="checkbox-custom"><Check size={13} /></span><span className="file-icon"><FileText size={17} /></span>
              <span className="review-doc-name"><strong>{document.fileName}</strong><small>{document.kind} · v{document.version}</small></span><ChevronRight size={16} className="review-chevron" />
            </label>
          ))}
          {!readyDocuments.length && <div className="empty-state compact"><FileText size={23} /><strong>レビューできる文書がありません</strong><span>文書ライブラリで設計書を登録し、取り込み完了をお待ちください。</span></div>}
        </div>
        <div className="review-action"><div className="review-action-note"><FlaskConical size={16} />登録済み設計文書をローカルLLMで分析します。</div><button className="button button-primary" onClick={analyze} disabled={!selected.length || busy}>{busy ? <><span className="button-spinner" />分析中…</> : <><Sparkles size={16} />レビューを実行</>}</button></div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>

      {analysis && (
        <div className="analysis-results">
          <div className="results-heading"><div><div className="step-label"><span>02</span> REVIEW FINDINGS</div><h2>レビュー結果 <span className="candidate-count">{findings.length} 候補</span></h2></div><div className="review-progress"><span>{reviewedCount}/{findings.length} 件を確認</span><div className="progress-track"><i style={{ width: `${findings.length ? reviewedCount / findings.length * 100 : 0}%` }} /></div></div></div>
          {!!analysis.perspectives?.length && <section className="perspective-strip"><span>確認観点</span>{analysis.perspectives.map((item, index) => <span className="perspective-chip" key={item}><i>{String(index + 1).padStart(2, '0')}</i>{item}</span>)}</section>}
          {!!analysis.qualityRisks?.length && <section className="risk-strip"><div><AlertTriangle size={17} /><strong>品質リスク</strong></div>{analysis.qualityRisks.map((risk, index) => <p key={index}>{risk}</p>)}</section>}
          {!!analysis.testPoints?.length && <section className="test-strip"><div><ClipboardCheck size={17} /><strong>テスト観点</strong></div>{analysis.testPoints.map((point, index) => <p key={index}><Check size={13} />{point}</p>)}</section>}
          <div className="finding-list">
            {findings.map((finding, index) => (
              <article className={`finding-card disposition-${finding.disposition}`} key={finding.id}>
                <div className="finding-top"><span className="finding-index">{String(index + 1).padStart(2, '0')}</span><span className="finding-category">{finding.category}</span><span className="candidate-label">指摘候補</span><span className={`disposition-label disposition-${finding.disposition}`}>{({ pending: '未確認', accepted: '採用', rejected: '却下', edited: '修正' })[finding.disposition]}</span></div>
                <h3>{finding.title}</h3>
                <p className="finding-description">{finding.description}</p>
                <div className="finding-risk"><AlertTriangle size={15} /><div><strong>想定される品質リスク</strong><span>{finding.qualityRisk}</span></div></div>
                <div className="finding-test"><ClipboardCheck size={15} /><div><strong>テスト観点</strong><span>{finding.testPoint}</span></div></div>
                <div className="evidence-card"><div className="evidence-title"><FileText size={14} /><strong>根拠</strong><span>{finding.evidence.documentName} · {finding.evidence.section}{finding.evidence.page ? ` · ${finding.evidence.page}ページ` : ''}</span></div><p>{finding.evidence.excerpt}</p></div>
                {editId === finding.id ? <div className="edit-finding"><textarea aria-label="指摘候補を修正" value={editText} onChange={(event) => setEditText(event.target.value)} /><div><button className="button button-secondary" onClick={() => setEditId('')}>キャンセル</button><button className="button button-primary" disabled={!editText.trim()} onClick={() => disposition(finding.id, 'edited', editText)}>修正を記録</button></div></div> : finding.disposition === 'pending' ? (
                  <div className="finding-actions"><span>この候補をどう扱いますか？</span><button className="decision-button accept" onClick={() => disposition(finding.id, 'accepted')}><ThumbsUp size={15} />採用</button><button className="decision-button revise" onClick={() => { setEditId(finding.id); setEditText(finding.description); }}>修正</button><button className="decision-button reject" onClick={() => disposition(finding.id, 'rejected')}><ThumbsDown size={15} />却下</button></div>
                ) : <div className="decision-recorded"><Check size={14} />人による判断を記録しました · {new Date(finding.reviewedAt).toLocaleString('ja-JP')}</div>}
              </article>
            ))}
            {!findings.length && <div className="empty-state"><Check size={24} /><strong>指摘候補はありません</strong><span>選択文書から候補が生成されませんでした。確認観点に沿って人がレビューしてください。</span></div>}
          </div>
          {!!analysis.similarCases?.length && <section className="panel similar-panel"><h3><FileText size={16} />類似箇所</h3>{analysis.similarCases.map((item, index) => <p key={index}><strong>{item.documentName} · {item.section}</strong><span>{item.excerpt}</span></p>)}</section>}
          <p className="review-footer-note"><Shield size={14} /> AI生成結果はレビュー候補です。採用の判断と最終的な設計承認は担当者が行ってください。</p>
        </div>
      )}
      {session && !analysis && <span className="visually-hidden">レビューID: {session.id}</span>}
      {!analysis && <div className="review-guidance"><span className="guidance-icon"><ClipboardCheck size={18} /></span><div><strong>レビューの進め方</strong><p>①対象文書を選択　›　②AIが候補を生成　›　③根拠を確認して人が記録</p></div></div>}
    </div>
  );
}
