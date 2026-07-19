<script setup lang="ts">
import { computed } from 'vue'
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/vue/24/outline'
import FindReplaceMatchRow from './FindReplaceMatchRow.vue'
import type { FindReplaceDocument, TextMatch } from '@/lib/findReplace'

interface Props {
  document: FindReplaceDocument
  expanded: boolean
  selectedMatchIds: Set<string>
  replacingMatchId: string | null
  replacingDocumentId: string | null
  replacementReady: boolean
  disabled?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  toggleExpanded: []
  toggleMatch: [matchId: string, selected: boolean]
  selectAll: [selected: boolean]
  replaceMatch: [match: TextMatch]
  replaceSelected: []
  replaceAll: []
  navigate: []
}>()

const selectedCount = computed(() =>
  props.document.matches.filter((match) => props.selectedMatchIds.has(match.id)).length,
)
const allSelected = computed(
  () => props.document.matches.length > 0 && selectedCount.value === props.document.matches.length,
)
</script>

<template>
  <section class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-navy-800">
    <div class="flex flex-wrap items-center justify-between gap-3 p-4">
      <div class="flex min-w-0 items-center gap-2">
        <button
          type="button"
          class="rounded p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          :aria-label="expanded ? 'Collapse matches' : 'Expand matches'"
          @click="emit('toggleExpanded')"
        >
          <ChevronDownIcon v-if="expanded" class="h-5 w-5" />
          <ChevronRightIcon v-else class="h-5 w-5" />
        </button>
        <div class="min-w-0">
          <button
            type="button"
            class="block truncate text-left font-medium text-gray-900 hover:text-gold-600 hover:underline dark:text-white dark:hover:text-gold-400"
            @click="emit('navigate')"
          >
            {{ document.displayName }}
          </button>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {{ document.targetType === 'chapter' ? 'Chapter' : `Wiki ${document.pageType || 'page'}` }}
            · {{ document.matches.length }} {{ document.matches.length === 1 ? 'match' : 'matches' }}
          </p>
        </div>
      </div>

      <button
        v-if="replacementReady"
        type="button"
        :disabled="disabled"
        class="rounded bg-gold-600 px-3 py-1.5 text-sm text-white hover:bg-gold-700 disabled:cursor-not-allowed disabled:opacity-50"
        @click="emit('replaceAll')"
      >
        {{ replacingDocumentId === document.targetId ? 'Replacing…' : `Replace all ${document.matches.length}` }}
      </button>
    </div>

    <div v-if="expanded" class="space-y-3 border-t border-gray-200 p-4 dark:border-gray-700">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <label class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <input
            type="checkbox"
            :checked="allSelected"
            :disabled="disabled"
            class="rounded border-gray-300 text-gold-600 focus:ring-gold-500 dark:border-gray-600 dark:bg-navy-800"
            @change="emit('selectAll', ($event.target as HTMLInputElement).checked)"
          />
          Select all in this {{ document.targetType === 'chapter' ? 'chapter' : 'page' }}
        </label>

        <button
          v-if="replacementReady && selectedCount > 0"
          type="button"
          :disabled="disabled"
          class="rounded border border-gold-600 px-3 py-1 text-sm text-gold-600 hover:bg-gold-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gold-400 dark:hover:bg-gray-700"
          @click="emit('replaceSelected')"
        >
          Replace selected ({{ selectedCount }})
        </button>
      </div>

      <FindReplaceMatchRow
        v-for="match in document.matches"
        :key="match.id"
        :match="match"
        :selected="selectedMatchIds.has(match.id)"
        :replacing="replacingMatchId === match.id"
        :replacement-ready="replacementReady"
        :disabled="disabled"
        @toggle="emit('toggleMatch', match.id, $event)"
        @replace="emit('replaceMatch', match)"
      />
    </div>
  </section>
</template>
