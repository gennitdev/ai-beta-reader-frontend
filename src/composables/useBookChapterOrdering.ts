import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { logger } from '@/lib/logger'
import type { Book, BookPart } from '@/lib/database'
import type { BookChapter, BookChaptersByPart, BookOrganizedPart } from '@/types/bookView'

/** Parse a JSON-encoded array of ids stored on a book/part, tolerating bad data. */
export const parseIdArray = (value: string | null | undefined): string[] => {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Reorder `items` to match `orderIds`, appending any items not named in the
 * order, then stamp each with its final `position`.
 */
export const applyOrder = (items: BookChapter[], orderIds: string[]): BookChapter[] => {
  if (!orderIds.length) return items
  const chapterMap = new Map(items.map((chapter) => [chapter.id, chapter]))
  const ordered: BookChapter[] = []

  orderIds.forEach((id) => {
    const chapter = chapterMap.get(id)
    if (chapter) {
      ordered.push(chapter)
      chapterMap.delete(id)
    }
  })

  chapterMap.forEach((chapter) => {
    ordered.push(chapter)
  })

  return ordered.map((chapter, index) => ({
    ...chapter,
    position: index,
  }))
}

const arraysEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index])

/**
 * Flatten per-part chapter-id lists into a single ordered chapter-id list,
 * honoring the current part order and placing uncategorized chapters first.
 */
export const buildChapterOrder = (
  partUpdates: Record<string, string[]>,
  partOrder: string[],
): string[] => {
  const chapterOrder: string[] = []

  if (partUpdates['null']) {
    chapterOrder.push(...partUpdates['null'])
  }

  const visited = new Set<string>()
  partOrder.forEach((partId) => {
    visited.add(partId)
    if (partUpdates[partId]) {
      chapterOrder.push(...partUpdates[partId])
    }
  })

  Object.entries(partUpdates).forEach(([partId, chapterIds]) => {
    if (partId !== 'null' && !visited.has(partId)) {
      chapterOrder.push(...chapterIds)
    }
  })

  return chapterOrder
}

interface UseBookChapterOrderingDeps {
  book: Ref<Book | null>
  parts: Ref<BookPart[]>
  chapters: Ref<BookChapter[]>
  sortedChapters: ComputedRef<BookChapter[]>
  bookId: Ref<string> | ComputedRef<string>
  updateChapterOrders: (
    bookId: string,
    chapterOrder: string[],
    partUpdates: Record<string, string[]>,
    partOrder: string[],
  ) => Promise<void>
  updatePartOrder: (bookId: string, partOrder: string[]) => Promise<void>
  loadBook: () => Promise<void>
}

/**
 * Owns the book's chapter/part ordering: the derived part list and per-part
 * chapter grouping, the sidebar drag-and-drop working lists, and the flows that
 * reconcile and persist order changes. Extracted from BookView so the ordering
 * math (see the exported pure helpers) is directly unit-testable.
 */
export function useBookChapterOrdering(deps: UseBookChapterOrderingDeps) {
  const {
    book,
    parts,
    chapters,
    sortedChapters,
    bookId,
    updateChapterOrders,
    updatePartOrder,
    loadBook,
  } = deps

  const partOrder = ref<string[]>([])
  const sidebarPartLists = ref<Record<string, BookChapter[]>>({})
  const sidebarUncategorized = ref<BookChapter[]>([])

  const orderedParts = computed(() => {
    const partMap = new Map(parts.value.map((part) => [part.id, part]))
    const orderedList: BookPart[] = []

    partOrder.value.forEach((partId) => {
      const part = partMap.get(partId)
      if (part) {
        orderedList.push(part)
        partMap.delete(partId)
      }
    })

    if (partMap.size > 0) {
      const remaining = Array.from(partMap.values()).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
      orderedList.push(...remaining)
    }

    return orderedList
  })

  // Organize chapters by parts
  const chaptersByPart = computed<BookChaptersByPart>(() => {
    const partList = orderedParts.value
    const partIdSet = new Set(partList.map((part) => part.id))
    const uncategorizedChapters = sortedChapters.value.filter(
      (chapter) => !chapter.part_id || !partIdSet.has(chapter.part_id)
    )

    const organizedParts: BookOrganizedPart[] = partList.map((part) => {
      const partChapters = sortedChapters.value.filter((chapter) => chapter.part_id === part.id)
      const wordCount = partChapters.reduce((total, chapter) => total + (chapter.word_count || 0), 0)

      return {
        ...part,
        chapters: partChapters,
        wordCount,
      }
    })

    const uncategorizedWordCount = uncategorizedChapters.reduce(
      (total, chapter) => total + (chapter.word_count || 0),
      0
    )

    return {
      parts: organizedParts,
      uncategorized: uncategorizedChapters,
      uncategorizedWordCount,
    }
  })

  const syncSidebarLists = () => {
    const nextParts: Record<string, BookChapter[]> = {}

    orderedParts.value.forEach((part) => {
      nextParts[part.id] = chapters.value
        .filter((chapter) => chapter.part_id === part.id)
        .map((chapter) => chapter)
    })

    sidebarPartLists.value = nextParts

    const partIdSet = new Set(Object.keys(nextParts))

    sidebarUncategorized.value = chapters.value
      .filter((chapter) => !chapter.part_id || !partIdSet.has(chapter.part_id))
      .map((chapter) => chapter)
  }

  const setPartOrderState = (newOrder: string[]) => {
    const uniqueOrder = Array.from(new Set(newOrder))
    partOrder.value = uniqueOrder
    if (book.value) {
      book.value.part_order = JSON.stringify(uniqueOrder)
    }
  }

  const syncPartOrderWithParts = async () => {
    if (!book.value) {
      partOrder.value = []
      return
    }

    const storedOrder = parseIdArray(book.value.part_order)
    const partIds = parts.value.map((part) => part.id)
    const sanitized = storedOrder.filter((id) => partIds.includes(id))
    const missing = parts.value
      .filter((part) => !sanitized.includes(part.id))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((part) => part.id)

    const updatedOrder = [...sanitized, ...missing]

    if (!arraysEqual(updatedOrder, storedOrder)) {
      try {
        await updatePartOrder(bookId.value, updatedOrder)
      } catch (error) {
        logger.error('Failed to synchronize part order:', error)
      }
    }

    setPartOrderState(updatedOrder)
  }

  const buildSidebarPartUpdates = () => {
    const partUpdates: Record<string, string[]> = {}

    partUpdates['null'] = sidebarUncategorized.value.map((c) => c.id)

    orderedParts.value.forEach((part) => {
      const list = sidebarPartLists.value[part.id] || []
      partUpdates[part.id] = list.map((c) => c.id)
    })

    Object.entries(sidebarPartLists.value).forEach(([partId, list]) => {
      if (!(partId in partUpdates)) {
        partUpdates[partId] = list.map((c) => c.id)
      }
    })

    return partUpdates
  }

  const saveSidebarChapterOrder = async () => {
    try {
      const partUpdates = buildSidebarPartUpdates()

      const chapterOrder = buildChapterOrder(partUpdates, partOrder.value)

      // Send array-based reorder to backend
      await updateChapterOrders(bookId.value, chapterOrder, partUpdates, partOrder.value)

      logger.log('Saved sidebar chapter order with arrays:', { chapterOrder, partUpdates })

      // Reload to ensure UI reflects the saved state
      await loadBook()
    } catch (error) {
      logger.error('Failed to save sidebar chapter order:', error)
      // Reload on error to revert UI to correct state
      await loadBook()
    }
  }

  return {
    partOrder,
    sidebarPartLists,
    sidebarUncategorized,
    orderedParts,
    chaptersByPart,
    syncSidebarLists,
    setPartOrderState,
    syncPartOrderWithParts,
    buildSidebarPartUpdates,
    saveSidebarChapterOrder,
  }
}
