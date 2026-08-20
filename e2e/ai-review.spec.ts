import { test, expect } from './fixtures/network'
import { createBookWithChapter, seedOpenAIKey } from './fixtures/helpers'

/**
 * AI-powered features (summary + review). These call OpenAI directly from the
 * browser using the key in localStorage; the `openai` fixture intercepts
 * api.openai.com and returns canned, parseable responses, so the test exercises
 * the real client-side wiring (key handling, request building, response parsing,
 * DB persistence, rendering) without any network or cost.
 */

const SEED = {
  bookTitle: 'AI Anthology',
  bookId: 'ai-anthology',
  chapterTitle: 'First Light',
  chapterText: 'The tower loomed as Alice climbed toward the truth she feared most.',
}

test('generate a chapter summary and render POV + characters', async ({ page, openai }) => {
  openai.setSummary({
    pov: 'Third person limited',
    characters: ['Alice', 'Bob'],
    summary: 'Alice confronts Bob at the tower.',
  })

  await seedOpenAIKey(page)
  await createBookWithChapter(page, SEED)

  const summaryCard = page.getByRole('region', { name: 'Summary' }).filter({ visible: true }).first()

  // Turn off the wiki-update side effect so summary generation is a single call.
  await summaryCard.getByRole('checkbox').uncheck()

  await summaryCard.getByRole('button', { name: 'Generate', exact: true }).click()

  // A saved summary collapses to its preview; reopen it to inspect structured details.
  await summaryCard.getByRole('button', { name: 'Show all' }).click()

  // The parsed summary is persisted and rendered.
  await expect(page.getByText('Third person limited').filter({ visible: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Alice' }).filter({ visible: true }).first()).toBeVisible()
  expect(openai.callCount()).toBeGreaterThan(0)
})

test('generate a review and render its text', async ({ page, openai }) => {
  const reviewText = 'A gripping chapter — MOCK-REVIEW-4471 — with sharp, propulsive prose.'
  openai.setReview(reviewText)

  await seedOpenAIKey(page)
  await createBookWithChapter(page, SEED)

  // Reviews section uses the default "editorial" (Developmental Editor) tone;
  // just request a review.
  await page.getByRole('button', { name: 'Get Review' }).filter({ visible: true }).first().click()

  await expect(page.getByText('MOCK-REVIEW-4471').filter({ visible: true })).toBeVisible()
})

test('generating without an API key prompts for one and opens settings', async ({ page }) => {
  // No seedOpenAIKey() — the app should refuse to call OpenAI.
  await createBookWithChapter(page, SEED)

  const dialogMessages: string[] = []
  page.on('dialog', (dialog) => {
    dialogMessages.push(dialog.message())
    return dialog.accept()
  })

  await page.getByRole('button', { name: 'Get Review' }).filter({ visible: true }).first().click()

  await expect.poll(() => dialogMessages.join('\n')).toMatch(/OpenAI API key/i)
  await expect(page).toHaveURL(/\/settings$/)
})
