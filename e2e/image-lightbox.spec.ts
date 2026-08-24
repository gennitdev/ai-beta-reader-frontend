import { fileURLToPath } from 'node:url'
import { test, expect } from './fixtures/network'

test.describe.configure({ timeout: 120_000 })

test('opens a part cover as a full-screen album and navigates its illustrations', async ({ page }) => {
  const bundlePath = fileURLToPath(new URL(
    '../src/demo/stories/jack-and-the-beanstalk.zip',
    import.meta.url,
  ))

  await page.goto('/books')
  await page.getByRole('button', { name: 'Import Bundle' }).click()
  const importDialog = page.getByRole('dialog', { name: 'Import books from a bundle' })
  await importDialog.locator('input[type="file"][accept*=".zip"]').setInputFiles(bundlePath)
  await importDialog.getByRole('button', { name: 'Import book' }).click()
  await expect(importDialog.getByText('Bundle imported successfully')).toBeVisible()

  await page.goto('/books/jack-house-above-rain/parts/jack-part-02-above-rain')

  await expect(page.getByText('climbing-above-the-clouds.webp').first()).toBeAttached()
  await page.getByRole('heading', { name: 'Part 2: Above the Rain' }).click()

  const lightbox = page.getByTestId('image-lightbox')
  await expect(lightbox).toBeVisible()
  await expect(page.getByTestId('lightbox-image')).toHaveAttribute('src', /.+/)
  await expect(page.getByTestId('image-counter')).toHaveText(/^1 of [2-9]\d*$/)

  const initialSource = await page.getByTestId('lightbox-image').getAttribute('src')
  await page.getByRole('button', { name: 'Next image' }).click()
  await expect(page.getByTestId('image-counter')).toHaveText(/^2 of [2-9]\d*$/)
  await expect(page.getByTestId('lightbox-image')).not.toHaveAttribute('src', initialSource ?? '')

  await page.keyboard.press('ArrowLeft')
  await expect(page.getByTestId('image-counter')).toHaveText(/^1 of [2-9]\d*$/)

  await page.keyboard.press('Escape')
  await expect(lightbox).toBeHidden()

  await page.goto('/example-books/jack-house-above-rain/parts/jack-part-02-above-rain')
  await expect(page.getByText('climbing-above-the-clouds.webp').first()).toBeAttached()
  await page.getByRole('heading', { name: 'Part 2: Above the Rain' }).click()
  await expect(page.getByTestId('image-counter')).toHaveText('1 of 4')
})
