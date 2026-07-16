<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Modal from './Modal.vue'
import FindReplaceDocumentResult from './search/FindReplaceDocumentResult.vue'
import type {
  FindReplaceDocument,
  FindReplaceScope,
  FindReplaceSearchRequest,
  ReplaceFindReplaceMatchesRequest,
  TextMatch,
} from '@/lib/findReplace'

interface SearchService {
  findReplaceMatches: (request: FindReplaceSearchRequest) => Promise<FindReplaceDocument[]>
  replaceFindReplaceMatches: (request: ReplaceFindReplaceMatchesRequest) => Promise<unknown>
}

interface Props {
  show: boolean
  bookId: string
  searchService: SearchService
  initialScope?: FindReplaceScope
  targetId?: string
}

const props = withDefaults(defineProps<Props>(), {
  initialScope: 'book',
  targetId: undefined,
})

const emit = defineEmits<{
  close: []
  refresh: []
}>()

const router = useRouter()
const searchTerm = ref('')
const replaceTerm = ref('')
const replacementReady = ref(false)
const currentScope = ref<FindReplaceScope>(props.initialScope)
const isSearching = ref(false)
const errorMessage = ref('')
const documents = ref<FindReplaceDocument[]>([])
const expandedDocumentIds = ref(new Set<string>())
const selectedMatchIds = ref(new Set<string>())
const replacingMatchId = ref<string | null>(null)
const replacingDocumentId = ref<string | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)

let searchTimeout: ReturnType<typeof setTimeout> | null = null

const totalMatches = computed(() =>
  documents.value.reduce((total, document) => total + document.matches.length, 0),
)
const isReplacing = computed(
  () => replacingMatchId.value !== null || replacingDocumentId.value !== null,
)
const availableScopes = computed(() => {
  const scopes: Array<{ value: FindReplaceScope; label: string }> = [
    { value: 'book', label: 'Entire book' },
  ]

  if (props.targetId && props.initialScope === 'chapter') {
    scopes.unshift({ value: 'chapter', label: 'Current chapter' })
  } else if (props.targetId && props.initialScope === 'wikiPage') {
    scopes.unshift({ value: 'wikiPage', label: 'Current wiki page' })
  }

  return scopes
})

function documentKey(document: FindReplaceDocument): string {
  return `${document.targetType}:${document.targetId}`
}

async function runSearch(): Promise<void> {
  if (!searchTerm.value.trim()) {
    documents.value = []
    selectedMatchIds.value = new Set()
    errorMessage.value = ''
    return
  }

  isSearching.value = true
  errorMessage.value = ''
  try {
    const results = await props.searchService.findReplaceMatches({
      bookId: props.bookId,
      searchTerm: searchTerm.value,
      scope: currentScope.value,
      targetId: currentScope.value === 'book' ? undefined : props.targetId,
    })
    documents.value = results

    const availableMatchIds = new Set(results.flatMap((document) => document.matches.map((match) => match.id)))
    selectedMatchIds.value = new Set(
      [...selectedMatchIds.value].filter((matchId) => availableMatchIds.has(matchId)),
    )

    const availableDocumentIds = new Set(results.map(documentKey))
    const preservedExpandedIds = [...expandedDocumentIds.value].filter((id) =>
      availableDocumentIds.has(id),
    )
    if (preservedExpandedIds.length === 0 && results[0]) {
      preservedExpandedIds.push(documentKey(results[0]))
    }
    expandedDocumentIds.value = new Set(preservedExpandedIds)
  } catch (error) {
    console.error('Search error:', error)
    documents.value = []
    errorMessage.value = error instanceof Error ? error.message : 'Search failed'
  } finally {
    isSearching.value = false
  }
}

function scheduleSearch(): void {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => void runSearch(), 300)
}

function setReplacementReady(): void {
  replacementReady.value = true
}

function toggleExpanded(document: FindReplaceDocument): void {
  const key = documentKey(document)
  const next = new Set(expandedDocumentIds.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedDocumentIds.value = next
}

function toggleMatch(matchId: string, selected: boolean): void {
  const next = new Set(selectedMatchIds.value)
  if (selected) next.add(matchId)
  else next.delete(matchId)
  selectedMatchIds.value = next
}

function selectAllInDocument(document: FindReplaceDocument, selected: boolean): void {
  const next = new Set(selectedMatchIds.value)
  for (const match of document.matches) {
    if (selected) next.add(match.id)
    else next.delete(match.id)
  }
  selectedMatchIds.value = next
}

async function replaceMatches(document: FindReplaceDocument, matches: TextMatch[]): Promise<void> {
  if (!replacementReady.value || matches.length === 0) return

  errorMessage.value = ''
  try {
    await props.searchService.replaceFindReplaceMatches({
      targetType: document.targetType,
      targetId: document.targetId,
      replacement: replaceTerm.value,
      expectedFields: document.fields,
      matches,
    })
    emit('refresh')
    await runSearch()
  } catch (error) {
    console.error('Replace error:', error)
    const message = error instanceof Error ? error.message : 'Replacement failed'
    await runSearch()
    errorMessage.value = message
  }
}

async function replaceOne(document: FindReplaceDocument, match: TextMatch): Promise<void> {
  replacingMatchId.value = match.id
  try {
    await replaceMatches(document, [match])
  } finally {
    replacingMatchId.value = null
  }
}

async function replaceSelectedInDocument(document: FindReplaceDocument): Promise<void> {
  const matches = document.matches.filter((match) => selectedMatchIds.value.has(match.id))
  replacingDocumentId.value = document.targetId
  try {
    await replaceMatches(document, matches)
  } finally {
    replacingDocumentId.value = null
  }
}

async function replaceAllInDocument(document: FindReplaceDocument): Promise<void> {
  replacingDocumentId.value = document.targetId
  try {
    await replaceMatches(document, document.matches)
  } finally {
    replacingDocumentId.value = null
  }
}

function navigateToDocument(document: FindReplaceDocument): void {
  emit('close')
  const path = document.targetType === 'chapter'
    ? `/books/${props.bookId}/chapters/${document.targetId}`
    : `/books/${props.bookId}/wiki/${document.targetId}`
  void router.push(path)
}

watch(currentScope, () => void runSearch())

watch(
  () => props.show,
  async (show) => {
    if (show) {
      currentScope.value = props.targetId ? props.initialScope : 'book'
      await nextTick()
      searchInputRef.value?.focus()
      return
    }

    if (searchTimeout) clearTimeout(searchTimeout)
    searchTerm.value = ''
    replaceTerm.value = ''
    replacementReady.value = false
    documents.value = []
    selectedMatchIds.value = new Set()
    expandedDocumentIds.value = new Set()
    errorMessage.value = ''
  },
)
</script>

<template>
  <Modal :show="show" title="Search and Replace" max-width="4xl" @close="emit('close')">
    <div class="space-y-6 p-6">
      <div class="grid gap-4 md:grid-cols-2">
        <div>
          <label for="search-input" class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Search term
          </label>
          <input
            id="search-input"
            ref="searchInputRef"
            v-model="searchTerm"
            type="text"
            class="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            placeholder="Enter text to search for…"
            @input="scheduleSearch"
          />
        </div>
        <div>
          <label for="replace-input" class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Replace with
          </label>
          <input
            id="replace-input"
            v-model="replaceTerm"
            type="text"
            class="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            placeholder="Enter replacement text, or leave empty to delete…"
            @input="setReplacementReady"
          />
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3">
        <label class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          Scope
          <select
            v-model="currentScope"
            class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
            <option v-for="scope in availableScopes" :key="scope.value" :value="scope.value">
              {{ scope.label }}
            </option>
          </select>
        </label>

        <p v-if="totalMatches > 0" class="text-sm text-gray-500 dark:text-gray-400">
          {{ totalMatches }} {{ totalMatches === 1 ? 'match' : 'matches' }} in
          {{ documents.length }} {{ documents.length === 1 ? 'document' : 'documents' }}
        </p>
      </div>

      <div v-if="errorMessage" class="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
        {{ errorMessage }}
      </div>

      <div v-if="isSearching" class="py-8 text-center">
        <div class="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
        <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">Searching…</p>
      </div>

      <div
        v-else-if="searchTerm && documents.length === 0"
        class="py-8 text-center text-gray-500 dark:text-gray-400"
      >
        No results found for “{{ searchTerm }}”
      </div>

      <div v-else-if="documents.length > 0" class="space-y-4">
        <FindReplaceDocumentResult
          v-for="document in documents"
          :key="documentKey(document)"
          :document="document"
          :expanded="expandedDocumentIds.has(documentKey(document))"
          :selected-match-ids="selectedMatchIds"
          :replacing-match-id="replacingMatchId"
          :replacing-document-id="replacingDocumentId"
          :replacement-ready="replacementReady"
          :disabled="isReplacing"
          @toggle-expanded="toggleExpanded(document)"
          @toggle-match="toggleMatch"
          @select-all="selectAllInDocument(document, $event)"
          @replace-match="replaceOne(document, $event)"
          @replace-selected="replaceSelectedInDocument(document)"
          @replace-all="replaceAllInDocument(document)"
          @navigate="navigateToDocument(document)"
        />
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end">
        <button
          type="button"
          class="rounded-md bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          @click="emit('close')"
        >
          Close
        </button>
      </div>
    </template>
  </Modal>
</template>
