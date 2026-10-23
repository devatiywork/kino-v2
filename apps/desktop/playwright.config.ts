import { defineConfig } from '@playwright/test'

/**
 * E2E: the real Kino (debug core + Vite renderer) driven over CDP of its WebView2.
 * bun run e2e — from apps/desktop or the root. Windows only, like the app.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  // One Kino window at a time: each has a native video window and its own WebView2 browser
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  webServer: {
    command: 'bun run vite:dev',
    url: 'http://127.0.0.1:5181',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
