import { useState } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router';
import { BookOpenCheck, Boxes, ClipboardCheck, Factory, LogOut, MessageSquareText, ShieldCheck } from 'lucide-react';
import { api, jsonBody } from '../api';
import DocumentLibrary from './DocumentLibrary.jsx';
import KnowledgeAssistant from './KnowledgeAssistant.jsx';
import DesignReview from './DesignReview.jsx';

function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const session = await api('/auth/login', { method: 'POST', body: jsonBody({ username, password }) });
      localStorage.setItem('accessToken', session.token);
      localStorage.setItem('authenticatedUsername', session.username);
      onLogin(session.username);
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-screen">
      <section className="login-card">
        <div className="brand-mark"><Factory size={22} /></div>
        <p className="eyebrow">MONO · MANUFACTURING INTELLIGENCE</p>
        <h1>現場の知恵を、<br />確かな判断へ。</h1>
        <p className="muted">ナレッジ検索と設計レビュー支援にサインインします。</p>
        <form className="login-form" onSubmit={submit}>
          <label>ユーザー名<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>
          <label>パスワード<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary full-width" disabled={busy}>{busy ? '確認中…' : 'ログイン'}</button>
        </form>
        <div className="login-note"><ShieldCheck size={16} /> 安全に関わる判断は、承認済み原文の確認が必要です。</div>
      </section>
    </main>
  );
}

function ProtectedApp({ username, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const initials = username.slice(0, 2).toLocaleUpperCase() || 'U';
  const links = [
    { to: '/knowledge', label: 'ナレッジアシスタント', icon: MessageSquareText },
    { to: '/documents', label: '文書ライブラリ', icon: BookOpenCheck },
    { to: '/review', label: '設計レビュー', icon: ClipboardCheck },
  ];

  function logout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('authenticatedUsername');
    onLogout();
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <div className="brand"><div className="brand-mark"><Factory size={20} /></div><div><strong>MONO</strong><small>FACTORY INTELLIGENCE</small></div></div>
        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace-card"><span className="workspace-icon"><Boxes size={17} /></span><span>作業ナレッジ基盤</span><span className="status-dot" /></div>
        <div className="nav-label">ワークスペース</div>
        <nav className="primary-nav">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} onClick={() => setMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="environment-tag"><span /> LOCAL LLM · TEST MODE</div>
          <button className="nav-link logout-button" onClick={logout}><LogOut size={18} />ログアウト</button>
          <div className="user-card"><div className="avatar">{initials}</div><div><strong>{username}</strong><small>ナレッジ利用者</small></div><span className="user-online" /></div>
        </div>
      </aside>
      {menuOpen && <button className="scrim" aria-label="メニューを閉じる" onClick={() => setMenuOpen(false)} />}
      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" aria-label="メニュー" onClick={() => setMenuOpen(!menuOpen)}>☰</button>
          <div className="breadcrumb"><span>MONO</span><span className="crumb-slash">/</span><strong>現場支援ツール</strong></div>
          <div className="topbar-right"><span className="connection-pill"><span />システム稼働中</span><div className="avatar avatar-small">{initials}</div></div>
        </header>
        <div className="page-content">
          <Routes>
            <Route path="/knowledge" element={<KnowledgeAssistant />} />
            <Route path="/documents" element={<DocumentLibrary />} />
            <Route path="/review" element={<DesignReview />} />
            <Route path="*" element={<Navigate to="/knowledge" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(Boolean(localStorage.getItem('accessToken')));
  const [username, setUsername] = useState(localStorage.getItem('authenticatedUsername') || '');
  return authenticated
    ? <ProtectedApp
      username={username}
      onLogout={() => {
        setAuthenticated(false);
        setUsername('');
      }}
    />
    : <Routes><Route path="*" element={<Login onLogin={(authenticatedUsername) => {
      setUsername(authenticatedUsername);
      setAuthenticated(true);
    }} />} /></Routes>;
}
