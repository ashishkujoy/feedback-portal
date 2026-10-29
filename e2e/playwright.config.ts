import { defineConfig, devices } from '@playwright/test';

/**
 * Runs inside e2e/compose.yml, in the web container's network: the app is on localhost, so the
 * production session cookie (Secure, `__Host-`) works over plain http.
 */
export default defineConfig({
  testDir: './tests',
  // The steps of the main path build on each other.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL: process.env['BASE_URL'] ?? 'http://localhost:8080',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
