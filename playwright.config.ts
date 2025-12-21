import { defineConfig } from '@playwright/test';

export default defineConfig({
  // This repo keeps specs under `web-test/` and `lp_test/` (there is no `./tests` folder).
  testDir: '.',
  testMatch: ['**/*.spec.ts'],
  testIgnore: ['**/node_modules/**', '**/test-results/**'],
  retries: process.env.CI ? 2 : 0,
  // Be gentle to production websites and avoid flakiness from parallel runs.
  workers: process.env.CI ? 2 : 1,
  use: {
    // Headless is significantly more stable on Windows for CI-like runs.
    // Use `npm run test:headed` when you want to watch the browser.
    headless: true,
    viewport: { width: 1280, height: 720 },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  reporter: [
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results.json' }],
    ['list'],
  ],
});
