import { test, expect } from './fixtures/network'
import { createBookWithChapter, clearLocalData } from './fixtures/helpers'

/**
 * Cloud sync + encryption round-trip.
 *
 * This is the flow the codebase-health review flagged as highest-risk: a bug in
 * backup/restore or the encryption layer means silent data loss. These tests
 * exercise the real user path (author data → back up → wipe → restore) through
 * the actual UI, with only the Google OAuth token client and Drive HTTP
 * endpoints stubbed. Encryption, gzip, and the SQLite import/export all run for
 * real, so the round-trip genuinely proves data survives.
 */

const PASSWORD = 'correct horse battery staple'
// A distinctive string that must NOT appear in the uploaded (encrypted) blob and
// MUST reappear after restore.
const MARKER = 'ZEPHYR-ROUNDTRIP-MARKER-8571'

// Canonical backup/restore builds and validates two complete ZIP bundles. Leave
// enough headroom for that work when the full E2E suite runs in parallel.
test.describe.configure({ timeout: 60_000 })

test('backup → wipe → restore preserves book and chapter data', async ({ page, drive }) => {
  // --- Seed: author a book + chapter through the UI ---
  const { chapterUrl } = await createBookWithChapter(page, {
    bookTitle: 'Sync Saga',
    bookId: 'sync-saga',
    chapterTitle: 'Chapter One',
    chapterText: `${MARKER} — the opening line of the very first chapter.`,
  })

  // --- Back up to (stubbed) Google Drive ---
  await page.goto('/settings')
  await page.locator('#cloud-password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Backup to Google Drive' }).click()
  await expect(page.getByText('Backup saved to Google Drive.')).toBeVisible()

  // The uploaded blob must be real ciphertext: compressed+encrypted, never the
  // plaintext marker. This is what makes "encrypted backup" a verified claim.
  const blob = drive.getBackup()
  expect(blob, 'a backup file should have been uploaded').toBeTruthy()
  // The canonical ZIP is encrypted directly. The format version is
  // deliberately matched loosely (WC1:, WC2:, …) so the test tracks the app's
  // real ciphertext prefix rather than pinning one crypto revision.
  expect(blob).toMatch(/^WC\d+:/)
  expect(blob, 'plaintext must not leak into the backup').not.toContain(MARKER)

  // --- Wipe all local data so any restored content must come from the backup ---
  await clearLocalData(page)
  await page.goto('/books')
  await expect(page.getByText('Sync Saga')).toHaveCount(0)

  // --- Restore from (stubbed) Google Drive ---
  page.once('dialog', (dialog) => dialog.accept()) // confirm() before restore
  await page.goto('/settings')
  await page.locator('#cloud-password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Restore from Backup' }).click()
  await expect(page.getByText('Backup restored from Google Drive.')).toBeVisible()

  // --- Verify the data came back intact ---
  await page.goto('/books')
  await expect(page.getByText('Sync Saga')).toBeVisible()

  await page.goto(chapterUrl)
  // The reader renders both desktop and mobile layouts into the DOM (only one is
  // shown at a given viewport), so the marker matches more than once; assert the
  // visible copy is shown.
  await expect(page.getByText(MARKER).filter({ visible: true })).toBeVisible()

  // No un-mocked external calls happened during the whole flow.
  expect(drive.hasBackup()).toBe(true)
})

test('restore with the wrong password fails without destroying anything', async ({ page, drive }) => {
  await createBookWithChapter(page, {
    bookTitle: 'Guarded Tome',
    bookId: 'guarded-tome',
    chapterTitle: 'Only Chapter',
    chapterText: `${MARKER} — content that must never be silently lost.`,
  })

  await page.goto('/settings')
  await page.locator('#cloud-password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Backup to Google Drive' }).click()
  await expect(page.getByText('Backup saved to Google Drive.')).toBeVisible()
  expect(drive.hasBackup()).toBe(true)

  // Attempt a restore with the wrong password.
  page.once('dialog', (dialog) => dialog.accept())
  await page.locator('#cloud-password').fill('this-is-not-the-password')
  await page.getByRole('button', { name: 'Restore from Backup' }).click()

  // The app should report an incorrect-password error rather than corrupt or
  // wipe the existing local data.
  await expect(page.getByText(/incorrect password/i)).toBeVisible()

  // Local data is still intact.
  await page.goto('/books')
  await expect(page.getByText('Guarded Tome')).toBeVisible()
})
