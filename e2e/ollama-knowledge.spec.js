import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const model = process.env.OLLAMA_MODEL || 'gemma3:4b';

const scenarios = [
  {
    name: '異音・振動の異常対応',
    fileName: 'ollama-noise-work-instruction.md',
    fixturePath: '../fixtures/ollama-noise-work-instruction.md',
    section: '異音が発生した場合',
    question: '設備で異音や異常な振動が発生した際の初動と、再起動できる条件を教えてください。',
    expectedTerms: /(?=.*緊急停止)(?=.*設備責任者)(?=.*再起動)(?=.*原因が特定)/,
  },
  {
    name: '始業前の確認項目',
    fileName: 'ollama-startup-work-instruction.md',
    fixturePath: '../fixtures/ollama-startup-work-instruction.md',
    section: '始業前確認',
    question: '始業前の確認で、解除されている必要があるものは何ですか？',
    expectedTerms: /(?=.*非常停止ボタン)(?=.*解除)/,
    forbiddenStepTerms: /evidence|抽出|分析/i,
    forbiddenSafetyTerms: /危険な状態|危険性/,
  },
  {
    name: '清掃・点検時の安全措置',
    fileName: 'ollama-safety-work-instruction.md',
    fixturePath: '../fixtures/ollama-safety-work-instruction.md',
    section: '安全上の注意',
    question: '点検や清掃を始める前に必要な安全措置は何ですか？',
    expectedTerms: /(?=.*電源を遮断)(?=.*ロックアウト)(?=.*作業標準書)/,
  },
];

test.describe('Ollama Gemma 3 4B knowledge E2E', () => {
  test.skip(!process.env.OLLAMA_E2E, 'Set OLLAMA_E2E=1 to run real-model E2E scenarios');
  test.describe.configure({ mode: 'serial' });

  for (const scenario of scenarios) {
    test(scenario.name, async ({ page }) => {
      test.setTimeout(180_000);
      const documentContent = readFileSync(new URL(scenario.fixturePath, import.meta.url), 'utf8');

      await page.goto('/');
      await page.getByLabel('ユーザー名').fill('operator');
      await page.getByLabel('パスワード').fill('change-me');
      await page.getByRole('button', { name: 'ログイン' }).click();
      await page.getByRole('link', { name: '文書ライブラリ' }).click();
      await page.locator('input[type="file"]').setInputFiles({
        name: scenario.fileName,
        mimeType: 'text/markdown',
        buffer: Buffer.from(documentContent),
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
          registeredDocument: {
            fileName: scenario.fileName,
            content: documentContent,
          },
          question: scenario.question,
          elapsedMs,
          answer: modelAnswer.answer,
          steps: modelAnswer.steps,
          safetyNotes: modelAnswer.safetyNotes,
          citations: modelAnswer.citations,
        }, null, 2)),
        contentType: 'application/json',
      });

      expect(modelAnswer.answer).toMatch(scenario.expectedTerms);
      expect(new Set(modelAnswer.citations.map((item) => item.documentName))).toEqual(new Set([scenario.fileName]));
      expect(citation?.section).toBe(scenario.section);
      if (scenario.forbiddenStepTerms) {
        expect(modelAnswer.steps.join('\n')).not.toMatch(scenario.forbiddenStepTerms);
      }
      if (scenario.forbiddenSafetyTerms) {
        expect(modelAnswer.safetyNotes.join('\n')).not.toMatch(scenario.forbiddenSafetyTerms);
      }

      const answerCard = page.locator('.answer-summary');
      await expect(answerCard).toBeVisible();
      await expect(answerCard).toContainText(scenario.expectedTerms);
      await expect(page.locator('.thinking')).toHaveCount(0);
      await answerCard.scrollIntoViewIfNeeded();
      await expect(answerCard).toBeInViewport();
      await test.info().attach('gemma-result-screen.png', {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
      await test.info().attach('gemma-answer-card.png', {
        body: await page.locator('.answer-card').screenshot(),
        contentType: 'image/png',
      });
      await page.waitForTimeout(2_000);
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
