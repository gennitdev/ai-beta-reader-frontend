<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowDownTrayIcon, PencilIcon } from '@heroicons/vue/24/outline'
import TextEditor from '@/components/TextEditor.vue'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import WikiPageTagInput, { type WikiPageOption } from '@/components/images/WikiPageTagInput.vue'
import type { ImageAsset, ImageWikiTag } from '@/lib/database'

const props = defineProps<{
  image: ImageAsset | null
  imageSrc: string | null
  wikiPages?: WikiPageOption[]
  tags?: ImageWikiTag[]
  savingNotes?: boolean
  savingTags?: boolean
  canEditNotes?: boolean
  canEditTags?: boolean
  canDownload?: boolean
}>()

const emit = defineEmits<{
  'save-notes': [notes: string]
  'save-tags': [wikiPageIds: string[]]
  download: [imageId: string]
}>()

const isEditingNotes = ref(false)
const editedNotes = ref('')
const selectedWikiPageIds = ref<string[]>([])

const notes = computed(() => props.image?.notes ?? '')
const wikiPages = computed(() => props.wikiPages ?? [])
const tags = computed(() => props.tags ?? [])

watch(
  () => props.image?.id,
  () => {
    isEditingNotes.value = false
    editedNotes.value = notes.value
  },
  { immediate: true }
)

watch(
  tags,
  (nextTags) => {
    selectedWikiPageIds.value = nextTags.map((tag) => tag.wiki_page_id)
  },
  { immediate: true }
)

function startEditingNotes() {
  editedNotes.value = notes.value
  isEditingNotes.value = true
}

function cancelEditingNotes() {
  editedNotes.value = notes.value
  isEditingNotes.value = false
}

function saveNotes() {
  emit('save-notes', editedNotes.value)
  isEditingNotes.value = false
}

function updateTags(wikiPageIds: string[]) {
  selectedWikiPageIds.value = wikiPageIds
  emit('save-tags', wikiPageIds)
}
</script>

<template>
  <div v-if="image" class="flex h-full flex-col bg-white dark:bg-navy-900">
    <div class="flex min-h-0 flex-1 items-center justify-center bg-gray-100 p-4 dark:bg-navy-800">
      <img
        v-if="imageSrc"
        :src="imageSrc"
        class="max-h-full max-w-full rounded-lg object-contain shadow-lg"
        :alt="image.file_name || 'Illustration'"
      />
      <div v-else class="text-sm text-gray-500 dark:text-gray-400">
        Image data is not available.
      </div>
    </div>

    <div class="space-y-5 border-t border-gray-200 p-4 dark:border-gray-700">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <h2 class="truncate text-lg font-medium text-gray-900 dark:text-white">
            {{ image.file_name || 'Untitled' }}
          </h2>
          <p class="mt-1 text-sm capitalize text-gray-500 dark:text-gray-400">
            {{ image.asset_type.replace('_', ' ') }}
          </p>
        </div>
        <button
          v-if="canDownload"
          type="button"
          class="inline-flex items-center rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-navy-800"
          @click="emit('download', image.id)"
        >
          <ArrowDownTrayIcon class="mr-1.5 h-4 w-4" />
          Download
        </button>
      </div>

      <section v-if="canEditTags || tags.length" class="space-y-2">
        <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Wiki Tags</h3>
        <WikiPageTagInput
          v-if="canEditTags"
          :wiki-pages="wikiPages"
          :selected-ids="selectedWikiPageIds"
          :disabled="savingTags"
          @update:selected-ids="updateTags"
        />
        <div v-else class="flex flex-wrap gap-2">
          <span
            v-for="tag in tags"
            :key="tag.wiki_page_id"
            class="rounded-full bg-gold-50 px-2.5 py-1 text-xs font-medium text-gold-700 dark:bg-gold-900/30 dark:text-gold-200"
          >
            {{ tag.page_name }}
          </span>
        </div>
      </section>

      <section class="space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Notes</h3>
          <button
            v-if="canEditNotes && !isEditingNotes"
            type="button"
            class="inline-flex items-center text-xs font-medium text-gold-600 hover:text-gold-800 dark:text-gold-300 dark:hover:text-gold-200"
            @click="startEditingNotes"
          >
            <PencilIcon class="mr-1 h-3.5 w-3.5" />
            {{ notes ? 'Edit' : 'Add notes' }}
          </button>
        </div>

        <div v-if="isEditingNotes" class="space-y-3">
          <TextEditor
            :model-value="editedNotes"
            placeholder="Write image notes in Markdown..."
            height="220px"
            @update:model-value="editedNotes = $event"
          />
          <div class="flex justify-end gap-2">
            <button
              type="button"
              class="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
              @click="cancelEditingNotes"
            >
              Cancel
            </button>
            <button
              type="button"
              class="rounded-md bg-gold-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-gold-700 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="savingNotes"
              @click="saveNotes"
            >
              {{ savingNotes ? 'Saving...' : 'Save notes' }}
            </button>
          </div>
        </div>

        <div v-else-if="notes" class="prose prose-sm dark:prose-invert max-w-none">
          <MarkdownRenderer :text="notes" />
        </div>

        <p v-else class="text-sm text-gray-500 dark:text-gray-400">
          No notes yet.
        </p>
      </section>
    </div>
  </div>
</template>
