import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useChapterReviews } from '@/composables/useChapterReviews'
import type { ChapterReview } from '@/lib/database'
import type { Chapter, CustomReviewerProfile } from '@/types/chapterView'

function chapter(over: Partial<Chapter> = {}): Chapter {
  return {
    id: 'chapter-1', book_id: 'book-1', title: 'One', text: '', word_count: 0,
    part_id: null, summary: null, pov: null, characters: null, beats: null,
    spoilers_ok: null, notes: null, ...over,
  }
}

function dbReview(over: Partial<ChapterReview> = {}): ChapterReview {
  return {
    id: 'r1', chapter_id: 'chapter-1', review_text: 'Nice work',
    prompt_used: 'prompt', profile_id: null, profile_name: null, tone_key: null,
    created_at: '2026-01-01', updated_at: '2026-01-02', profile_stable_id: null, ...over,
  }
}

function profile(over: Partial<CustomReviewerProfile> = {}): CustomReviewerProfile {
  return { id: 1, name: 'Editor', description: 'Terse', created_at: '2026-01-01', updated_at: '2026-01-02', ...over }
}

function setup(chapterValue: Chapter | null = chapter()) {
  const chapterRef = ref<Chapter | null>(chapterValue)
  const deps = {
    chapter: chapterRef,
    getReviews: vi.fn(async () => [dbReview()]),
    deleteReviewFromDb: vi.fn(async () => {}),
    getCustomProfiles: vi.fn(async () => [profile()]),
  }
  return { chapterRef, deps, reviews: useChapterReviews(deps) }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('confirm', vi.fn(() => true))
  vi.stubGlobal('alert', vi.fn())
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useChapterReviews', () => {
  it('loads reviews and normalizes optional profile/tone fields', async () => {
    const { deps, reviews } = setup()
    deps.getReviews.mockResolvedValueOnce([
      dbReview({ id: 'r1', profile_id: 7, profile_name: 'Beta', tone_key: 'harsh' }),
      // Row missing the optional fields exercises the ?? null fallbacks.
      { id: 'r2', chapter_id: 'chapter-1', review_text: 'ok', created_at: 'x', updated_at: 'y' } as unknown as ChapterReview,
    ])

    await reviews.loadSavedReviews()

    expect(deps.getReviews).toHaveBeenCalledWith('chapter-1')
    expect(reviews.savedReviews.value).toHaveLength(2)
    expect(reviews.savedReviews.value[0]).toMatchObject({ profile_id: 7, profile_name: 'Beta', tone_key: 'harsh' })
    expect(reviews.savedReviews.value[1]).toMatchObject({ profile_id: null, profile_name: null, tone_key: null })
    expect(reviews.loadingReviews.value).toBe(false)
  })

  it('clears reviews and skips the db when there is no chapter', async () => {
    const { deps, reviews } = setup(null)
    reviews.savedReviews.value = [dbReview() as never]

    await reviews.loadSavedReviews()

    expect(reviews.savedReviews.value).toEqual([])
    expect(deps.getReviews).not.toHaveBeenCalled()
  })

  it('records an empty list and stops loading when fetching reviews fails', async () => {
    const { deps, reviews } = setup()
    deps.getReviews.mockRejectedValueOnce(new Error('offline'))

    await reviews.loadSavedReviews()

    expect(reviews.savedReviews.value).toEqual([])
    expect(reviews.loadingReviews.value).toBe(false)
  })

  it('deletes a confirmed review then reloads the list', async () => {
    const { deps, reviews } = setup()

    await reviews.deleteReview('r1')

    expect(deps.deleteReviewFromDb).toHaveBeenCalledWith('r1')
    expect(deps.getReviews).toHaveBeenCalledTimes(1) // reload
    expect(reviews.deletingReviewId.value).toBeNull()
  })

  it('does not delete when the confirmation is declined', async () => {
    const { deps, reviews } = setup()
    vi.stubGlobal('confirm', vi.fn(() => false))

    await reviews.deleteReview('r1')

    expect(deps.deleteReviewFromDb).not.toHaveBeenCalled()
    expect(deps.getReviews).not.toHaveBeenCalled()
  })

  it('alerts and resets the deleting flag when deletion fails', async () => {
    const { deps, reviews } = setup()
    deps.deleteReviewFromDb.mockRejectedValueOnce(new Error('locked'))
    const alertSpy = vi.fn()
    vi.stubGlobal('alert', alertSpy)

    await reviews.deleteReview('r1')

    expect(alertSpy).toHaveBeenCalledWith('Failed to delete review')
    expect(deps.getReviews).not.toHaveBeenCalled()
    expect(reviews.deletingReviewId.value).toBeNull()
  })

  it('loads custom profiles, falling back to an empty list on error', async () => {
    const { deps, reviews } = setup()
    await reviews.loadCustomProfiles()
    expect(reviews.customProfiles.value).toEqual([profile()])

    deps.getCustomProfiles.mockRejectedValueOnce(new Error('nope'))
    await reviews.loadCustomProfiles()
    expect(reviews.customProfiles.value).toEqual([])
  })

  it('toggles review and prompt expansion independently', () => {
    const { reviews } = setup()

    reviews.toggleReviewExpansion('r1')
    expect(reviews.expandedReviews.value.has('r1')).toBe(true)
    reviews.toggleReviewExpansion('r1')
    expect(reviews.expandedReviews.value.has('r1')).toBe(false)

    reviews.togglePromptExpansion('r1')
    expect(reviews.expandedPrompts.value.has('r1')).toBe(true)
    expect(reviews.expandedReviews.value.has('r1')).toBe(false)
  })
})
