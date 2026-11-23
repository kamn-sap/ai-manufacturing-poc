import { expect, test } from '@playwright/test';

const accounts = [
  { username: 'operator', password: 'operator-secret', token: 'operator-token' },
  { username: 'reviewer', password: 'reviewer-secret', token: 'reviewer-token' },
];

test('keeps separate authenticated sessions for multiple users', async ({ browser }) => {
  const contexts = [];
  const sessions = [];
  try {
    for (const account of accounts) {
      const context = await browser.newContext();
      contexts.push(context);
      const page = await context.newPage();
      const protectedTokens = [];
      await context.route('**/api/**', async (route) => {
        const url = new URL(route.request().url());
        const method = route.request().method();
        if (url.pathname === '/api/auth/login') {
          const credentials = route.request().postDataJSON();
          if (credentials.username === account.username && credentials.password === account.password) {
            return route.fulfill({ json: { token: account.token, username: account.username } });
          }
          return route.fulfill({ status: 401, json: { error: 'ユーザー名またはパスワードが違います。' } });
        }
        if (url.pathname === '/api/knowledge/ask' && method === 'POST') {
          protectedTokens.push(route.request().headers().authorization);
          return route.fulfill({
            json: {
              answer: '該当資料を確認できません。',
              steps: [],
              safetyNotes: [],
              similarCases: [],
              citations: [],
            },
          });
        }
        return route.fulfill({ status: 404, json: { error: 'Unexpected test request' } });
      });

      await page.goto('/');
      await page.getByLabel('ユーザー名').fill(account.username);
      await page.getByLabel('パスワード').fill(account.password);
      await page.getByRole('button', { name: 'ログイン' }).click();
      await expect(page.getByText(account.username, { exact: true })).toBeVisible();
      await page.getByRole('textbox', { name: '質問を入力' }).fill('ログインユーザーの認証を確認');
      await page.getByRole('button', { name: '質問する' }).click();
      await expect.poll(() => protectedTokens).toContain(`Bearer ${account.token}`);
      sessions.push({ account, page });
    }

    await sessions[0].page.getByRole('button', { name: 'ログアウト' }).click();
    await expect(sessions[0].page.getByRole('button', { name: 'ログイン' })).toBeVisible();
    await expect(sessions[1].page.getByText('reviewer', { exact: true })).toBeVisible();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
