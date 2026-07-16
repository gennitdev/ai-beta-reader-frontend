import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useChapterMutationFlow, type ChapterMutationChapter } from '@/composables/useChapterMutationFlow'

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
    reviewTone: ref('fanficnet'),
    customProfiles: ref([]),
    editedSummary,
    editedNotes,
    normalizeCharacterList: () => [],
    buildPriorPartSummaries: async () => [],
    buildPriorChapterSummariesInPart: async () => [],
    buildPriorChapterSummariesInBook: async () => [],
    invalidateChapterSummary: vi.fn(),
    saveSummaryToDb,
    saveNotesToDb,
    saveReviewToDb: vi.fn(async () => undefined),
    createWikiPage: vi.fn(async () => 'wiki-1'),
    updateWikiPage: vi.fn(async () => undefined),
    getWikiPage: vi.fn(async () => null),
    trackWikiUpdate: vi.fn(async () => undefined),
    addChapterWikiMention: vi.fn(async () => undefined),
    ensureChapterWikiLinks: vi.fn(async () => undefined),
    reloadCharacters: vi.fn(async () => undefined),
    reloadReviews: vi.fn(async () => undefined),
    openSettings: vi.fn(),
  })

  return {
    chapter,
    editedSummary,
    editedNotes,
    saveSummaryToDb,
    saveNotesToDb,
    flow,
  }
}

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
})
