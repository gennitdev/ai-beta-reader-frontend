import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mutationMocks = vi.hoisted(() => ({
  loadApiKey: vi.fn(),
  generateSummary: vi.fn(),
  generateReview: vi.fn(),
  generateWikiContent: vi.fn(),
}))

vi.mock('@/lib/apiKeyStorage', () => ({ loadOpenAIApiKey: mutationMocks.loadApiKey }))
vi.mock('@/lib/openai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/openai')>()
  return {
    ...actual,
    generateChapterSummary: mutationMocks.generateSummary,
    generateReview: mutationMocks.generateReview,
    generateWikiContent: mutationMocks.generateWikiContent,
  }
})
import {
  canonicalizeWikiEntityNames,
  useChapterMutationFlow,
  type ChapterMutationChapter,
} from '@/composables/useChapterMutationFlow'

function createChapter(): ChapterMutationChapter {
  return {
    id: 'chapter-1',
    book_id: 'book-1',
    title: 'Chapter One',
    text: 'Example text',
    summary: 'Old summary',
    pov: 'Alice',
    characters: ['Alice'],
    beats: ['Opening'],
    spoilers_ok: false,
    notes: 'Old notes',
    part_id: 'part-1',
  }
}

function createMutationFlow() {
  const chapter = ref<ChapterMutationChapter | null>(createChapter())
  const editedSummary = ref('Updated summary')
  const editedNotes = ref('Updated notes')

  const saveSummaryToDb = vi.fn(async () => undefined)
  const saveNotesToDb = vi.fn(async () => undefined)
  const saveReviewToDb = vi.fn(async () => undefined)
  const invalidateChapterSummary = vi.fn()
  const createWikiPage = vi.fn(async () => 'wiki-created')
  const updateWikiPage = vi.fn(async () => undefined)
  const getWikiPage = vi.fn(async () => null)
  const trackWikiUpdate = vi.fn(async () => undefined)
  const addChapterWikiMention = vi.fn(async () => undefined)
  const ensureChapterWikiLinks = vi.fn(async () => undefined)
  const reloadWikiLinks = vi.fn(async () => undefined)
  const reloadCharacters = vi.fn(async () => undefined)
  const reloadReviews = vi.fn(async () => undefined)
  const openSettings = vi.fn()
  const buildPriorPartSummaries = vi.fn(async () => [])
  const buildPriorChapterSummariesInPart = vi.fn(async () => [])
  const buildPriorChapterSummariesInBook = vi.fn(async () => [])
  const reviewTone = ref('fanficnet')
  const customProfiles = ref<{ id: number; name: string; description: string }[]>([])

  const flow = useChapterMutationFlow({
    chapter,
    bookId: ref('book-1'),
    currentBookTitle: () => 'Book',
    currentBookChapterOrder: () => ['chapter-1'],
    currentPart: ref({
      id: 'part-1',
      book_id: 'book-1',
      name: 'Part One',
      chapter_order: '["chapter-1"]',
      cover_image_id: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }),
    currentPartNumber: ref(1),
    reviewTone,
    customProfiles,
    editedSummary,
    editedNotes,
    normalizeCharacterList: (value) => Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [],
    buildPriorPartSummaries,
    buildPriorChapterSummariesInPart,
    buildPriorChapterSummariesInBook,
    invalidateChapterSummary,
    saveSummaryToDb,
    saveNotesToDb,
    saveReviewToDb,
    createWikiPage,
    updateWikiPage,
    getWikiPage,
    trackWikiUpdate,
    addChapterWikiMention,
    ensureChapterWikiLinks,
    reloadWikiLinks,
    reloadCharacters,
    reloadReviews,
    openSettings,
  })

  return {
    chapter,
    editedSummary,
    editedNotes,
    saveSummaryToDb,
    saveNotesToDb,
    saveReviewToDb,
    invalidateChapterSummary,
    createWikiPage,
    updateWikiPage,
    getWikiPage,
    trackWikiUpdate,
    addChapterWikiMention,
    ensureChapterWikiLinks,
    reloadWikiLinks,
    reloadCharacters,
    reloadReviews,
    openSettings,
    buildPriorPartSummaries,
    buildPriorChapterSummariesInPart,
    buildPriorChapterSummariesInBook,
    reviewTone,
    customProfiles,
    flow,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('alert', vi.fn())
  mutationMocks.loadApiKey.mockResolvedValue('sk-test')
  mutationMocks.generateSummary.mockResolvedValue({
    summary: 'Generated summary',
    pov: 'Elizabeth',
    characters: ['Liz', 'Elizabeth Bennet'],
    locations: ['Netherfield'],
    beats: ['Arrival'],
    spoilers_ok: true,
  })
  mutationMocks.generateReview.mockResolvedValue({
    reviewText: 'A thoughtful review',
    promptUsed: 'Review this chapter',
  })
  mutationMocks.generateWikiContent.mockResolvedValue({
    content: 'Wiki content',
    summary: 'Wiki summary',
    hasChanges: true,
    hasContradictions: false,
    changeSummary: 'Added chapter facts',
    contradictions: '',
  })
})

describe('useChapterMutationFlow', () => {
  it('saves summary updates through the database callback and syncs local state', async () => {
    const { chapter, editedSummary, saveSummaryToDb, flow } = createMutationFlow()

    const didSave = await flow.saveSummary()

    expect(didSave).toBe(true)
    expect(saveSummaryToDb).toHaveBeenCalledWith({
      chapter_id: 'chapter-1',
      summary: editedSummary.value,
      pov: 'Alice',
      characters: ['Alice'],
      beats: ['Opening'],
      spoilers_ok: false,
    })
    expect(chapter.value?.summary).toBe('Updated summary')
    expect(flow.savingSummary.value).toBe(false)
  })

  it('saves notes updates through the database callback and syncs local state', async () => {
    const { chapter, editedNotes, saveNotesToDb, flow } = createMutationFlow()

    const didSave = await flow.saveNotes()

    expect(didSave).toBe(true)
    expect(saveNotesToDb).toHaveBeenCalledWith('chapter-1', editedNotes.value)
    expect(chapter.value?.notes).toBe('Updated notes')
    expect(flow.savingNotes.value).toBe(false)
  })

  it('keeps local edits unchanged and reports save failures', async () => {
    const summaryCase = createMutationFlow()
    summaryCase.saveSummaryToDb.mockRejectedValue(new Error('database locked'))
    await expect(summaryCase.flow.saveSummary()).resolves.toBe(false)
    expect(summaryCase.chapter.value?.summary).toBe('Old summary')
    expect(alert).toHaveBeenCalledWith('Failed to save summary')

    const notesCase = createMutationFlow()
    notesCase.saveNotesToDb.mockRejectedValue(new Error('database locked'))
    await expect(notesCase.flow.saveNotes()).resolves.toBe(false)
    expect(notesCase.chapter.value?.notes).toBe('Old notes')
    expect(alert).toHaveBeenCalledWith('Failed to save notes')
  })

  it('generates and saves a summary, canonicalizes entities, and updates wiki links', async () => {
    const state = createMutationFlow()
    state.getWikiPage.mockImplementation(async (_bookId, name, type) => {
      if (type === 'character' && ['Liz', 'Elizabeth Bennet'].includes(name)) {
        return {
          id: 'wiki-elizabeth', page_name: 'Elizabeth Bennet',
          content: 'Old content', summary: 'Old summary',
        }
      }
      return null
    })

    await state.flow.generateSummary(true)

    expect(mutationMocks.generateSummary).toHaveBeenCalledWith(
      'sk-test', 'Example text', 'Chapter One', 'chapter-1', 'book-1', 'Book', true,
      expect.objectContaining({ partName: 'Part One', partNumber: 1 }),
    )
    expect(state.saveSummaryToDb).toHaveBeenCalledWith({
      chapter_id: 'chapter-1', summary: 'Generated summary', pov: 'Elizabeth',
      characters: ['Elizabeth Bennet'], beats: ['Arrival'], spoilers_ok: true,
    })
    expect(state.updateWikiPage).toHaveBeenCalledWith('wiki-elizabeth', {
      content: 'Wiki content', summary: 'Wiki summary',
    })
    expect(state.createWikiPage).toHaveBeenCalledWith(expect.objectContaining({
      page_name: 'Netherfield', page_type: 'location', created_by_ai: true,
    }))
    expect(state.ensureChapterWikiLinks).toHaveBeenCalledWith(
      'chapter-1', ['wiki-elizabeth', 'wiki-created'], 'ai_summary',
    )
    expect(state.reloadWikiLinks).toHaveBeenCalledOnce()
    expect(state.reloadCharacters).toHaveBeenCalledOnce()
    expect(state.invalidateChapterSummary).toHaveBeenCalledWith('chapter-1')
    expect(state.chapter.value).toEqual(expect.objectContaining({
      summary: 'Generated summary', characters: ['Elizabeth Bennet'], beats: ['Arrival'],
    }))
    expect(state.flow.showWikiUpdateResults.value).toBe(true)
    expect(state.flow.summaryProgress.value).toBe('')
    expect(state.flow.generatingSummary.value).toBe(false)
  })

  it('continues summary generation when one wiki update fails', async () => {
    const state = createMutationFlow()
    mutationMocks.generateSummary.mockResolvedValueOnce({
      summary: 'Generated summary', pov: 'Elizabeth', characters: ['Alice'],
      locations: ['Netherfield'], beats: [], spoilers_ok: false,
    })
    mutationMocks.generateWikiContent
      .mockRejectedValueOnce(new Error('wiki model unavailable'))
      .mockResolvedValueOnce({
        content: 'Location content', summary: 'Location summary', hasChanges: true,
        hasContradictions: false, changeSummary: 'Created', contradictions: '',
      })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await state.flow.generateSummary(true)

    expect(state.createWikiPage).toHaveBeenCalledOnce()
    expect(state.ensureChapterWikiLinks).toHaveBeenCalledWith(
      'chapter-1', ['wiki-created'], 'ai_summary',
    )
    expect(state.flow.summaryError.value).toBeNull()
  })

  it('opens settings when no API key exists and exposes summary errors', async () => {
    mutationMocks.loadApiKey.mockResolvedValueOnce(null)
    const missingKey = createMutationFlow()
    await missingKey.flow.generateSummary(false)
    expect(alert).toHaveBeenCalledWith('Please add your OpenAI API key in Settings first')
    expect(missingKey.openSettings).toHaveBeenCalledOnce()
    expect(mutationMocks.generateSummary).not.toHaveBeenCalled()
    expect(missingKey.flow.generatingSummary.value).toBe(false)

    mutationMocks.generateSummary.mockRejectedValueOnce(new Error('model overloaded'))
    const failed = createMutationFlow()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await failed.flow.generateSummary(false)
    expect(failed.flow.summaryError.value).toBe('model overloaded')
    expect(failed.flow.summaryProgress.value).toBe('')
  })

  it('generates a custom-profile review and persists its provenance', async () => {
    const state = createMutationFlow()
    state.reviewTone.value = 'custom-7'
    state.customProfiles.value = [{ id: 7, name: 'Gentle Editor', description: 'Be kind and exact' }]

    await state.flow.generateReview()

    expect(mutationMocks.generateReview).toHaveBeenCalledWith(
      'sk-test', 'Example text', 'Chapter One', 'chapter-1',
      expect.objectContaining({ id: 'custom-7', name: 'Gentle Editor', is_system: false }),
      expect.objectContaining({ priorPartSummaries: [], currentPartChapterSummaries: [] }),
    )
    expect(state.saveReviewToDb).toHaveBeenCalledWith({
      chapter_id: 'chapter-1', review_text: 'A thoughtful review',
      prompt_used: 'Review this chapter', profile_id: 7,
      profile_name: 'Gentle Editor', tone_key: 'custom-7',
    })
    expect(state.reloadReviews).toHaveBeenCalledOnce()
    expect(state.flow.generatingReview.value).toBe(false)
  })

  it('uses book-wide context outside parts and handles invalid review profiles', async () => {
    const state = createMutationFlow()
    if (state.chapter.value) state.chapter.value.part_id = null
    await state.flow.generateReview()
    expect(state.buildPriorChapterSummariesInBook).toHaveBeenCalledWith('chapter-1')
    expect(state.saveReviewToDb).toHaveBeenCalledWith(expect.objectContaining({
      profile_id: null, profile_name: 'Fan Reader', tone_key: 'fanficnet',
    }))

    const invalid = createMutationFlow()
    invalid.reviewTone.value = 'custom-999'
    await invalid.flow.generateReview()
    expect(alert).toHaveBeenCalledWith('Selected custom profile not found')
    expect(mutationMocks.generateReview).toHaveBeenCalledTimes(1)
  })

  it('alerts and clears busy state when review generation fails', async () => {
    mutationMocks.generateReview.mockRejectedValueOnce('network unavailable')
    const state = createMutationFlow()
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await state.flow.generateReview()

    expect(alert).toHaveBeenCalledWith('Failed to generate review: Unknown error')
    expect(state.flow.generatingReview.value).toBe(false)
    expect(state.saveReviewToDb).not.toHaveBeenCalled()
  })
})

describe('canonicalizeWikiEntityNames', () => {
  it('replaces aliases with canonical page names and deduplicates the result', async () => {
    const result = await canonicalizeWikiEntityNames(
      ['Liz', 'Elizabeth Bennet', 'Darcy'],
      async (name) => ['Liz', 'Elizabeth Bennet'].includes(name)
        ? { page_name: 'Elizabeth Bennet' }
        : null,
    )

    expect(result).toEqual(['Elizabeth Bennet', 'Darcy'])
  })
})
