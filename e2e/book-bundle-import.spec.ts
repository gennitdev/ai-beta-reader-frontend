import { fileURLToPath } from 'node:url'
import { test, expect } from './fixtures/network'
import { createBookWithChapter } from './fixtures/helpers'

test.describe.configure({ timeout: 120_000 })

test('imports the Jack bundle from My Books and keeps it writable after reload', async ({ page }) => {
  const bundlePath = fileURLToPath(new URL(
    '../src/demo/stories/jack-and-the-beanstalk.zip',
    import.meta.url,
  ))
  const existing = await createBookWithChapter(page, {
    bookTitle: 'Existing Local Book',
    bookId: 'existing-local-book',
    chapterTitle: 'Existing Chapter',
    chapterText: 'This local manuscript must remain untouched by the Jack import.',
  })

  await page.goto('/books')
  await page.getByRole('button', { name: 'Import Bundle' }).click()

  const dialog = page.getByRole('dialog', { name: 'Import books from a bundle' })
  await dialog.locator('input[type="file"][accept*=".zip"]').setInputFiles(bundlePath)
  await expect(dialog.getByRole('button', { name: 'Import book' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Import book' }).click()

  await expect(dialog.getByText('Bundle imported successfully')).toBeVisible()
  await dialog.getByRole('button', { name: 'Open book' }).click()
  await expect(page.getByText('Jack and the Beanstalk').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Rename book' })).toBeEnabled()
  await expect(page.getByRole('button', { name: '+ Add Chapter' })).toBeEnabled()

  await page.reload()
  await expect(page.getByText('Jack and the Beanstalk').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Rename book' })).toBeEnabled()

  await page.goto('/books')
  await expect(page.getByRole('img', { name: 'Jack and the Beanstalk cover' })).toBeVisible()
  await expect(page.getByText('7 chapters')).toBeVisible()
  await expect(page.getByText('Existing Local Book')).toBeVisible()

  await page.goto(existing.chapterUrl)
  await expect(page.getByText('This local manuscript must remain untouched by the Jack import.').filter({ visible: true })).toBeVisible()
})
