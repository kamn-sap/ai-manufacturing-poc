import { expect, test } from '@playwright/test';

test('analyzes a design and records a human decision on a finding candidate', async ({ page }) => {
  const document = {
    id: 'design-doc-1',
    fileName: 'pump-design.md',
    kind: 'design',
    version: 1,
    status: 'ready',
    createdAt: new Date().toISOString(),
  };
  let finding = {
    id: 'finding-1',
    title: '異常時の復帰条件',
    category: '安全性',
    description: '復旧後の警報解除方法を運用担当と確認してください。',
    qualityRisk: '復帰条件が不明確な場合、異常状態を誤って解除する可能性があります。',
    testPoint: '通信断から復旧した後の警報表示と解除条件を確認する。',
    disposition: 'pending',
    evidence: {
      documentId: document.id,
      documentName: document.fileName,
      section: '異常時の動作',
      page: 2,
      excerpt: '復旧後の警報解除方法は運用担当と確認します。',
    },
  };
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === '/api/auth/login') {
      return route.fulfill({ json: { token: 'test-token', username: 'operator' } });
    }
    if (url.pathname === '/api/knowledge' && method === 'GET') {
      return route.fulfill({ json: { documents: [document] } });
    }
    if (url.pathname === '/api/review/sessions') {
      return route.fulfill({ status: 201, json: { session: { id: 'session-1', documentIds: [document.id], status: 'created' } } });
    }
    if (url.pathname === '/api/review/session-1/analyze') {
      return route.fulfill({
        json: {
          session: {
            id: 'session-1',
            status: 'analyzed',
            perspectives: ['要求との整合性', '安全性'],
            qualityRisks: [finding.qualityRisk],
            testPoints: [finding.testPoint],
            similarCases: [],
          },
          findings: [finding],
        },
      });
    }
    if (url.pathname === '/api/review/findings/finding-1' && method === 'PATCH') {
      finding = { ...finding, disposition: route.request().postDataJSON().disposition, reviewedAt: new Date().toISOString() };
      return route.fulfill({ json: { finding } });
    }
    return route.fulfill({ status: 404, json: { error: 'Unexpected test request' } });
  });

  await page.goto('/');
  await page.getByLabel('ユーザー名').fill('operator');
  await page.getByLabel('パスワード').fill('change-me');
  await page.getByRole('button', { name: 'ログイン' }).click();
  await page.getByRole('link', { name: '設計レビュー' }).click();
  await page.getByText('pump-design.md', { exact: true }).click();
  await expect(page.getByRole('checkbox', { name: /pump-design\.md/ })).toBeChecked();
  await page.getByRole('button', { name: 'レビューを実行' }).click();
  await expect(page.getByText('異常時の復帰条件')).toBeVisible();
  await expect(page.getByText('指摘候補', { exact: true })).toBeVisible();
  await expect(page.getByText('根拠', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '採用' }).click();
  await expect(page.getByText('人による判断を記録しました')).toBeVisible();
});
