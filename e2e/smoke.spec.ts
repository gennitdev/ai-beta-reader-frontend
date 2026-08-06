import { test, expect } from './fixtures/network'

/**
 * Scaffolding smoke test.
 *
 * Verifies the Playwright + Vite webServer plumbing works end to end: the dev
 * server boots, the app mounts, and the SPA renders without a hard error. It
 * asserts nothing about specific features — the critical-flow specs added in
 * later phases do that. If this fails, the harness itself is broken.
 *
 * Imports the extended `test` so the autouse network guard applies here too,
 * keeping even the smoke test hermetic (no real Google GIS load on boot).
 */
test('app boots and mounts', async ({ page }) => {
  const pageErrors: Error[] = []
  page.on('pageerror', (err) => pageErrors.push(err))

  await page.goto('/')

  // The Vue app mounts into #app; wait for it to have real content.
  const app = page.locator('#app')
  await expect(app).not.toBeEmpty()

  // No uncaught exceptions during initial boot (DB init, router, etc.).
  expect(pageErrors, `Uncaught errors on boot:\n${pageErrors.map((e) => e.message).join('\n')}`).toEqual([])
})
