<script setup lang="ts">
import { computed } from 'vue'
import type { PropType } from 'vue'
import { PencilIcon, SparklesIcon, ClockIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/vue/24/outline'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'

type CharacterWikiInfo = {
  id: string
  character_name: string
  wiki_page_id: string | null
  has_wiki_page: boolean
}

interface WikiUpdateResult {
  characterName: string
  wikiPageId: string
  updateType: 'created' | 'updated' | 'unchanged'
}

const props = defineProps({
  chapterSummary: {
    type: String,
    default: '',
  },
  chapterPov: {
    type: String as PropType<string | undefined>,
    default: undefined,
  },
  chapterCharacters: {
    type: Array as PropType<string[]>,
    default: () => [],
  },
  chapterBeats: {
    type: Array as PropType<string[]>,
    default: () => [],
  },
  isEditingSummary: {
    type: Boolean,
    default: false,
  },
  editedSummary: {
    type: String,
    default: '',
  },
  generatingSummary: {
    type: Boolean,
    default: false,
  },
  savingSummary: {
    type: Boolean,
    default: false,
  },
  summaryProgress: {
    type: String,
    default: '',
  },
  summaryError: {
    type: String as PropType<string | null>,
    default: null,
  },
  wikiUpdateResults: {
    type: Array as PropType<WikiUpdateResult[]>,
    default: () => [],
  },
  showWikiUpdateResults: {
    type: Boolean,
    default: false,
  },
  characterLookup: {
    type: Function as PropType<(name: string) => CharacterWikiInfo | undefined>,
    default: () => undefined,
  },
  routePrefix: {
    type: String,
    default: '/books',
  },
  bookId: {
    type: String,
    default: '',
  },
})

const emit = defineEmits<{
  (e: 'update:editedSummary', value: string): void
  (e: 'start-edit'): void
  (e: 'cancel-edit'): void
  (e: 'save'): void
  (e: 'generate'): void
  (e: 'character-click', name: string): void
  (e: 'dismiss-wiki-results'): void
}>()

const hasCharacters = computed(() => props.chapterCharacters && props.chapterCharacters.length > 0)
const hasBeats = computed(() => props.chapterBeats && props.chapterBeats.length > 0)
</script>

<template>
  <div class="py-4">
    <div>
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Chapter Summary</h3>
        <div class="flex items-center space-x-2">
          <button
            v-if="chapterSummary && !isEditingSummary"
            @click="emit('start-edit')"
            class="inline-flex items-center px-2 py-1 text-xs text-blue-600 transition-colors hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            title="Edit summary"
          >
            <PencilIcon class="mr-1 h-3 w-3" />
            Edit
          </button>
          <button
            @click="emit('generate')"
            :disabled="generatingSummary || isEditingSummary"
            class="inline-flex items-center rounded-md bg-green-600 px-3 py-1 text-sm text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <SparklesIcon class="mr-1 h-4 w-4" />
            {{ generatingSummary ? 'Generating...' : chapterSummary ? 'Regenerate' : 'Generate' }}
          </button>
        </div>
      </div>

      <!-- Progress indicator -->
      <div v-if="generatingSummary" class="rounded-md border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
        <div class="flex items-center">
          <div class="mr-3 h-5 w-5 animate-spin rounded-full border-2 border-green-600 border-t-transparent"></div>
          <span class="text-sm font-medium text-green-700 dark:text-green-300">
            {{ summaryProgress || 'Generating summary...' }}
          </span>
        </div>
      </div>

      <!-- Error message -->
      <div v-if="summaryError" class="rounded-md border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
        <div class="flex items-start">
          <XCircleIcon class="mr-2 h-5 w-5 flex-shrink-0 text-red-500" />
          <div>
            <p class="text-sm font-medium text-red-700 dark:text-red-300">Failed to generate summary</p>
            <p class="mt-1 text-sm text-red-600 dark:text-red-400">{{ summaryError }}</p>
          </div>
        </div>
      </div>

      <!-- Wiki update results -->
      <div
        v-if="showWikiUpdateResults && wikiUpdateResults.length > 0"
        class="rounded-md border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20"
      >
        <div class="flex items-start justify-between">
          <div class="flex items-center">
            <CheckCircleIcon class="mr-2 h-5 w-5 text-blue-500" />
            <span class="text-sm font-medium text-blue-700 dark:text-blue-300">Wiki pages updated</span>
          </div>
          <button
            @click="emit('dismiss-wiki-results')"
            class="text-blue-500 hover:text-blue-700 dark:hover:text-blue-300"
          >
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="mt-2 space-y-1">
          <router-link
            v-for="result in wikiUpdateResults"
            :key="result.wikiPageId"
            :to="`${routePrefix}/${bookId}/wiki/${result.wikiPageId}`"
            class="flex items-center text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          >
            <span
              :class="[
                'mr-2 inline-block rounded px-1.5 py-0.5 text-xs font-medium',
                result.updateType === 'created'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                  : result.updateType === 'updated'
                    ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
              ]"
            >
              {{ result.updateType === 'created' ? 'New' : result.updateType === 'updated' ? 'Updated' : 'No changes' }}
            </span>
            {{ result.characterName }}
          </router-link>
        </div>
      </div>

      <template v-else-if="chapterSummary || isEditingSummary">
        <div class="space-y-4 text-sm">
          <div>
            <div class="mb-2 flex items-center justify-between">
              <h4 class="font-medium text-gray-900 dark:text-white">Summary</h4>
              <div v-if="isEditingSummary" class="flex items-center space-x-2">
                <button
                  @click="emit('cancel-edit')"
                  class="px-2 py-1 text-xs text-gray-600 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  @click="emit('save')"
                  :disabled="savingSummary || !editedSummary.trim()"
                  class="inline-flex items-center rounded bg-blue-600 px-2 py-1 text-xs text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span
                    v-if="savingSummary"
                    class="mr-1 h-3 w-3 animate-spin rounded-full border border-white border-t-transparent"
                  ></span>
                  {{ savingSummary ? 'Saving...' : 'Save' }}
                </button>
              </div>
            </div>

            <textarea
              v-if="isEditingSummary"
              :value="editedSummary"
              rows="6"
              class="w-full resize-vertical rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-500 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
              placeholder="Enter chapter summary..."
              @input="emit('update:editedSummary', ($event.target as HTMLTextAreaElement).value)"
            ></textarea>
            <MarkdownRenderer
              v-else
              :text="chapterSummary || ''"
              class="text-gray-700 dark:text-gray-300"
            />
          </div>

          <div v-if="chapterPov">
            <h4 class="mb-1 font-medium text-gray-900 dark:text-white">POV</h4>
            <p class="text-gray-700 dark:text-gray-300">{{ chapterPov }}</p>
          </div>

          <div v-if="hasCharacters" class="space-y-1">
            <h4 class="font-medium text-gray-900 dark:text-white">Characters</h4>
            <div class="flex flex-wrap gap-1">
              <button
                v-for="character in chapterCharacters"
                :key="character"
                @click="emit('character-click', character)"
                :class="[
                  'inline-block rounded px-2 py-1 text-xs transition-colors',
                  characterLookup(character)?.has_wiki_page
                    ? 'cursor-pointer bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:hover:bg-blue-800'
                    : 'cursor-default bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
                ]"
                :disabled="!characterLookup(character)?.has_wiki_page"
                :title="characterLookup(character)?.has_wiki_page
                  ? `View ${character}'s wiki page`
                  : `${character} (no wiki page)`"
              >
                {{ character }}
              </button>
            </div>
          </div>

          <div v-if="hasBeats">
            <h4 class="font-medium text-gray-900 dark:text-white">Key Beats</h4>
            <ul class="space-y-1 text-gray-700 dark:text-gray-300">
              <li v-for="beat in chapterBeats" :key="beat" class="text-xs">• {{ beat }}</li>
            </ul>
          </div>
        </div>
      </template>

      <div v-else class="py-4 text-center text-gray-500 dark:text-gray-400">
        <ClockIcon class="mx-auto mb-2 h-8 w-8 text-gray-300" />
        <p class="text-sm">Generate a summary to track key plot points and characters.</p>
      </div>
    </div>
  </div>
</template>
