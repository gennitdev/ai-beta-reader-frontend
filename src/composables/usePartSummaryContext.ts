import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { Book, BookPart, Chapter as DatabaseChapter, PartSummary as DatabasePartSummary, ChapterSummary } from '@/lib/database'
import type { PartSummaryChapterInput } from '@/lib/openai'

export interface PartSummaryState {
  summary: string
  characters: string[]
  beats: string[]
  updatedAt: string | null
}

export interface PartChapterEntry {
  id: string
  title: string | null
  wordCount: number
  position: number
  summary: string | null
  characters: string[]
  beats: string[]
}

interface UsePartSummaryContextOptions {
  book: ComputedRef<Book | null>
  partId: ComputedRef<string>
  chapters: Ref<DatabaseChapter[]>
  getPartSummary: (partId: string) => Promise<DatabasePartSummary | null>
  getSummary: (chapterId: string) => Promise<ChapterSummary | null>
}

function parseIdOrder(order: string | null | undefined): string[] {
  if (!order) return []
  try {
    const parsed = JSON.parse(order)
    if (Array.isArray(parsed)) {
      return parsed.filter((value): value is string => typeof value === 'string')
    }
  } catch {
    // Ignore parse errors and fallback to empty order
  }
  return []
}

function parseJsonArray(value: unknown): string[] {
  if (!value) return []
  let raw: unknown = value
  if (typeof value === 'string') {
    try {
      raw = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry): entry is string => entry.length > 0)
}

export function usePartSummaryContext(options: UsePartSummaryContextOptions) {
  const chapterEntries = ref<PartChapterEntry[]>([])
  const partSummary = ref<PartSummaryState>({
    summary: '',
    characters: [],
    beats: [],
    updatedAt: null,
  })
  const editedSummary = ref('')

  const partNumber = computed(() => {
    const order = parseIdOrder(options.book.value?.part_order)
    const index = order.indexOf(options.partId.value)
    return index >= 0 ? index + 1 : null
  })

  const totalWordCount = computed(() =>
    chapterEntries.value.reduce((sum, chapter) => sum + (chapter.wordCount || 0), 0),
  )

  const summarizedChapterCount = computed(
    () =>
      chapterEntries.value.filter((chapter) => chapter.summary && chapter.summary.trim().length > 0)
        .length,
  )

  const summaryCoverage = computed(() => {
    const total = chapterEntries.value.length
    if (total === 0) return '0/0'
    return `${summarizedChapterCount.value}/${total}`
  })

  const availableChapterSummaries = computed<PartSummaryChapterInput[]>(() =>
    chapterEntries.value
      .filter((chapter) => chapter.summary && chapter.summary.trim().length > 0)
      .map((chapter) => ({
        id: chapter.id,
        title: chapter.title ? chapter.title : `Chapter ${chapter.position}`,
        summary: chapter.summary!.trim(),
      })),
  )

  const hasPartSummary = computed(() => partSummary.value.summary.trim().length > 0)

  const chapterTitleMap = computed(() => {
    const map = new Map<string, string>()
    chapterEntries.value.forEach((entry) => {
      map.set(entry.id, entry.title ? entry.title : `Chapter ${entry.position}`)
    })
    return map
  })

  const resetPartSummary = () => {
    partSummary.value = {
      summary: '',
      characters: [],
      beats: [],
      updatedAt: null,
    }
    editedSummary.value = ''
  }

  const loadPartSummaryData = async (partIdValue: string) => {
    try {
      const summaryData = await options.getPartSummary(partIdValue)
      if (summaryData) {
        const characters = parseJsonArray(summaryData.characters)
        const beats = parseJsonArray(summaryData.beats)
        partSummary.value = {
          summary: summaryData.summary || '',
          characters,
          beats,
          updatedAt: summaryData.updated_at || summaryData.created_at || null,
        }
        editedSummary.value = summaryData.summary || ''
      } else {
        resetPartSummary()
      }
    } catch (error) {
      console.error('Failed to load part summary:', error)
      resetPartSummary()
    }
  }

  const hydrateChapterEntries = async (fetchedPart: BookPart) => {
    const chapterOrder = parseIdOrder(fetchedPart.chapter_order)
    const assignedChapters = options.chapters.value.filter((chapter) => chapter.part_id === fetchedPart.id)
    const chapterMap = new Map<string, DatabaseChapter>(
      assignedChapters.map((chapter) => [chapter.id, chapter]),
    )

    const sortedByOrder = chapterOrder.filter((id) => chapterMap.has(id))
    const remaining = assignedChapters
      .filter((chapter) => !sortedByOrder.includes(chapter.id))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

    const combinedIds = [...sortedByOrder, ...remaining.map((chapter) => chapter.id)]
    const baseEntries = combinedIds
      .map((id, index) => {
        const chapter = chapterMap.get(id)
        if (!chapter) return null
        return {
          id: chapter.id,
          title: chapter.title || null,
          wordCount: chapter.word_count || 0,
          position: index + 1,
        }
      })
      .filter(
        (entry): entry is { id: string; title: string | null; wordCount: number; position: number } =>
          entry !== null,
      )

    chapterEntries.value = await Promise.all(
      baseEntries.map(async (entry) => {
        const summaryData = await options.getSummary(entry.id)
        const characters = summaryData ? parseJsonArray(summaryData.characters) : []
        const beats = summaryData ? parseJsonArray(summaryData.beats) : []
        return {
          ...entry,
          summary: summaryData?.summary ?? null,
          characters,
          beats,
        } satisfies PartChapterEntry
      }),
    )
  }

  return {
    chapterEntries,
    partSummary,
    editedSummary,
    partNumber,
    totalWordCount,
    summarizedChapterCount,
    summaryCoverage,
    availableChapterSummaries,
    hasPartSummary,
    chapterTitleMap,
    loadPartSummaryData,
    hydrateChapterEntries,
    parseJsonArray,
  }
}
