<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeftIcon,
  SparklesIcon,
  PencilIcon,
  CheckCircleIcon,
  ClockIcon,
} from '@heroicons/vue/24/outline'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import { useDatabase } from '@/composables/useDatabase'
import { generatePartSummary as generatePartSummaryAi, type PartSummaryChapterInput } from '@/lib/openai'
import type { BookPart } from '@/lib/database'

interface PartSummaryState {
  summary: string
  characters: string[]
  beats: string[]
  updatedAt: string | null
}

interface PartChapterEntry {
  id: string
  title: string | null
  wordCount: number
  position: number
  summary: string | null
  characters: string[]
  beats: string[]
}

const route = useRoute()
const router = useRouter()

const bookId = computed(() => (route.params.bookId || route.params.id) as string)
const partId = computed(() => route.params.partId as string)

const {
  books,
  chapters,
  loadBooks,
  loadChapters,
  getParts,
  getPartSummary,
  savePartSummary,
  getSummary,
} = useDatabase()

const part = ref<BookPart | null>(null)
const chapterEntries = ref<PartChapterEntry[]>([])
const partSummary = ref<PartSummaryState>({
  summary: '',
  characters: [],
  beats: [],
  updatedAt: null,
})
const editedSummary = ref('')
const loading = ref(false)
const generatingSummary = ref(false)
const savingSummary = ref(false)
const isEditingSummary = ref(false)
const errorMessage = ref<string | null>(null)

const book = computed(() => books.value.find((b: any) => b.id === bookId.value) || null)
const bookTitle = computed(() => book.value?.title ?? bookId.value)
const partName = computed(() => part.value?.name ?? '')

function parseIdOrder(order: string | null | undefined): string[] {
  if (!order) return []
  try {
    const parsed = JSON.parse(order)
    if (Array.isArray(parsed)) {
      return parsed.filter((value: unknown): value is string => typeof value === 'string')
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

const partNumber = computed(() => {
  const order = parseIdOrder(book.value?.part_order)
  const index = order.indexOf(partId.value)
  return index >= 0 ? index + 1 : null
})

const partLabel = computed(() => {
  if (!part.value) return 'Part'
  return partNumber.value ? `Part ${partNumber.value}` : 'Part'
})

const bookUrl = computed(() => `/books/${bookId.value}`)
const organizeUrl = computed(() => `/books/${bookId.value}/organize`)

const totalWordCount = computed(() =>
  chapterEntries.value.reduce((sum, chapter) => sum + (chapter.wordCount || 0), 0),
)

const summarizedChapterCount = computed(() =>
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

function truncateSummary(text: string, limit = 200) {
  if (text.length <= limit) return text
  return `${text.slice(0, limit).trimEnd()}…`
}

function formatDateTime(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString()
}

async function loadPartSummaryData(partIdValue: string) {
  try {
    const summaryData = await getPartSummary(partIdValue)
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
      partSummary.value = {
        summary: '',
        characters: [],
        beats: [],
        updatedAt: null,
      }
      editedSummary.value = ''
    }
  } catch (error) {
    console.error('Failed to load part summary:', error)
    partSummary.value = {
      summary: '',
      characters: [],
      beats: [],
      updatedAt: null,
    }
    editedSummary.value = ''
  }
}

async function hydrateChapterEntries(fetchedPart: BookPart) {
  const chapterOrder = parseIdOrder(fetchedPart.chapter_order)
  const assignedChapters = chapters.value.filter((ch: any) => ch.part_id === fetchedPart.id)
  const chapterMap = new Map<string, any>(
    assignedChapters.map((chapter: any) => [chapter.id, chapter]),
  )

  const sortedByOrder = chapterOrder.filter((id) => chapterMap.has(id))
  const remaining = assignedChapters
    .filter((chapter: any) => !sortedByOrder.includes(chapter.id))
    .sort(
      (a: any, b: any) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )

  const combinedIds = [...sortedByOrder, ...remaining.map((chapter: any) => chapter.id)]
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
    .filter((entry): entry is { id: string; title: string | null; wordCount: number; position: number } => entry !== null)

  const enriched = await Promise.all(
    baseEntries.map(async (entry) => {
      const summaryData = await getSummary(entry.id)
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

  chapterEntries.value = enriched
}

async function loadPart() {
  loading.value = true
  errorMessage.value = null
  try {
    await loadBooks()
    await loadChapters(bookId.value)
    const parts = await getParts(bookId.value)
    const currentPart = parts.find((p: BookPart) => p.id === partId.value) || null

    if (!currentPart) {
      part.value = null
      chapterEntries.value = []
      await loadPartSummaryData(partId.value)
      errorMessage.value = 'Part not found.'
      return
    }

    part.value = currentPart
    await hydrateChapterEntries(currentPart)
    await loadPartSummaryData(currentPart.id)
  } catch (error) {
    console.error('Failed to load part data:', error)
    errorMessage.value = 'Failed to load part details.'
  } finally {
    loading.value = false
  }
}

const goBack = () => {
  router.push(bookUrl.value)
}

const startEditingSummary = () => {
  if (!hasPartSummary.value) return
  editedSummary.value = partSummary.value.summary
  isEditingSummary.value = true
}

const cancelEditingSummary = () => {
  editedSummary.value = partSummary.value.summary
  isEditingSummary.value = false
}

const saveEditedSummary = async () => {
  if (!part.value) return
  if (!editedSummary.value.trim()) {
    alert('Part summary cannot be empty.')
    return
  }

  savingSummary.value = true
  try {
    await savePartSummary({
      part_id: part.value.id,
      summary: editedSummary.value.trim(),
      characters: partSummary.value.characters,
      beats: partSummary.value.beats,
    })
    await loadPartSummaryData(part.value.id)
    isEditingSummary.value = false
  } catch (error) {
    console.error('Failed to save part summary:', error)
    alert('Failed to save part summary.')
  } finally {
    savingSummary.value = false
  }
}

const handleGeneratePartSummary = async () => {
  if (!part.value) return

  generatingSummary.value = true
  try {
    await hydrateChapterEntries(part.value)
    const summaries = availableChapterSummaries.value
    if (!summaries.length) {
      alert('Add chapter summaries within this part before generating a part summary.')
      return
    }

    const apiKey = localStorage.getItem('openai_api_key')
    if (!apiKey) {
      alert('Please add your OpenAI API key in Settings first.')
      router.push('/settings')
      return
    }

    const result = await generatePartSummaryAi(
      apiKey,
      bookTitle.value,
      part.value.name,
      part.value.id,
      summaries,
      partNumber.value || undefined,
    )

    await savePartSummary({
      part_id: part.value.id,
      summary: result.summary,
      characters: result.characters,
      beats: result.beats,
    })
    await loadPartSummaryData(part.value.id)
    isEditingSummary.value = false
  } catch (error: any) {
    console.error('Failed to generate part summary:', error)
    const message = error?.message ?? 'Unknown error'
    alert(`Failed to generate part summary: ${message}`)
  } finally {
    generatingSummary.value = false
  }
}

const openChapter = (chapterId: string) => {
  router.push(`/books/${bookId.value}/chapters/${chapterId}`)
}

onMounted(async () => {
  await loadPart()
})

watch([bookId, partId], async () => {
  await loadPart()
})
</script>

<template>
  <div class="w-full">
    <div class="border-b border-gray-200 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95 sm:px-6 lg:px-8">
      <div class="mx-auto flex w-full max-w-6xl items-center justify-between">
        <div class="flex items-center space-x-4">
          <button
            @click="goBack"
            class="rounded-md p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
          >
            <ArrowLeftIcon class="h-5 w-5" />
          </button>
          <div>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {{ bookTitle }}
            </p>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
              {{ partLabel }}<span v-if="partName">: {{ partName }}</span>
            </h1>
          </div>
        </div>

        <div class="flex items-center space-x-3">
          <router-link
            :to="organizeUrl"
            class="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Manage Parts
          </router-link>
        </div>
      </div>
    </div>

    <div class="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div v-if="loading" class="flex h-64 items-center justify-center">
        <div class="h-10 w-10 animate-spin rounded-full border-b-2 border-blue-600"></div>
      </div>

      <div v-else>
        <div
          v-if="errorMessage"
          class="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200"
        >
          {{ errorMessage }}
        </div>

        <template v-else>
          <div class="grid gap-4 sm:grid-cols-3 mb-8">
            <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Chapters</p>
              <p class="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                {{ chapterEntries.length.toLocaleString() }}
              </p>
            </div>
            <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Total Words</p>
              <p class="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                {{ totalWordCount.toLocaleString() }}
              </p>
            </div>
            <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Summaries Ready</p>
              <p class="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                {{ summaryCoverage }}
              </p>
            </div>
          </div>

          <section class="mb-10 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Part Summary</h2>
                <p v-if="formatDateTime(partSummary.updatedAt)" class="text-sm text-gray-500 dark:text-gray-400">
                  Updated {{ formatDateTime(partSummary.updatedAt) }}
                </p>
              </div>
              <div class="flex flex-wrap gap-3">
                <button
                  @click="handleGeneratePartSummary"
                  :disabled="generatingSummary || chapterEntries.length === 0"
                  class="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span v-if="generatingSummary" class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                  <SparklesIcon v-else class="mr-2 h-4 w-4" />
                  {{ generatingSummary ? 'Generating...' : hasPartSummary ? 'Regenerate Summary' : 'Generate Summary' }}
                </button>
                <button
                  v-if="hasPartSummary && !isEditingSummary"
                  @click="startEditingSummary"
                  class="inline-flex items-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  <PencilIcon class="mr-2 h-4 w-4" />
                  Edit
                </button>
              </div>
            </div>

            <div v-if="generatingSummary" class="mt-6 flex items-center rounded-md border border-dashed border-blue-300 bg-blue-50/70 px-4 py-3 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
              <div class="mr-3 h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
              AI is generating a higher-level summary using your chapter summaries…
            </div>

            <div v-else class="mt-6 space-y-6">
              <div v-if="isEditingSummary">
                <textarea
                  v-model="editedSummary"
                  rows="6"
                  class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  placeholder="Write a concise overview of this part..."
                ></textarea>
                <div class="mt-3 flex items-center gap-3">
                  <button
                    @click="saveEditedSummary"
                    :disabled="savingSummary"
                    class="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span v-if="savingSummary" class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                    {{ savingSummary ? 'Saving...' : 'Save Summary' }}
                  </button>
                  <button
                    @click="cancelEditingSummary"
                    class="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              <div v-else>
                <MarkdownRenderer
                  v-if="hasPartSummary"
                  :text="partSummary.summary"
                  class="prose prose-sm max-w-none text-gray-700 dark:prose-invert dark:text-gray-200"
                />
                <div
                  v-else
                  class="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-400"
                >
                  Generate this part summary to brief the AI on everything that happened in these chapters.
                </div>
              </div>

              <div v-if="partSummary.characters.length" class="space-y-2">
                <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Key Characters</h3>
                <div class="flex flex-wrap gap-2">
                  <span
                    v-for="character in partSummary.characters"
                    :key="character"
                    class="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-200"
                  >
                    {{ character }}
                  </span>
                </div>
              </div>

              <div v-if="partSummary.beats.length" class="space-y-2">
                <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Major Beats</h3>
                <ul class="list-disc space-y-1 pl-5 text-sm text-gray-700 dark:text-gray-300">
                  <li v-for="beat in partSummary.beats" :key="beat">
                    {{ beat }}
                  </li>
                </ul>
              </div>
            </div>
          </section>

          <section>
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
                Chapters in this Part
              </h2>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                {{ summarizedChapterCount }} of {{ chapterEntries.length }} chapters summarized
              </p>
            </div>

            <div
              v-if="chapterEntries.length === 0"
              class="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400"
            >
              No chapters are currently assigned to this part.
            </div>

            <div v-else class="space-y-4">
              <div
                v-for="chapter in chapterEntries"
                :key="chapter.id"
                class="rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-blue-200 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-blue-700/50"
              >
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p class="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                      Chapter {{ chapter.position.toString().padStart(2, '0') }}
                    </p>
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                      {{ chapter.title || `Chapter ${chapter.position}` }}
                    </h3>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                      {{ chapter.wordCount.toLocaleString() }} words
                    </p>
                  </div>
                  <div class="flex items-center gap-2 text-sm font-medium">
                    <CheckCircleIcon
                      v-if="chapter.summary"
                      class="h-5 w-5 text-green-500"
                    />
                    <ClockIcon
                      v-else
                      class="h-5 w-5 text-gray-400"
                    />
                    <span class="text-gray-600 dark:text-gray-300">
                      {{ chapter.summary ? 'Summary ready' : 'Needs summary' }}
                    </span>
                  </div>
                </div>

                <p
                  v-if="chapter.summary"
                  class="mt-3 text-sm text-gray-700 dark:text-gray-300"
                >
                  {{ truncateSummary(chapter.summary) }}
                </p>
                <p
                  v-else
                  class="mt-3 text-sm italic text-gray-500 dark:text-gray-400"
                >
                  No summary yet. Summaries help the AI understand how this chapter contributes to the part.
                </p>

                <div
                  v-if="chapter.characters.length"
                  class="mt-4 flex flex-wrap gap-2"
                >
                  <span
                    v-for="character in chapter.characters"
                    :key="`${chapter.id}-${character}`"
                    class="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  >
                    {{ character }}
                  </span>
                </div>

                <div class="mt-4 flex flex-wrap gap-3">
                  <button
                    @click="openChapter(chapter.id)"
                    class="rounded-md border border-blue-200 px-3 py-1.5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-900/30"
                  >
                    Open Chapter
                  </button>
                </div>
              </div>
            </div>
          </section>
        </template>
      </div>
    </div>
  </div>
</template>
