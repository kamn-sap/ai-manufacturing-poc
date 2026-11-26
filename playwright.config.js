import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173',
    video: 'on',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: '../node_modules/.bin/vite --host 127.0.0.1 --config ../vite.config.js',
    cwd: 'frontend',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI || process.env.PLAYWRIGHT_REUSE_SERVER === '1',
    timeout: 60_000,
  },
});
