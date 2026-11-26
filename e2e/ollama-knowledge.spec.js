import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const sample = readFileSync(new URL('../fixtures/work-instruction.md', import.meta.url), 'utf8');
const model = process.env.OLLAMA_MODEL || 'gemma3:4b';

const scenarios = [
  {
    name: '異音・振動の異常対応',
    fileName: 'ollama-noise-work-instruction.md',
    question: '設備から異音がした場合の対応を教えてください。',
    expectedTerms: /停止|止め|再起動|設備責任者/,
  },
  {
    name: '始業前の確認項目',
    fileName: 'ollama-startup-work-instruction.md',
    question: '始業前に非常停止ボタンがどの状態であることを確認しますか？',
    expectedTerms: /非常停止|解除/,
  },
  {
    name: '清掃・点検時の安全措置',
    fileName: 'ollama-safety-work-instruction.md',
    question: '点検や清掃を始める前に必要な安全措置は何ですか？',
    expectedTerms: /電源|遮断|ロックアウト|作業標準書/,
  },
];

test.describe('Ollama Gemma 3 4B knowledge E2E', () => {
  test.skip(!process.env.OLLAMA_E2E, 'Set OLLAMA_E2E=1 to run real-model E2E scenarios');
  test.describe.configure({ mode: 'serial' });

  for (const scenario of scenarios) {
    test(scenario.name, async ({ page }) => {
      test.setTimeout(180_000);

      await page.goto('/');
      await page.getByLabel('ユーザー名').fill('operator');
      await page.getByLabel('パスワード').fill('change-me');
      await page.getByRole('button', { name: 'ログイン' }).click();
      await page.getByRole('link', { name: '文書ライブラリ' }).click();
      await page.locator('input[type="file"]').setInputFiles({
        name: scenario.fileName,
        mimeType: 'text/markdown',
        buffer: Buffer.from(sample),
      });
      const documentRow = page.locator('.document-row').filter({ hasText: scenario.fileName });
      await expect(documentRow).toBeVisible();
      await expect(documentRow.getByText('利用可能')).toBeVisible({ timeout: 150_000 });

      await page.getByRole('link', { name: 'ナレッジアシスタント' }).click();
      await page.getByRole('textbox', { name: '質問を入力' }).fill(scenario.question);
      const startedAt = performance.now();
      const responsePromise = page.waitForResponse((response) => (
        new URL(response.url()).pathname === '/api/knowledge/ask'
        && response.request().method() === 'POST'
      ));
      await page.getByRole('button', { name: '質問する' }).click();
      const response = await responsePromise;
      expect(response.ok()).toBeTruthy();
      const modelAnswer = await response.json();
      const elapsedMs = Math.round(performance.now() - startedAt);
      const citation = modelAnswer.citations.find((item) => item.documentName === scenario.fileName);

      await test.info().attach('gemma-response.json', {
        body: Buffer.from(JSON.stringify({
          model,
          scenario: scenario.name,
          question: scenario.question,
          elapsedMs,
          answer: modelAnswer.answer,
          steps: modelAnswer.steps,
          safetyNotes: modelAnswer.safetyNotes,
          citations: modelAnswer.citations,
        }, null, 2)),
        contentType: 'application/json',
      });

      const answerCard = page.locator('.answer-summary');
      await expect(answerCard).toBeVisible();
      await expect(answerCard).toContainText(scenario.expectedTerms);
      await expect(page.getByRole('heading', { name: '引用元' })).toBeVisible();
      expect(citation).toBeDefined();
      const citationLink = page.locator('.citation-card')
        .filter({ hasText: scenario.fileName })
        .filter({ hasText: citation.section });
      await expect(citationLink)
        .toHaveAttribute('href', `/documents#${citation.documentId}`);
    });
  }
});
