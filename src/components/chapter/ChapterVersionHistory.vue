<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ClockIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/vue/24/outline'
import type { ChapterRevision } from '@/lib/database'
import { createRevisionDiff } from '@/lib/revisionDiff'

const props = defineProps<{
  revisions: ChapterRevision[]
  loading?: boolean
}>()

const expanded = ref(false)
const selectedId = ref<string | null>(null)

watch(
  () => props.revisions[0]?.id,
  () => {
    selectedId.value = props.revisions[0]?.id ?? null
  },
  { immediate: true },
)

const selectedIndex = computed(() => props.revisions.findIndex((revision) => revision.id === selectedId.value))
const selectedRevision = computed(() => props.revisions[selectedIndex.value] ?? null)
const previousRevision = computed(() => props.revisions[selectedIndex.value + 1] ?? null)
const diff = computed(() => createRevisionDiff(previousRevision.value?.text ?? '', selectedRevision.value?.text ?? ''))

const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
}).format(new Date(value))
</script>

<template>
  <section id="chapter-versions" class="scroll-mt-20 rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-navy-800">
    <button
      type="button"
      class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <span class="flex items-center gap-2">
        <ClockIcon class="h-5 w-5 text-gold-600" />
        <span>
          <span class="block text-sm font-semibold text-gray-900 dark:text-white">Chapter versions</span>
          <span class="block text-xs text-gray-500 dark:text-gray-400">
            {{ revisions.length }} saved {{ revisions.length === 1 ? 'version' : 'versions' }}
          </span>
        </span>
      </span>
      <ChevronUpIcon v-if="expanded" class="h-4 w-4 text-gray-500" />
      <ChevronDownIcon v-else class="h-4 w-4 text-gray-500" />
    </button>

    <div v-if="expanded" class="border-t border-gray-200 dark:border-gray-700">
      <p v-if="loading" class="px-4 py-5 text-sm text-gray-500">Loading versions…</p>
      <p v-else-if="revisions.length === 0" class="px-4 py-5 text-sm text-gray-500 dark:text-gray-400">
        Your next chapter save will appear here.
      </p>
      <template v-else>
        <div class="max-h-56 overflow-y-auto border-b border-gray-200 dark:border-gray-700">
          <button
            v-for="revision in revisions"
            :key="revision.id"
            type="button"
            class="flex w-full items-center justify-between gap-3 border-l-2 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-navy-700"
            :class="selectedId === revision.id ? 'border-gold-500 bg-gold-50/60 dark:bg-gold-900/10' : 'border-transparent'"
            @click="selectedId = revision.id"
          >
            <span>
              <span class="block text-sm font-medium text-gray-900 dark:text-white">
                {{ revision.revision_kind === 'baseline' ? 'Original version' : formatDate(revision.created_at) }}
              </span>
              <span class="text-xs text-gray-500 dark:text-gray-400">{{ revision.word_count.toLocaleString() }} words</span>
            </span>
            <span v-if="revision.revision_kind === 'save'" class="shrink-0 text-xs">
              <span class="text-emerald-600">+{{ revision.words_added }}</span>
              <span class="ml-2 text-rose-600">−{{ revision.words_removed }}</span>
            </span>
          </button>
        </div>

        <div v-if="selectedRevision" class="p-4">
          <div v-if="selectedRevision.title !== previousRevision?.title" class="mb-3 text-xs text-gray-500 dark:text-gray-400">
            Title: <span class="font-medium text-gray-800 dark:text-gray-200">{{ selectedRevision.title || 'Untitled' }}</span>
          </div>
          <div class="max-h-80 overflow-y-auto rounded-md bg-gray-50 p-3 text-sm leading-6 text-gray-700 dark:bg-navy-900 dark:text-gray-300">
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
          <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
            <template v-if="previousRevision">Compared with the preceding saved version.</template>
            <template v-else>First recorded version of this chapter.</template>
          </p>
        </div>
      </template>
    </div>
  </section>
</template>
