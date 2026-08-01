<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeftIcon, ArrowPathIcon, ClockIcon, TrashIcon } from '@heroicons/vue/24/outline'
import { useDatabase } from '@/composables/useDatabase'
import type { ChapterRevision } from '@/lib/database'
import { createRevisionDiff, getRevisionDiffStats } from '@/lib/revisionDiff'

const route = useRoute()
const router = useRouter()
const { discardChapterRevision, getChapterRevisions, restoreChapterRevision } = useDatabase()

const bookId = computed(() => route.params.id as string)
const chapterId = computed(() => route.params.chapterId as string)
const revisionId = computed(() => route.params.revisionId as string)
const revisions = ref<ChapterRevision[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const diffMode = ref<'split' | 'unified'>('unified')
const hasSelectedDiffMode = ref(false)
const showRestoreConfirmation = ref(false)
const restoring = ref(false)
const restoreError = ref<string | null>(null)
const showDiscardConfirmation = ref(false)
const discarding = ref(false)
const discardError = ref<string | null>(null)
let desktopMediaQuery: MediaQueryList | null = null

const revisionIndex = computed(() => revisions.value.findIndex((revision) => revision.id === revisionId.value))
const revision = computed(() => revisions.value[revisionIndex.value] ?? null)
const previousRevision = computed(() => revisions.value[revisionIndex.value + 1] ?? null)
const comparisonAvailable = computed(() => Boolean(
  revision.value && !revision.value.discarded_at && !previousRevision.value?.discarded_at,
))
const diff = computed(() => comparisonAvailable.value
  ? createRevisionDiff(previousRevision.value?.text ?? '', revision.value?.text ?? '')
  : [])
const diffStats = computed(() => getRevisionDiffStats(diff.value))
const displayedAdded = computed(() => comparisonAvailable.value ? diffStats.value.added : revision.value?.words_added ?? 0)
const displayedRemoved = computed(() => comparisonAvailable.value ? diffStats.value.removed : revision.value?.words_removed ?? 0)
const canDiscardRevision = computed(() => Boolean(
  revision.value
  && revision.value.revision_kind === 'save'
  && !revision.value.discarded_at
  && revisionIndex.value > 0,
))
const chapterUrl = computed(() => `/books/${bookId.value}/chapters/${chapterId.value}`)
const bookUrl = computed(() => `/books/${bookId.value}`)

const setDiffMode = (mode: 'split' | 'unified') => {
  diffMode.value = mode
  hasSelectedDiffMode.value = true
}

const syncDefaultDiffMode = (matches: boolean) => {
  if (!hasSelectedDiffMode.value) diffMode.value = matches ? 'split' : 'unified'
}

const handleViewportChange = (event: MediaQueryListEvent) => syncDefaultDiffMode(event.matches)

const restoreVersion = async () => {
  if (!revision.value || revision.value.discarded_at) return
  restoring.value = true
  restoreError.value = null
  try {
    const restored = await restoreChapterRevision(revision.value.id)
    revisions.value = await getChapterRevisions(chapterId.value)
    showRestoreConfirmation.value = false
    await router.replace(`/books/${bookId.value}/chapters/${chapterId.value}/versions/${restored.id}`)
  } catch (restoreFailure) {
    console.error('Failed to restore chapter version:', restoreFailure)
    restoreError.value = 'This version could not be restored. Please try again.'
  } finally {
    restoring.value = false
  }
}

const discardVersion = async () => {
  if (!revision.value || !canDiscardRevision.value) return
  discarding.value = true
  discardError.value = null
  try {
    await discardChapterRevision(revision.value.id)
    revisions.value = await getChapterRevisions(chapterId.value)
    showDiscardConfirmation.value = false
  } catch (discardFailure) {
    console.error('Failed to discard chapter version:', discardFailure)
    discardError.value = discardFailure instanceof Error
      ? discardFailure.message
      : 'This version could not be discarded. Please try again.'
  } finally {
    discarding.value = false
  }
}

const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, {
  dateStyle: 'long',
  timeStyle: 'short',
}).format(new Date(value))

onMounted(async () => {
  if (typeof window.matchMedia === 'function') {
    desktopMediaQuery = window.matchMedia('(min-width: 768px)')
    syncDefaultDiffMode(desktopMediaQuery.matches)
    desktopMediaQuery.addEventListener('change', handleViewportChange)
  }

  try {
    revisions.value = await getChapterRevisions(chapterId.value)
    if (!revision.value) error.value = 'This saved version could not be found.'
  } catch (loadError) {
    console.error('Failed to load chapter version:', loadError)
    error.value = 'This saved version could not be loaded.'
  } finally {
    loading.value = false
  }
})

onUnmounted(() => desktopMediaQuery?.removeEventListener('change', handleViewportChange))
</script>

<template>
  <main class="min-h-full bg-gray-50 px-4 py-6 dark:bg-navy-900 sm:px-6 lg:px-8">
    <div class="mx-auto max-w-screen-2xl">
      <RouterLink
        :to="revision ? chapterUrl : bookUrl"
        class="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gold-700 dark:text-gray-300 dark:hover:text-gold-300"
      >
        <ArrowLeftIcon class="h-4 w-4" />
        {{ revision ? 'Back to chapter' : 'Back to book' }}
      </RouterLink>

      <div v-if="loading" class="flex h-64 items-center justify-center">
        <div class="h-8 w-8 animate-spin rounded-full border-b-2 border-gold-600"></div>
      </div>

      <section v-else-if="error || !revision" class="mt-6 rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-navy-800">
        <h1 class="text-xl font-semibold text-gray-900 dark:text-white">Version unavailable</h1>
        <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">{{ error }}</p>
      </section>

      <template v-else>
        <header class="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-navy-800">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-gold-700 dark:text-gold-300">
                {{ revision.discarded_at ? 'Discarded chapter revision' : 'Saved chapter version' }}
              </p>
              <h1 class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{{ revision.title || 'Untitled chapter' }}</h1>
              <p class="mt-2 flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                <ClockIcon class="h-4 w-4" />
                {{ formatDate(revision.created_at) }}
              </p>
            </div>
            <div class="flex flex-col items-end gap-3">
            <div class="rounded-lg bg-gray-50 px-4 py-3 text-sm dark:bg-navy-900">
              <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span class="font-medium text-emerald-600 dark:text-emerald-400">
                  +{{ displayedAdded.toLocaleString() }} {{ displayedAdded === 1 ? 'addition' : 'additions' }}
                </span>
                <span class="font-medium text-rose-600 dark:text-rose-400">
                  −{{ displayedRemoved.toLocaleString() }} {{ displayedRemoved === 1 ? 'deletion' : 'deletions' }}
                </span>
                <span class="text-gray-500 dark:text-gray-400">
                  {{ revision.word_count.toLocaleString() }} words {{ revision.discarded_at ? 'recorded before discard' : 'in this version' }}
                </span>
              </div>
              <div
                v-if="displayedAdded + displayedRemoved > 0"
                class="mt-2 flex h-2 w-full min-w-48 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
                :aria-label="`${displayedAdded.toLocaleString()} additions and ${displayedRemoved.toLocaleString()} deletions`"
                role="img"
              >
                <span
                  class="bg-emerald-500"
                  :style="{ width: `${(displayedAdded / (displayedAdded + displayedRemoved)) * 100}%` }"
                ></span>
                <span class="flex-1 bg-rose-500"></span>
              </div>
            </div>
              <span v-if="revision.discarded_at" class="text-xs font-medium text-gray-500 dark:text-gray-400">Snapshot permanently discarded</span>
              <span v-else-if="revisionIndex === 0" class="text-xs font-medium text-gray-500 dark:text-gray-400">Current saved version</span>
              <div v-else class="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  data-testid="open-restore"
                  class="inline-flex items-center gap-2 rounded-lg border border-gold-500 px-3 py-2 text-sm font-medium text-gold-700 hover:bg-gold-50 dark:text-gold-300 dark:hover:bg-gold-900/20"
                  @click="showRestoreConfirmation = true; showDiscardConfirmation = false"
                >
                  <ArrowPathIcon class="h-4 w-4" />
                  Restore this version
                </button>
                <button
                  v-if="canDiscardRevision"
                  type="button"
                  data-testid="open-discard"
                  class="inline-flex items-center gap-2 rounded-lg border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-900/20"
                  @click="showDiscardConfirmation = true; showRestoreConfirmation = false"
                >
                  <TrashIcon class="h-4 w-4" />
                  Discard revision
                </button>
              </div>
            </div>
          </div>

          <div v-if="comparisonAvailable && revision.title !== previousRevision?.title" class="mt-5 grid gap-3 border-t border-gray-200 pt-5 text-sm dark:border-gray-700 sm:grid-cols-2">
            <div v-if="previousRevision" class="rounded-lg bg-rose-50 px-3 py-2 dark:bg-rose-900/20">
              <span class="block text-xs text-rose-600 dark:text-rose-300">Previous title</span>
              <span class="text-gray-800 dark:text-gray-200">{{ previousRevision.title || 'Untitled chapter' }}</span>
            </div>
            <div class="rounded-lg bg-emerald-50 px-3 py-2 dark:bg-emerald-900/20">
              <span class="block text-xs text-emerald-600 dark:text-emerald-300">Saved title</span>
              <span class="text-gray-800 dark:text-gray-200">{{ revision.title || 'Untitled chapter' }}</span>
            </div>
          </div>
        </header>

        <section v-if="showRestoreConfirmation" class="mt-4 rounded-xl border border-gold-300 bg-gold-50 p-4 dark:border-gold-700 dark:bg-gold-900/20">
          <h2 class="font-semibold text-gray-900 dark:text-white">Restore this saved version?</h2>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">
            The chapter will use this title and text again. Your newer versions will remain in history, and the restoration will be recorded as a new version.
          </p>
          <p v-if="restoreError" class="mt-2 text-sm text-rose-600 dark:text-rose-300">{{ restoreError }}</p>
          <div class="mt-4 flex gap-2">
            <button type="button" data-testid="confirm-restore" class="rounded-lg bg-gold-600 px-4 py-2 text-sm font-medium text-white hover:bg-gold-500 disabled:opacity-60" :disabled="restoring" @click="restoreVersion">
              {{ restoring ? 'Restoring…' : 'Restore version' }}
            </button>
            <button type="button" class="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-white dark:text-gray-300 dark:hover:bg-navy-800" :disabled="restoring" @click="showRestoreConfirmation = false">
              Cancel
            </button>
          </div>
        </section>

        <section v-if="showDiscardConfirmation" class="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-4 dark:border-rose-700 dark:bg-rose-900/20">
          <h2 class="font-semibold text-gray-900 dark:text-white">Permanently discard this revision?</h2>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Its title, date, word count, and change totals will remain as a tombstone, but its saved text and original diff cannot be recovered. If a later revision was compared with this one, that comparison will also become unavailable.
          </p>
          <p class="mt-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            Your current chapter and writing activity will not change.
          </p>
          <p v-if="discardError" class="mt-2 text-sm text-rose-600 dark:text-rose-300">{{ discardError }}</p>
          <div class="mt-4 flex gap-2">
            <button type="button" data-testid="confirm-discard" class="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-60" :disabled="discarding" @click="discardVersion">
              {{ discarding ? 'Discarding…' : 'Discard revision permanently' }}
            </button>
            <button type="button" class="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-white dark:text-gray-300 dark:hover:bg-navy-800" :disabled="discarding" @click="showDiscardConfirmation = false">
              Cancel
            </button>
          </div>
        </section>

        <section v-if="revision.discarded_at" class="mt-6 rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-navy-800">
          <TrashIcon class="mx-auto h-9 w-9 text-gray-400" />
          <h2 class="mt-3 text-lg font-semibold text-gray-900 dark:text-white">Revision discarded</h2>
          <p class="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500 dark:text-gray-400">
            The saved text and original comparison were permanently removed. This tombstone remains so the chapter history and activity heatmap still record when the save occurred.
          </p>
        </section>

        <section v-else-if="!comparisonAvailable" class="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-8 text-center shadow-sm dark:border-amber-800 dark:bg-amber-900/20">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Original comparison unavailable</h2>
          <p class="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-600 dark:text-gray-300">
            This revision followed a snapshot that was discarded. Its historical change totals remain above, but reconstructing the original diff would require the removed text.
          </p>
        </section>

        <section v-else class="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-navy-800">
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-4 dark:border-gray-700 sm:px-6">
            <div>
              <h2 class="font-semibold text-gray-900 dark:text-white">What changed</h2>
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {{ previousRevision ? 'Compared with the preceding saved version.' : 'This is the first recorded version.' }}
              </p>
            </div>
            <div class="inline-flex rounded-lg border border-gray-300 bg-white p-0.5 text-xs shadow-sm dark:border-gray-600 dark:bg-navy-900" aria-label="Diff layout">
              <button
                type="button"
                class="rounded-md px-3 py-1.5 font-medium transition-colors"
                :class="diffMode === 'split' ? 'bg-navy-800 text-white dark:bg-gold-500 dark:text-navy-950' : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'"
                :aria-pressed="diffMode === 'split'"
                @click="setDiffMode('split')"
              >
                Side by side
              </button>
              <button
                type="button"
                class="rounded-md px-3 py-1.5 font-medium transition-colors"
                :class="diffMode === 'unified' ? 'bg-navy-800 text-white dark:bg-gold-500 dark:text-navy-950' : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'"
                :aria-pressed="diffMode === 'unified'"
                @click="setDiffMode('unified')"
              >
                Unified
              </button>
            </div>
          </div>

          <div v-if="diffMode === 'split'" data-testid="split-diff" class="overflow-x-auto">
            <div class="grid min-w-[48rem] grid-cols-2 divide-x divide-gray-200 dark:divide-gray-700">
              <section>
                <div class="border-b border-gray-200 bg-gray-50 px-6 py-2.5 text-xs font-semibold text-gray-600 dark:border-gray-700 dark:bg-navy-900 dark:text-gray-300">
                  Previous version
                  <span v-if="previousRevision" class="ml-1 font-normal text-gray-500">· {{ formatDate(previousRevision.created_at) }}</span>
                </div>
                <div v-if="previousRevision" class="p-6 text-base leading-7 text-gray-700 dark:text-gray-200">
                  <span
                    v-for="(segment, index) in diff.filter((item) => item.type !== 'added')"
                    :key="index"
                    class="whitespace-pre-wrap"
                    :class="{ 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-100': segment.type === 'removed' }"
                  >{{ segment.text }}</span>
                </div>
                <p v-else class="p-6 text-sm italic text-gray-500 dark:text-gray-400">No preceding saved version.</p>
              </section>

              <section>
                <div class="border-b border-gray-200 bg-gray-50 px-6 py-2.5 text-xs font-semibold text-gray-600 dark:border-gray-700 dark:bg-navy-900 dark:text-gray-300">
                  Saved version <span class="ml-1 font-normal text-gray-500">· {{ formatDate(revision.created_at) }}</span>
                </div>
                <div class="p-6 text-base leading-7 text-gray-700 dark:text-gray-200">
                  <span
                    v-for="(segment, index) in diff.filter((item) => item.type !== 'removed')"
                    :key="index"
                    class="whitespace-pre-wrap"
                    :class="{ 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100': segment.type === 'added' }"
                  >{{ segment.text }}</span>
                </div>
              </section>
            </div>
          </div>

          <div v-else data-testid="unified-diff" class="p-6 text-base leading-7 text-gray-700 dark:text-gray-200">
            <span
              v-for="(segment, index) in diff"
              :key="index"
              class="whitespace-pre-wrap"
              :class="{
                'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100': segment.type === 'added',
                'bg-rose-100 text-rose-800 line-through dark:bg-rose-900/40 dark:text-rose-100': segment.type === 'removed',
              }"
            >{{ segment.text }}</span>
          </div>
        </section>
      </template>
    </div>
  </main>
</template>
