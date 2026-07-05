import type { Book, BookPart, Chapter as DatabaseChapter, ChapterSummary, PartSummary } from '@/lib/database'
import type { PartSummaryChapterInput, PartSummaryOverview } from '@/lib/openai'

interface UseChapterSummaryContextOptions {
  getCurrentBook: () => Book | null
  getParts: () => BookPart[]
  getChapters: () => DatabaseChapter[]
  getSummary: (chapterId: string) => Promise<ChapterSummary | null>
  getPartSummary: (partId: string) => Promise<PartSummary | null>
}

function parseIdArray(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) {
      return parsed.filter((entry): entry is string => typeof entry === 'string')
    }
  } catch {
    // Ignore parse errors and fall back to empty array
  }
  return []
}

export function useChapterSummaryContext(options: UseChapterSummaryContextOptions) {
  const chapterSummaryCache = new Map<string, ChapterSummary | null>()
  const partSummaryCache = new Map<string, PartSummary | null>()

  const getPartNumber = (partId: string | null): number | null => {
    if (!partId) return null
    const order = parseIdArray(options.getCurrentBook()?.part_order)
    const index = order.indexOf(partId)
    return index >= 0 ? index + 1 : null
  }

  const clearSummaryCaches = () => {
    chapterSummaryCache.clear()
    partSummaryCache.clear()
  }

  const primeChapterSummary = (chapterId: string, summary: ChapterSummary | null) => {
    chapterSummaryCache.set(chapterId, summary || null)
  }

  const invalidateChapterSummary = (chapterId: string) => {
    chapterSummaryCache.delete(chapterId)
  }

  const fetchChapterSummary = async (chapterId: string) => {
    if (chapterSummaryCache.has(chapterId)) {
      return chapterSummaryCache.get(chapterId) || null
    }
    const summary = await options.getSummary(chapterId)
    chapterSummaryCache.set(chapterId, summary || null)
    return summary || null
  }

  const fetchPartSummaryById = async (partId: string) => {
    if (partSummaryCache.has(partId)) {
      return partSummaryCache.get(partId) || null
    }
    const summary = await options.getPartSummary(partId)
    partSummaryCache.set(partId, summary || null)
    return summary || null
  }

  const buildChapterSummariesForPart = async (
    partId: string,
    partMetaOverride?: BookPart
  ): Promise<PartSummaryChapterInput[]> => {
    const partMeta = partMetaOverride ?? options.getParts().find((part) => part.id === partId)
    if (!partMeta) return []

    const order = parseIdArray(partMeta.chapter_order)
    const chapterList = options.getChapters().filter((chapter) => chapter.part_id === partMeta.id)
    const chapterMap = new Map(chapterList.map((chapter) => [chapter.id, chapter]))

    let orderedIds = order.filter((id) => chapterMap.has(id))
    if (!orderedIds.length) {
      const bookOrder = parseIdArray(options.getCurrentBook()?.chapter_order)
      orderedIds = bookOrder.filter((id) => chapterMap.has(id))
    }
    if (!orderedIds.length) {
      orderedIds = chapterList
        .slice()
        .sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
        .map((chapter) => chapter.id)
    }

    const summaries: PartSummaryChapterInput[] = []
    for (const id of orderedIds) {
      const summaryData = await fetchChapterSummary(id)
      if (summaryData?.summary) {
        const chapterInfo = chapterMap.get(id)
        summaries.push({
          id,
          title: chapterInfo?.title || id,
          summary: summaryData.summary,
        })
      }
    }
    return summaries
  }

  const buildPriorPartSummaries = async (
    currentPartId: string | null
  ): Promise<PartSummaryOverview[]> => {
    const result: PartSummaryOverview[] = []
    const partOrder = parseIdArray(options.getCurrentBook()?.part_order)
    if (!partOrder.length) return result

    const currentIndex = currentPartId ? partOrder.indexOf(currentPartId) : -1
    const targetIds =
      currentIndex > 0 ? partOrder.slice(0, currentIndex) : currentIndex === -1 ? partOrder : []

    for (const partId of targetIds) {
      const partMeta = options.getParts().find((part) => part.id === partId)
      if (!partMeta) continue

      const summaryRecord = await fetchPartSummaryById(partId)
      let summaryText = summaryRecord?.summary?.trim()

      if (!summaryText) {
        const chapterSummaries = await buildChapterSummariesForPart(partId, partMeta)
        if (chapterSummaries.length) {
          summaryText = chapterSummaries
            .map((entry) => `${entry.title} (${entry.id})\n${entry.summary}`)
            .join('\n\n')
        }
      }

      if (summaryText) {
        result.push({
          partId,
          partTitle: partMeta.name,
          summary: summaryText,
          partNumber: getPartNumber(partId),
        })
      }
    }

    return result
  }

  const buildPriorChapterSummariesInPart = async (
    partMeta: BookPart | null,
    currentChapterId: string
  ): Promise<PartSummaryChapterInput[]> => {
    if (!partMeta) return []

    let order = parseIdArray(partMeta.chapter_order)
    if (!order.includes(currentChapterId)) {
      const bookOrder = parseIdArray(options.getCurrentBook()?.chapter_order)
      order = bookOrder.filter((id) => {
        const chapter = options.getChapters().find((entry) => entry.id === id)
        return chapter?.part_id === partMeta.id
      })
    }

    const priorIds: string[] = []
    for (const id of order) {
      if (id === currentChapterId) break
      priorIds.push(id)
    }

    if (!priorIds.length) return []

    const chapterMap = new Map(
      options
        .getChapters()
        .filter((chapter) => chapter.part_id === partMeta.id)
        .map((chapter) => [chapter.id, chapter])
    )

    const summaries: PartSummaryChapterInput[] = []
    for (const id of priorIds) {
      const summaryData = await fetchChapterSummary(id)
      if (summaryData?.summary) {
        const chapterInfo = chapterMap.get(id)
        summaries.push({
          id,
          title: chapterInfo?.title || id,
          summary: summaryData.summary,
        })
      }
    }

    return summaries
  }

  const buildPriorChapterSummariesInBook = async (
    currentChapterId: string
  ): Promise<PartSummaryChapterInput[]> => {
    const priorSummaries: PartSummaryChapterInput[] = []
    const chapterOrder = parseIdArray(options.getCurrentBook()?.chapter_order)

    for (const chapterId of chapterOrder) {
      if (chapterId === currentChapterId) break
      const summary = await fetchChapterSummary(chapterId)
      if (!summary?.summary) continue

      const chapterData = options.getChapters().find((chapter) => chapter.id === chapterId)
      priorSummaries.push({
        id: chapterId,
        title: chapterData?.title || chapterId,
        summary: summary.summary,
      })
    }

    return priorSummaries
  }

  return {
    getPartNumber,
    clearSummaryCaches,
    primeChapterSummary,
    invalidateChapterSummary,
    buildPriorPartSummaries,
    buildPriorChapterSummariesInPart,
    buildPriorChapterSummariesInBook,
  }
}
