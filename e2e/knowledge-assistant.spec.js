import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const sample = readFileSync(new URL('../fixtures/work-instruction.md', import.meta.url), 'utf8');

test('registers a work instruction, asks a question, and shows its evidence', async ({ page }) => {
  let document;
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === '/api/auth/login') {
      return route.fulfill({ json: { token: 'test-token', username: 'operator' } });
    }
    if (url.pathname === '/api/knowledge' && method === 'GET') {
      return route.fulfill({ json: { documents: document ? [document] : [] } });
    }
    if (url.pathname === '/api/knowledge/upload-url') {
      document = {
        id: 'work-doc-1',
        fileName: 'work-instruction.md',
        kind: 'work-instruction',
        version: 1,
        status: 'uploading',
        createdAt: new Date().toISOString(),
      };
      return route.fulfill({ status: 201, json: { document, uploadUrl: 'http://mock-s3/upload', uploadHeaders: { 'Content-Type': 'text/markdown' } } });
    }
    if (url.pathname === '/api/knowledge/work-doc-1/complete') {
      document.status = 'ready';
      return route.fulfill({ status: 202, json: { document } });
    }
    if (url.pathname === '/api/knowledge/ask') {
      return route.fulfill({
        json: {
          answer: '異音が発生した場合は設備を停止し、設備責任者へ連絡してください。',
          steps: ['所定の停止手順に従います。', '原因が特定されるまで再起動しません。'],
          safetyNotes: ['承認済みの最新版作業標準書を確認してください。'],
          similarCases: [],
          citations: [{
            documentId: 'work-doc-1',
            documentName: 'work-instruction.md',
            section: '異音が発生した場合',
            page: 1,
            excerpt: sample.slice(sample.indexOf('運転中に異音'), sample.indexOf('## 安全上の注意')).trim(),
          }],
        },
      });
    }
    if (url.pathname === '/api/knowledge/feedback') {
      return route.fulfill({ status: 201, json: { recorded: true } });
    }
    return route.fulfill({ status: 404, json: { error: 'Unexpected test request' } });
  });
  await page.route('http://mock-s3/**', (route) => route.fulfill({ status: 200 }));

  await page.goto('/');
  await page.getByLabel('ユーザー名').fill('operator');
  await page.getByLabel('パスワード').fill('change-me');
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page.getByRole('heading', { name: 'ナレッジアシスタント' })).toBeVisible();
  await page.getByRole('link', { name: '文書ライブラリ' }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'work-instruction.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(sample),
  });
  await expect(page.getByText('work-instruction.md')).toBeVisible();
  await expect(page.getByText('利用可能')).toBeVisible();
  await page.getByRole('link', { name: 'ナレッジアシスタント' }).click();
  await page.getByRole('textbox', { name: '質問を入力' }).fill('異音が発生した場合の手順は？');
  await page.getByRole('button', { name: '質問する' }).click();

  await expect(page.getByText('異音が発生した場合は設備を停止し、設備責任者へ連絡してください。')).toBeVisible();
  await expect(page.getByRole('heading', { name: '引用元' })).toBeVisible();
  await expect(page.getByRole('link', { name: /異音が発生した場合/ })).toHaveAttribute('href', '/documents#work-doc-1');
});
