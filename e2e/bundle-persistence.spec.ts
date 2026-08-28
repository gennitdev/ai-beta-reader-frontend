import { test, expect } from './fixtures/network'
import { createBookWithChapter } from './fixtures/helpers'

test.describe.configure({ timeout: 90_000 })

test('full bundle Replace persists across restart with verified recovery outside the app database', async ({ page }) => {
  const marker = 'REAL-PERSISTENCE-BUNDLE-132'
  const original = await createBookWithChapter(page, {
    bookTitle: 'Persistent Original',
    bookId: 'persistent-original',
    chapterTitle: 'Durable Chapter',
    chapterText: `${marker} — content that must survive export and replacement.`,
  })

  await page.goto('/library-data')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export full library backup' }).click()
  const download = await downloadPromise
  const bundlePath = await download.path()
  expect(bundlePath, 'the browser should retain the downloaded bundle for re-import').toBeTruthy()

  await createBookWithChapter(page, {
    bookTitle: 'Replace Removes Me',
    bookId: 'replace-removes-me',
    chapterTitle: 'Temporary Chapter',
    chapterText: 'This book was created after the recovery point.',
  })

  await page.goto('/library-data')
  await page.locator('input[type="file"][accept*=".zip"]').setInputFiles(bundlePath as string)
  await expect(page.getByRole('button', { name: 'Prepare Replace library' })).toBeEnabled()
  await page.getByRole('button', { name: 'Prepare Replace library' }).click()
  await expect(page.getByText('Recovery bundle verified. Replace confirmation is now enabled.')).toBeVisible()

  const persistenceBeforeReplace = await page.evaluate(async () => {
    const names = ((await indexedDB.databases?.()) ?? []).flatMap((value) => value.name ? [value.name] : [])
    const recoveryCount = await new Promise<number>((resolve, reject) => {
      const request = indexedDB.open('beta-bot-recovery')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction('bundles', 'readonly')
        const count = transaction.objectStore('bundles').count()
        count.onerror = () => reject(count.error)
        count.onsuccess = () => {
          database.close()
          resolve(count.result)
        }
      }
    })
    return { names, recoveryCount }
  })
  expect(persistenceBeforeReplace.names).toContain('ai-beta-reader-db')
  expect(persistenceBeforeReplace.names).toContain('beta-bot-recovery')
  expect(persistenceBeforeReplace.recoveryCount).toBeGreaterThan(0)

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Confirm Replace library' }).click()
  await expect(page.getByText('Library replaced successfully.')).toBeVisible()

  await page.reload()
  await expect(page.getByText('Verified recovery bundles')).toBeVisible()
  await page.goto('/books')
  await expect(page.getByText('Persistent Original')).toBeVisible()
  await expect(page.getByText('Replace Removes Me')).toHaveCount(0)
  await page.goto(original.chapterUrl)
  await expect(page.getByText(marker).filter({ visible: true })).toBeVisible()
})

test('failed browser persistence during Replace rolls back the prior library and survives restart', async ({ page }) => {
  await createBookWithChapter(page, {
    bookTitle: 'Rollback Baseline',
    bookId: 'rollback-baseline',
    chapterTitle: 'Baseline Chapter',
    chapterText: 'ROLLBACK-BASELINE-132 — present in the incoming and local libraries.',
  })

  await page.goto('/library-data')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export full library backup' }).click()
  const bundlePath = await (await downloadPromise).path()
  expect(bundlePath).toBeTruthy()

  const localOnly = await createBookWithChapter(page, {
    bookTitle: 'Rollback Must Restore Me',
    bookId: 'rollback-must-restore-me',
    chapterTitle: 'Local Only Chapter',
    chapterText: 'ROLLBACK-LOCAL-ONLY-132 — must return after the failed Replace.',
  })

  await page.goto('/library-data')
  await page.locator('input[type="file"][accept*=".zip"]').setInputFiles(bundlePath as string)
  await expect(page.getByRole('button', { name: 'Prepare Replace library' })).toBeEnabled()
  await page.getByRole('button', { name: 'Prepare Replace library' }).click()
  await expect(page.getByText('Recovery bundle verified. Replace confirmation is now enabled.')).toBeVisible()

  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put
    let injected = false
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (!injected && this.name === 'database' && args[1] === 'sqliteDb') {
        injected = true
        throw new DOMException('Injected persistence failure', 'QuotaExceededError')
      }
      return originalPut.apply(this, args)
    }
  })

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Confirm Replace library' }).click()
  await expect(page.getByText(/prior library was restored from verified recovery/)).toBeVisible()

  await page.reload()
  await page.goto('/books')
  await expect(page.getByText('Rollback Baseline')).toBeVisible()
  await expect(page.getByText('Rollback Must Restore Me')).toBeVisible()
  await page.goto(localOnly.chapterUrl)
  await expect(page.getByText('ROLLBACK-LOCAL-ONLY-132').filter({ visible: true })).toBeVisible()
})
