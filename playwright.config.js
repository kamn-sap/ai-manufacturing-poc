import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173',
    viewport: { width: 1280, height: 720 },
    video: { mode: 'on', size: { width: 1280, height: 720 } },
  },
  webServer: {
    command: '../node_modules/.bin/vite --host 127.0.0.1 --config ../vite.config.js',
    cwd: 'frontend',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI || process.env.PLAYWRIGHT_REUSE_SERVER === '1',
    timeout: 60_000,
  },
});
