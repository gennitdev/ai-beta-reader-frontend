import { expect, type Page } from '@playwright/test'

export interface SeedChapterInput {
  /** Book title (the id field is overridden explicitly for determinism). */
  bookTitle: string
  /** Stable book id used for direct navigation. */
  bookId: string
  chapterTitle: string
  /** Chapter body. Its opening should carry a distinctive marker for assertions. */
  chapterText: string
}

export interface SeededChapter {
  bookId: string
  /** Chapter id captured from the URL after save (contains a timestamp suffix). */
  chapterId: string
  /** URL of the saved chapter's reader view. */
  chapterUrl: string
}

/**
 * Drive the real UI to create a book, then a chapter with body text, and save.
 *
 * This is the app's core authoring path (create book → edit chapter → save) and
 * doubles as the seed step for the cloud-sync round-trip. Returns the saved
 * chapter's id/URL — the id carries a timestamp suffix and can't be predicted,
 * so we read it back from the post-save navigation.
 */
export async function createBookWithChapter(
  page: Page,
  input: SeedChapterInput,
): Promise<SeededChapter> {
  // --- Create the book via the modal on /books ---
  await page.goto('/books')
  await page.getByRole('button', { name: 'New Book' }).click()

  // Typing the title auto-generates an id; overwrite it afterwards so the book
  // has a stable, known id we can navigate to directly.
  await page.locator('#title').fill(input.bookTitle)
  await page.locator('#id').fill(input.bookId)
  const createBookButton = page.getByRole('button', { name: 'Create Book' })
  await createBookButton.click()
  await expect(createBookButton).toBeHidden()

  // --- Author the chapter in the editor ---
  await page.goto(`/books/${input.bookId}/chapter-editor`)
  await page.locator('#title').fill(input.chapterTitle)
  await page.getByPlaceholder('Write your chapter content here...').fill(input.chapterText)
  await page.getByRole('button', { name: 'Save Chapter' }).click()

  // Save navigates to /books/:bookId/chapters/:chapterId — capture the id.
  const chapterUrlRe = new RegExp(`/books/${input.bookId}/chapters/([^/?#]+)`)
  await expect(page).toHaveURL(chapterUrlRe)
  const chapterId = chapterUrlRe.exec(page.url())?.[1] ?? ''
  expect(chapterId, 'chapter id should be captured from the post-save URL').not.toBe('')

  return { bookId: input.bookId, chapterId, chapterUrl: page.url() }
}

/**
 * Seed the OpenAI API key the app reads from `localStorage` before running any
 * AI feature. Uses an init script so it survives reloads and applies before app
 * code runs. Call before the first navigation.
 */
export async function seedOpenAIKey(page: Page, key = 'sk-e2e-test-key'): Promise<void> {
  await page.addInitScript((value) => {
    try {
      localStorage.setItem('openai_api_key', value)
    } catch {
      /* storage unavailable — ignore */
    }
  }, key)
}

/**
 * Wipe all local persistence (IndexedDB + local/session storage) and reload, so
 * the app boots with an empty database. Used to prove that restored data comes
 * from the cloud backup rather than lingering local state.
 */
export async function clearLocalData(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const dbs = (await indexedDB.databases?.()) ?? []
    await Promise.all(
      dbs.map(
        (info) =>
          new Promise<void>((resolve) => {
            if (!info.name) return resolve()
            const req = indexedDB.deleteDatabase(info.name)
            req.onsuccess = () => resolve()
            req.onerror = () => resolve()
            req.onblocked = () => resolve()
          }),
      ),
    )
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.reload()
}
