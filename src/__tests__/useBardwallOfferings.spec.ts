import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Book, ChapterRevision, ChapterRevisionActivity } from '@/lib/database'
import {
  gatherBardwallOfferings,
  useBardwallOfferings,
} from '@/composables/useBardwallOfferings'

function book(id: string, title = `Book ${id}`): Book {
  return {
    id,
    title,
    chapter_order: '[]',
    part_order: '[]',
    created_at: '2026-01-01T00:00:00.000Z',
  }
}

function activity(
  id: string,
  overrides: Partial<ChapterRevisionActivity> = {},
): ChapterRevisionActivity {
  return {
    id,
    chapter_id: 'chapter-1',
    chapter_title: 'Moonrise',
    activity_type: 'save',
    words_added: 2,
    words_removed: 1,
    word_count_deleted: 0,
    revision_available: true,
    created_at: '2026-07-31T12:00:00.000Z',
    ...overrides,
  }
}

function revision(
  id: string,
  text: string,
  overrides: Partial<ChapterRevision> = {},
): ChapterRevision {
  return {
    id,
    chapter_id: 'chapter-1',
    book_id: 'book-1',
    title: 'Moonrise',
    text,
    word_count: text.split(/\s+/).length,
    words_added: 2,
    words_removed: 1,
    revision_kind: 'save',
    created_at: '2026-07-31T12:00:00.000Z',
    ...overrides,
  }
}

const revisions = [
  revision('revision-2', 'The moon was very bright.'),
  revision('revision-1', 'The moon was pale.', { revision_kind: 'baseline' }),
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('gatherBardwallOfferings', () => {
  it('builds stable untold passages and caches revision reads per chapter', async () => {
    const getChapterRevisions = vi.fn(async () => revisions)
    const offerings = await gatherBardwallOfferings({
      books: [book('book-1', 'Ghost Stories')],
      toldPassageIds: [],
      getBookRevisionActivity: vi.fn(async () => [
        activity('revision-1', { created_at: '2026-07-30T12:00:00.000Z' }),
        activity('revision-2'),
        activity('deleted-event', { activity_type: 'delete' }),
        activity('missing-event', { revision_available: false }),
      ]),
      getChapterRevisions,
    })

    expect(getChapterRevisions).toHaveBeenCalledOnce()
    expect(offerings).toEqual([
      expect.objectContaining({
        id: 'revision-2',
        bookTitle: 'Ghost Stories',
        chapterTitle: 'Moonrise',
        wordCount: 2,
        passages: [expect.objectContaining({ id: 'revision-2:0', text: 'very bright' })],
      }),
      expect.objectContaining({
        id: 'revision-1',
        passages: [expect.objectContaining({ id: 'revision-1:0' })],
      }),
    ])
  })

  it('excludes told, missing, and discarded revisions', async () => {
    const discarded = revision('discarded', 'Discarded words', { discarded_at: '2026-08-01' })
    const offerings = await gatherBardwallOfferings({
      books: [book('book-1')],
      toldPassageIds: ['revision-2:0'],
      getBookRevisionActivity: vi.fn(async () => [
        activity('missing'),
        activity('discarded'),
        activity('revision-2'),
      ]),
      getChapterRevisions: vi.fn(async () => [discarded, ...revisions]),
    })

    expect(offerings).toEqual([])
  })

  it('sorts offerings across books by recency and caps the town-crier list', async () => {
    const books = Array.from({ length: 14 }, (_, index) => book(`book-${index}`))
    const getBookRevisionActivity = vi.fn(async (bookId: string) => {
      const index = Number(bookId.replace('book-', ''))
      return [activity(`revision-${index}`, {
        chapter_id: `chapter-${index}`,
        created_at: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      })]
    })
    const getChapterRevisions = vi.fn(async (chapterId: string) => {
      const index = Number(chapterId.replace('chapter-', ''))
      return [revision(`revision-${index}`, `Story ${index}`, {
        chapter_id: chapterId,
        book_id: `book-${index}`,
      })]
    })

    const offerings = await gatherBardwallOfferings({
      books,
      toldPassageIds: [],
      getBookRevisionActivity,
      getChapterRevisions,
    })

    expect(offerings).toHaveLength(12)
    expect(offerings.map((offering) => offering.id)).toEqual(
      Array.from({ length: 12 }, (_, offset) => `revision-${13 - offset}`),
    )
  })
})

describe('useBardwallOfferings', () => {
  function createSource() {
    return {
      books: ref([book('book-1', 'Ghost Stories')]),
      loadBooks: vi.fn(async () => undefined),
      getBookRevisionActivity: vi.fn(async () => [activity('revision-2')]),
      getChapterRevisions: vi.fn(async () => revisions),
    }
  }

  it('owns loading, selection, toggling, and consumed-passage cleanup', async () => {
    const source = createSource()
    const flow = useBardwallOfferings(ref<string[]>([]), source)

    await flow.loadOfferings()
    expect(source.loadBooks).toHaveBeenCalledOnce()
    expect(flow.loadingOfferings.value).toBe(false)
    expect(flow.offeringError.value).toBeNull()

    flow.selectOffering(flow.offerings.value[0])
    expect(flow.selectedWordCount.value).toBe(2)
    flow.togglePassage(0)
    expect(flow.selectedWordCount.value).toBe(0)
    flow.togglePassage(0)
    expect(flow.selectedPassages.value).toHaveLength(1)

    flow.removeToldPassages(['revision-2:0'])
    expect(flow.offerings.value).toEqual([])
    flow.clearSelection()
    expect(flow.selectedOffering.value).toBeNull()
  })

  it('turns source failures into view-ready error state and can reset', async () => {
    const source = createSource()
    source.loadBooks.mockRejectedValue(new Error('database unavailable'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const flow = useBardwallOfferings(ref<string[]>([]), source)

    await flow.loadOfferings()

    expect(flow.loadingOfferings.value).toBe(false)
    expect(flow.offeringError.value).toBe('The town crier could not find your recent stories.')
    flow.selectedOfferingId.value = 'old-selection'
    flow.resetOfferings()
    expect(flow.offerings.value).toEqual([])
    expect(flow.offeringError.value).toBeNull()
    expect(flow.selectedOfferingId.value).toBeNull()
  })
})
