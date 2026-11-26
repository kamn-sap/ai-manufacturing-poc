import { useState } from 'react';
import { ArrowUp, BookOpen, Check, ClipboardList, FileSearch, Lightbulb, ShieldAlert, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
import { api, jsonBody } from '../api';

const starters = ['設備の異音がした場合の確認手順は？', '作業前に確認する安全項目を教えて', '過去のトラブル事例を確認したい'];

export default function KnowledgeAssistant() {
  const [question, setQuestion] = useState('');
  const [conversation, setConversation] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState({});

  async function ask(value = question) {
    const prompt = value.trim();
    if (!prompt || busy) return;
    setConversation((items) => [...items, { question: prompt, answer: null }]);
    setQuestion('');
    setBusy(true);
    setError('');
    try {
      const answer = await api('/knowledge/ask', { method: 'POST', body: jsonBody({ question: prompt }) });
      setConversation((items) => items.map((item, index) => index === items.length - 1 ? { ...item, answer } : item));
    } catch (requestError) {
      setError(requestError.message);
      setConversation((items) => items.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  async function rate(index, helpful) {
    try {
      await api('/knowledge/feedback', {
        method: 'POST',
        body: jsonBody({ question: conversation[index].question, helpful }),
      });
      setFeedback((previous) => ({ ...previous, [index]: helpful }));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div><p className="eyebrow">FIELD KNOWLEDGE</p><h1>ナレッジアシスタント</h1><p className="muted">登録資料を根拠に、現場の疑問を確認できます。</p></div>
        <span className="ai-mode"><span /><Sparkles size={14} /> Ollama / Gemma 3 4B</span>
      </div>
      <div className="assistant-layout">
        <section className="chat-panel panel">
          <div className="chat-topline"><div className="assistant-avatar"><Sparkles size={18} /></div><div><strong>作業ナレッジアシスタント</strong><small><span className="online-dot" /> 資料検索モード</small></div><span className="evidence-mode"><FileSearch size={14} />根拠資料を優先</span></div>
          <div className="chat-scroll">
            {!conversation.length && (
              <div className="welcome-state">
                <div className="welcome-orb"><Lightbulb size={24} /></div>
                <p className="eyebrow">HOW CAN I HELP?</p><h2>現場の「知りたい」を、<br />登録資料から。</h2>
                <p>作業標準書・マニュアル・FAQを検索して回答します。回答には必ず引用元を表示します。</p>
                <div className="starter-grid">{starters.map((item) => <button key={item} onClick={() => ask(item)}>{item}<ArrowUp size={14} /></button>)}</div>
              </div>
            )}
            {conversation.map((item, index) => (
              <div className="conversation" key={`${item.question}-${index}`}>
                <div className="user-message"><div className="avatar avatar-small">OP</div><span>{item.question}</span></div>
                {item.answer ? (
                  <article className="answer-card">
                    <div className="answer-label"><span className="assistant-avatar mini"><Sparkles size={14} /></span><strong>回答</strong><span className="answer-source-count"><BookOpen size={13} />{item.answer.citations.length} 件の根拠</span></div>
                    <p className="answer-summary">{item.answer.answer}</p>
                    {!!item.answer.steps?.length && <div className="answer-section"><h3><ClipboardList size={15} />確認手順</h3><ol>{item.answer.steps.map((step, stepIndex) => <li key={stepIndex}>{step}</li>)}</ol></div>}
                    {!!item.answer.safetyNotes?.length && <div className="safety-box"><h3><ShieldAlert size={15} />安全上の注意</h3>{item.answer.safetyNotes.map((note, noteIndex) => <p key={noteIndex}>{note}</p>)}</div>}
                    {!!item.answer.similarCases?.length && <div className="answer-section"><h3><BookOpen size={15} />類似事例</h3>{item.answer.similarCases.map((example, exampleIndex) => <p className="similar-case" key={exampleIndex}>{example}</p>)}</div>}
                    {!item.answer.citations.length && <div className="no-evidence"><FileSearch size={16} />該当する引用元がありません。回答内容を推測で補完していません。</div>}
                    {!!item.answer.citations.length && <div className="citation-section"><h3><BookOpen size={15} />引用元</h3>{item.answer.citations.map((citation, citationIndex) => (
                      <a className="citation-card" href={`/documents#${citation.documentId}`} key={`${citation.documentId}-${citationIndex}`}>
                        <span className="citation-file"><BookOpen size={15} /></span><span className="citation-content"><strong>{citation.documentName}</strong><small>{citation.section}{citation.page ? ` · ${citation.page}ページ` : ''}</small><span>{citation.excerpt}</span></span><span className="citation-arrow">↗</span>
                      </a>
                    ))}</div>}
                    <div className="feedback-row"><span>この回答は役に立ちましたか？</span><button aria-label="役に立った" className={feedback[index] === true ? 'selected' : ''} onClick={() => rate(index, true)}><ThumbsUp size={15} /></button><button aria-label="役に立たなかった" className={feedback[index] === false ? 'selected' : ''} onClick={() => rate(index, false)}><ThumbsDown size={15} /></button>{feedback[index] !== undefined && <span className="feedback-thanks"><Check size={13} />記録しました</span>}</div>
                  </article>
                ) : <div className="thinking"><span /><span /><span />資料を照合しています…</div>}
              </div>
            ))}
            {error && <p className="form-error" role="alert">{error}</p>}
          </div>
          <form className="composer" onSubmit={(event) => { event.preventDefault(); ask(); }}>
            <input aria-label="質問を入力" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="設備の点検手順やトラブル対応を質問…" />
            <button className="send-button" disabled={!question.trim() || busy} aria-label="質問する"><ArrowUp size={18} /></button>
            <small>回答は登録資料に基づく参考情報です。安全作業は承認済みの原文を確認してください。</small>
          </form>
        </section>
        <aside className="assistant-aside">
          <section className="panel aside-panel"><div className="aside-heading"><div className="aside-icon"><BookOpen size={17} /></div><div><strong>回答の根拠</strong><small>Evidence first</small></div></div><p>回答には検索で見つかった資料だけを使用します。該当箇所がない場合、推測で補完しません。</p><div className="aside-rule"><Check size={14} />文書名と該当箇所を表示</div><div className="aside-rule"><Check size={14} />回答への評価を記録</div></section>
          <section className="safety-card"><div><ShieldAlert size={17} /><strong>安全に関する回答</strong></div><p>AIの回答だけで作業判断をしないでください。必ず承認済みの作業標準書と現場の安全手順を確認してください。</p><span>HUMAN VERIFICATION REQUIRED</span></section>
          <div className="privacy-note"><span className="privacy-dot" />ベクトル検索なし · 文書はAWS EmulatorのS3に保存</div>
        </aside>
      </div>
    </div>
  );
}
