import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright end-to-end configuration.
 *
 * These tests exercise the app as a whole through a real browser, complementing
 * the Vitest unit/component suite (which lives under `src/**` and is matched by a
 * separate glob). E2E specs live in `e2e/` so the two runners never collide.
 *
 * The app is local-first: book/chapter CRUD runs entirely in-browser against
 * sql.js persisted to IndexedDB, so no backend is required. The only external
 * boundaries — OpenAI (AI review) and Google Drive/OAuth (cloud sync) — are
 * intercepted per-test by the fixtures in `e2e/fixtures/`, keeping runs hermetic.
 */
export default defineConfig({
  testDir: 'e2e',
  // Fail the build on CI if a stray `test.only` is committed.
  forbidOnly: !!process.env.CI,
  // The app self-isolates through fresh browser contexts, so tests are safe to
  // parallelize locally. CI keeps retries to smooth over first-run flakiness.
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',

  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Boot the Vite dev server for the tests. Locally we reuse an already-running
  // server if present; CI always starts a fresh one.
  webServer: {
    command: 'pnpm dev --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // A dummy Google client id is enough to enable the cloud-sync UI
    // (`hasCloudSync()` only checks that an id is configured). The real OAuth
    // token client and Drive endpoints are stubbed by the network fixtures, so
    // no valid credential is ever needed.
    env: {
      VITE_GOOGLE_CLIENT_ID: 'e2e-test-client-id.apps.googleusercontent.com',
    },
  },
})
