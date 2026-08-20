import { computed, ref, type Ref } from 'vue'
import { useDatabase } from '@/composables/useDatabase'
import type { Book, ChapterRevision, ChapterRevisionActivity } from '@/lib/database'
import { getBardwallPassages } from '@/lib/bardwall'
import type { RevisionOffering } from '@/types/bardwallView'

interface BardwallOfferingSource {
  books: Ref<Book[]>
  loadBooks: () => Promise<void>
  getBookRevisionActivity: (bookId: string) => Promise<ChapterRevisionActivity[]>
  getChapterRevisions: (chapterId: string) => Promise<ChapterRevision[]>
}

interface GatherBardwallOfferingsOptions {
  books: Book[]
  toldPassageIds: readonly string[]
  getBookRevisionActivity: BardwallOfferingSource['getBookRevisionActivity']
  getChapterRevisions: BardwallOfferingSource['getChapterRevisions']
}

const MAX_ACTIVITY_PER_BOOK = 5
const MAX_OFFERINGS = 12

/**
 * Build the amphitheater's tellable revision list without coupling the
 * filtering and diff rules to Vue or the database singleton.
 */
export async function gatherBardwallOfferings(
  options: GatherBardwallOfferingsOptions,
): Promise<RevisionOffering[]> {
  const allOfferings: RevisionOffering[] = []
  const toldPassageIds = new Set(options.toldPassageIds)

  for (const book of options.books) {
    const activity = (await options.getBookRevisionActivity(book.id))
      .filter((item) => item.activity_type === 'save' && item.revision_available)
      .reverse()
      .slice(0, MAX_ACTIVITY_PER_BOOK)
    const revisionsByChapter = new Map<string, ChapterRevision[]>()

    for (const event of activity) {
      if (!revisionsByChapter.has(event.chapter_id)) {
        revisionsByChapter.set(
          event.chapter_id,
          await options.getChapterRevisions(event.chapter_id),
        )
      }

      const revisions = revisionsByChapter.get(event.chapter_id) ?? []
      const index = revisions.findIndex((revision) => revision.id === event.id)
      const revision = revisions[index]
      if (!revision) continue

      const previous = revisions[index + 1]
      if (revision.discarded_at || previous?.discarded_at) continue

      const passages = getBardwallPassages(previous?.text ?? '', revision.text)
        .map((passage, passageIndex) => ({
          ...passage,
          id: `${revision.id}:${passageIndex}`,
        }))
        .filter((passage) => !toldPassageIds.has(passage.id))
      if (passages.length === 0) continue

      allOfferings.push({
        id: revision.id,
        bookTitle: book.title,
        chapterTitle: event.chapter_title || revision.title || 'Untitled chapter',
        createdAt: event.created_at,
        passages,
        wordCount: passages.reduce((total, passage) => total + passage.wordCount, 0),
      })
    }
  }

  return allOfferings
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, MAX_OFFERINGS)
}

export function useBardwallOfferings(
  toldPassageIds: Readonly<Ref<readonly string[]>>,
  source: BardwallOfferingSource = useDatabase(),
) {
  const offerings = ref<RevisionOffering[]>([])
  const loadingOfferings = ref(false)
  const offeringError = ref<string | null>(null)
  const selectedOfferingId = ref<string | null>(null)
  const selectedPassageIndexes = ref<number[]>([])

  const selectedOffering = computed(() => (
    offerings.value.find((item) => item.id === selectedOfferingId.value) ?? null
  ))
  const selectedPassages = computed(() => (
    selectedOffering.value?.passages.filter((_, index) => (
      selectedPassageIndexes.value.includes(index)
    )) ?? []
  ))
  const selectedWordCount = computed(() => (
    selectedPassages.value.reduce((total, passage) => total + passage.wordCount, 0)
  ))

  const loadOfferings = async () => {
    loadingOfferings.value = true
    offeringError.value = null
    try {
      await source.loadBooks()
      offerings.value = await gatherBardwallOfferings({
        books: source.books.value,
        toldPassageIds: toldPassageIds.value,
        getBookRevisionActivity: source.getBookRevisionActivity,
        getChapterRevisions: source.getChapterRevisions,
      })
    } catch (error) {
      console.error('Failed to gather Bardwall stories:', error)
      offeringError.value = 'The town crier could not find your recent stories.'
    } finally {
      loadingOfferings.value = false
    }
  }

  const selectOffering = (offering: RevisionOffering) => {
    selectedOfferingId.value = offering.id
    selectedPassageIndexes.value = offering.passages.map((_, index) => index)
  }

  const togglePassage = (index: number) => {
    selectedPassageIndexes.value = selectedPassageIndexes.value.includes(index)
      ? selectedPassageIndexes.value.filter((item) => item !== index)
      : [...selectedPassageIndexes.value, index]
  }

  const clearSelection = () => {
    selectedOfferingId.value = null
    selectedPassageIndexes.value = []
  }

  const removeToldPassages = (passageIds: readonly string[]) => {
    const consumedIds = new Set(passageIds)
    offerings.value = offerings.value
      .map((offering) => {
        const passages = offering.passages.filter((passage) => !consumedIds.has(passage.id))
        return {
          ...offering,
          passages,
          wordCount: passages.reduce((total, passage) => total + passage.wordCount, 0),
        }
      })
      .filter((offering) => offering.passages.length > 0)
  }

  const resetOfferings = () => {
    offerings.value = []
    offeringError.value = null
    clearSelection()
  }

  return {
    offerings,
    loadingOfferings,
    offeringError,
    selectedOfferingId,
    selectedPassageIndexes,
    selectedOffering,
    selectedPassages,
    selectedWordCount,
    loadOfferings,
    selectOffering,
    togglePassage,
    clearSelection,
    removeToldPassages,
    resetOfferings,
  }
}
