import { test, expect } from './fixtures/network'
import { createBookWithChapter } from './fixtures/helpers'

/**
 * Book authoring lifecycle — the app's foundational flow, entirely local
 * (sql.js + IndexedDB, no network). Proves create-book → add-chapter → save,
 * that content survives a full reload, and that edits persist.
 */

test('create a book, add a chapter, and persist across reload', async ({ page }) => {
  const marker = 'PERSIST-CHECK-3391'
  const { bookId } = await createBookWithChapter(page, {
    bookTitle: 'Lifecycle Ledger',
    bookId: 'lifecycle-ledger',
    chapterTitle: 'The Beginning',
    chapterText: `${marker} — the first words of the tale.`,
  })

  // The reader shows the saved chapter body.
  await expect(page.getByText(marker).filter({ visible: true })).toBeVisible()

  // Reload: content is served from IndexedDB-backed sql.js, not memory.
  await page.reload()
  await expect(page.getByText(marker).filter({ visible: true })).toBeVisible()

  // The book appears in the library and lists its chapter.
  await page.goto('/books')
  await expect(page.getByText('Lifecycle Ledger')).toBeVisible()

  await page.goto(`/books/${bookId}`)
  await expect(page.getByText('The Beginning').filter({ visible: true }).first()).toBeVisible()
})

test('edit an existing chapter and persist the change', async ({ page }) => {
  const { bookId, chapterId } = await createBookWithChapter(page, {
    bookTitle: 'Revision Records',
    bookId: 'revision-records',
    chapterTitle: 'Draft Chapter',
    chapterText: 'ORIGINAL-BODY-1002 — the original draft.',
  })

  // Reopen the chapter in the editor and replace its body.
  const updated = 'UPDATED-BODY-7742 — a thoroughly revised draft.'
  await page.goto(`/books/${bookId}/chapter-editor/${chapterId}`)
  await page.getByPlaceholder('Write your chapter content here...').fill(updated)
  await page.getByRole('button', { name: 'Save Chapter' }).click()

  await expect(page).toHaveURL(new RegExp(`/books/${bookId}/chapters/${chapterId}`))
  await expect(page.getByText('UPDATED-BODY-7742').filter({ visible: true })).toBeVisible()

  // The edit survives a reload; the old text is gone.
  await page.reload()
  await expect(page.getByText('UPDATED-BODY-7742').filter({ visible: true })).toBeVisible()
  await expect(page.getByText('ORIGINAL-BODY-1002')).toHaveCount(0)
})
