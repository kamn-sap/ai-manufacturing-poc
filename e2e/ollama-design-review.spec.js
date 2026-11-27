import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const model = process.env.OLLAMA_MODEL || 'gemma3:4b';
const documentContent = readFileSync(new URL('../fixtures/ollama-design-review.md', import.meta.url), 'utf8');
const evidenceSections = ['検査判定', '承認フロー', '履歴記録'];

test.describe('Ollama Gemma 3 4B document library and design review E2E', () => {
  test.skip(!process.env.OLLAMA_E2E, 'Set OLLAMA_E2E=1 to run real-model E2E scenarios');

  test('registers a design document, reviews it, and records a human decision', async ({ page }) => {
    test.setTimeout(300_000);
    const fileName = `ollama-design-review-${Date.now()}.md`;

    await page.goto('/');
    await page.getByLabel('ユーザー名').fill('operator');
    await page.getByLabel('パスワード').fill('change-me');
    await page.getByRole('button', { name: 'ログイン' }).click();
    await expect(page.getByRole('heading', { name: 'ナレッジアシスタント' })).toBeVisible();

    await page.getByRole('link', { name: '文書ライブラリ' }).click();
    await page.getByLabel('文書の種別').selectOption('design');
    const uploadResponsePromise = page.waitForResponse((response) => (
      new URL(response.url()).pathname === '/api/knowledge/upload-url'
      && response.request().method() === 'POST'
    ));
    await page.locator('input[type="file"]').setInputFiles({
      name: fileName,
      mimeType: 'text/markdown',
      buffer: Buffer.from(documentContent),
    });
    const uploadResponse = await uploadResponsePromise;
    expect(uploadResponse.ok()).toBeTruthy();
    const { document } = await uploadResponse.json();
    expect(document.kind).toBe('design');

    const documentRow = page.locator(`.document-row[id="${document.id}"]`);
    await expect(documentRow).toBeVisible();
    await expect(documentRow).toContainText(fileName);
    await expect(documentRow).toContainText('設計書');
    await expect(documentRow.getByText('利用可能')).toBeVisible({ timeout: 150_000 });
    await documentRow.scrollIntoViewIfNeeded();
    await test.info().attach('ollama-document-library.json', {
      body: Buffer.from(JSON.stringify({
        model,
        registeredDocument: {
          id: document.id,
          fileName,
          kind: document.kind,
          content: documentContent,
        },
        status: 'ready',
      }, null, 2)),
      contentType: 'application/json',
    });
    await test.info().attach('ollama-document-library.png', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });

    await page.getByRole('link', { name: '設計レビュー' }).click();
    const reviewDocument = page.locator('.review-doc-option').filter({ hasText: fileName });
    await expect(reviewDocument).toBeVisible();
    await reviewDocument.getByText(fileName, { exact: true }).click();
    await expect(reviewDocument.locator('input[type="checkbox"]')).toBeChecked();

    const startedAt = performance.now();
    const analysisResponsePromise = page.waitForResponse((response) => {
      const { pathname } = new URL(response.url());
      return pathname.startsWith('/api/review/')
        && pathname.endsWith('/analyze')
        && response.request().method() === 'POST';
    });
    await page.getByRole('button', { name: 'レビューを実行' }).click();
    const analysisResponse = await analysisResponsePromise;
    const analysisResult = await analysisResponse.json();
    const elapsedMs = Math.round(performance.now() - startedAt);
    await test.info().attach('ollama-design-review.json', {
      body: Buffer.from(JSON.stringify({
        model,
        registeredDocument: { fileName, content: documentContent },
        elapsedMs,
        session: analysisResult.session,
        findings: analysisResult.findings,
      }, null, 2)),
      contentType: 'application/json',
    });

    expect(analysisResponse.ok()).toBeTruthy();
    expect(analysisResult.session.status).toBe('analyzed');
    expect(analysisResult.session.perspectives.length).toBeGreaterThan(0);
    expect(analysisResult.findings.length).toBeGreaterThan(0);
    for (const finding of analysisResult.findings) {
      expect(finding.title.trim()).not.toBe('');
      expect(finding.description.trim()).not.toBe('');
      expect(finding.qualityRisk.trim()).not.toBe('');
      expect(finding.testPoint.trim()).not.toBe('');
      expect(finding.evidence.documentId).toBe(document.id);
      expect(finding.evidence.documentName).toBe(fileName);
      expect(evidenceSections).toContain(finding.evidence.section);
      expect(finding.evidence.excerpt.trim()).not.toBe('');
      expect(documentContent).toContain(finding.evidence.excerpt);
    }

    await expect(page.getByRole('heading', { name: /レビュー結果/ })).toBeVisible();
    await expect(page.locator('.finding-card')).toHaveCount(analysisResult.findings.length);
    const firstFinding = analysisResult.findings[0];
    const firstFindingCard = page.locator('.finding-card').first();
    await expect(firstFindingCard.getByRole('heading', { name: firstFinding.title })).toBeVisible();
    await expect(firstFindingCard).toContainText(firstFinding.evidence.excerpt);
    await firstFindingCard.scrollIntoViewIfNeeded();
    await test.info().attach('ollama-design-review-result.png', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });

    const decisionResponsePromise = page.waitForResponse((response) => (
      new URL(response.url()).pathname === `/api/review/findings/${firstFinding.id}`
      && response.request().method() === 'PATCH'
    ));
    await firstFindingCard.getByRole('button', { name: '採用' }).click();
    const decisionResponse = await decisionResponsePromise;
    expect(decisionResponse.ok()).toBeTruthy();
    const { finding: decidedFinding } = await decisionResponse.json();
    expect(decidedFinding.disposition).toBe('accepted');
    await test.info().attach('ollama-design-review-decision.json', {
      body: Buffer.from(JSON.stringify({
        findingId: decidedFinding.id,
        disposition: decidedFinding.disposition,
        reviewedAt: decidedFinding.reviewedAt,
      }, null, 2)),
      contentType: 'application/json',
    });
    await expect(firstFindingCard.getByText('人による判断を記録しました')).toBeVisible();
    await test.info().attach('ollama-design-review-decision.png', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await page.waitForTimeout(2_000);
  });
});
