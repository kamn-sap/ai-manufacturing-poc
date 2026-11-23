import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const outputDirectory = 'pages-site';
const e2eReportDirectory = `${outputDirectory}/e2e`;
mkdirSync(e2eReportDirectory, { recursive: true });

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function readAttribute(attributes, name) {
  const match = attributes.match(new RegExp(`\\b${name}="([^"]*)"`));
  return match ? match[1] : '';
}

function readUnitResults() {
  if (!existsSync('unit-results.xml')) return { tests: 0, failures: 0, cases: [] };
  const xml = readFileSync('unit-results.xml', 'utf8');
  const root = xml.match(/<testsuites\b([^>]*)>/) || xml.match(/<testsuite\b([^>]*)>/);
  const attributes = root?.[1] || '';
  const cases = [...xml.matchAll(/<testcase\b([^>]*)(?:\/>|>([\s\S]*?)<\/testcase>)/g)]
    .map(([, caseAttributes, body = '']) => ({
      name: readAttribute(caseAttributes, 'name') || 'テスト',
      suite: readAttribute(caseAttributes, 'classname'),
      status: /<(failure|error)\b/.test(body) ? 'failure' : /<skipped\b/.test(body) ? 'skipped' : 'success',
    }));
  return {
    tests: Number(readAttribute(attributes, 'tests')) || cases.length,
    failures: Number(readAttribute(attributes, 'failures')) + Number(readAttribute(attributes, 'errors')),
    cases,
  };
}

const unitResults = readUnitResults();
if (existsSync('unit-results.xml')) copyFileSync('unit-results.xml', `${outputDirectory}/unit-results.xml`);
if (existsSync('playwright-report')) cpSync('playwright-report', e2eReportDirectory, { recursive: true });

const statuses = {
  unit: process.env.UNIT_STATUS || 'skipped',
  lint: process.env.LINT_STATUS || 'skipped',
  cdk: process.env.CDK_STATUS || 'skipped',
  e2e: process.env.E2E_STATUS || 'skipped',
};
if (!existsSync(`${e2eReportDirectory}/index.html`)) {
  writeFileSync(`${e2eReportDirectory}/index.html`, `<!doctype html><html lang="ja"><meta charset="utf-8"><title>E2Eレポート</title><body><h1>E2Eレポートは生成されませんでした</h1><p>実行状態: ${escapeHtml(statuses.e2e)}</p><p>GitHub ActionsログでブラウザーのセットアップとE2E実行状況を確認してください。</p></body></html>`);
}
const labels = { success: '成功', failure: '失敗', skipped: '未実行' };
const badgeClass = (status) => status === 'success' ? 'success' : status === 'failure' ? 'failure' : 'skipped';
const testRows = unitResults.cases.map((testCase) => `
  <tr>
    <td>${escapeHtml(testCase.suite)}</td>
    <td>${escapeHtml(testCase.name)}</td>
    <td><span class="badge ${badgeClass(testCase.status)}">${labels[testCase.status]}</span></td>
  </tr>`).join('');
const commit = (process.env.GITHUB_SHA || 'local').slice(0, 7);
const runUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : '';

const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>検証結果 | MONO</title>
  <style>
    :root{font-family:Inter,"Noto Sans JP",system-ui,sans-serif;color:#1c2823;background:#f4f7f4;font-synthesis:none}
    *{box-sizing:border-box}body{margin:0;padding:40px 18px}.wrap{max-width:980px;margin:auto}
    header{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:26px}
    h1{font-size:28px;letter-spacing:-.04em;margin:5px 0}.eyebrow{font-size:10px;font-weight:700;letter-spacing:.14em;color:#368260}
    .meta{font-size:12px;color:#77837b}    .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px}
    .card,section{background:white;border:1px solid #e4eae5;border-radius:12px}
    .card{padding:18px}.card span:first-child{display:block;color:#78837c;font-size:12px}
    .badge{display:inline-flex;align-items:center;border-radius:30px;padding:5px 10px;font-weight:700;font-size:11px}
    .badge.success{color:#26734f;background:#e8f4ec}.badge.failure{color:#a5423c;background:#fbeceb}
    .badge.skipped{color:#7d817d;background:#eff1ef}.card .badge{margin-top:13px}
    section{padding:20px;margin-top:14px}h2{font-size:16px;margin:0 0 12px}
    .links{display:flex;flex-wrap:wrap;gap:10px}.link{display:inline-flex;align-items:center;padding:11px 14px;border:1px solid #dfe8e1;border-radius:8px;color:#276b4f;background:#f7fbf8;text-decoration:none;font-size:12px;font-weight:700}
    .link:hover{border-color:#76ae8d}.note{font-size:12px;color:#68756d;line-height:1.7}
    table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:9px 8px;border-top:1px solid #edf0ed}
    th{color:#78837c;font-weight:600}.foot{margin-top:17px;font-size:11px;color:#87928a}
    @media(max-width:800px){.cards{grid-template-columns:repeat(2,1fr)}}
    @media(max-width:600px){body{padding:24px 12px}header{display:block}.cards{grid-template-columns:1fr}.meta{margin-top:10px}section{padding:14px}table{font-size:10px}}
  </style>
</head>
<body><main class="wrap">
  <header><div><div class="eyebrow">MONO · QUALITY CHECKS</div><h1>アプリ検証結果</h1><div class="meta">Commit ${escapeHtml(commit)} · ${escapeHtml(new Date().toISOString())}</div></div>${runUrl ? `<a class="link" href="${escapeHtml(runUrl)}">GitHub Actions実行ログ</a>` : ''}</header>
  <div class="cards">
    <div class="card"><span>ユニットテスト</span><strong class="badge ${badgeClass(statuses.unit)}">${labels[statuses.unit] || '不明'} · ${unitResults.tests}件</strong></div>
    <div class="card"><span>Lint</span><strong class="badge ${badgeClass(statuses.lint)}">${labels[statuses.lint] || '不明'}</strong></div>
    <div class="card"><span>CDK合成</span><strong class="badge ${badgeClass(statuses.cdk)}">${labels[statuses.cdk] || '不明'}</strong></div>
    <div class="card"><span>Playwright E2E</span><strong class="badge ${badgeClass(statuses.e2e)}">${labels[statuses.e2e] || '不明'}</strong></div>
  </div>
  <section><h2>E2E結果と録画</h2><p class="note">Playwrightの詳細レポートでは、テストごとの実行結果・スクリーンショット・録画動画を参照できます。</p><div class="links"><a class="link" href="./e2e/index.html">E2Eレポートを開く（動画あり）</a>${unitResults.tests ? '<a class="link" href="./unit-results.xml">UT JUnit結果</a>' : ''}</div></section>
  <section><h2>ユニットテスト一覧</h2>${testRows ? `<table><thead><tr><th>Suite</th><th>テスト</th><th>結果</th></tr></thead><tbody>${testRows}</tbody></table>` : '<p class="note">ユニットテスト結果を取得できませんでした。Actionsログを確認してください。</p>'}</section>
  <p class="foot">レポートは各workflow実行時点の結果です。最新の実行ログはGitHub Actionsから確認してください。</p>
</main></body></html>`;

writeFileSync(`${outputDirectory}/index.html`, html);
