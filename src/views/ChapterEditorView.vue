<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDatabase } from '@/composables/useDatabase'
import TextEditor from '@/components/TextEditor.vue'
import { ArrowLeftIcon, CheckIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import type { BookPart } from '@/lib/database'

const route = useRoute()
const router = useRouter()

const bookId = route.params.bookId as string
const chapterId = route.params.chapterId as string
const isEditing = !!chapterId

// Use local database
const { chapters, loadChapters, saveChapter: dbSaveChapter, getParts } = useDatabase()

const loading = ref(false)
const saving = ref(false)
const chapter = ref({
  id: chapterId || '',
  title: '',
  text: ''
})
const generatedSuffix = ref(Date.now().toString(36).slice(-6))
const parts = ref<BookPart[]>([])
const selectedPartId = ref(
  !isEditing && typeof route.query.partId === 'string' ? (route.query.partId as string) : ''
)

const loadParts = async () => {
  try {
    const fetchedParts = await getParts(bookId)
    parts.value = fetchedParts

    if (!isEditing && selectedPartId.value) {
      const partExists = fetchedParts.some((part) => part.id === selectedPartId.value)
      if (!partExists) {
        selectedPartId.value = ''
      }
    }
  } catch (error) {
    console.error('Failed to load parts:', error)
  }
}

const loadChapter = async () => {
  if (!isEditing) return

  loading.value = true
  try {
    // Load chapters from database
    await loadChapters(bookId)

    // Find the chapter being edited
    const chapterData = chapters.value.find((ch: any) => ch.id === chapterId)

    if (chapterData) {
      chapter.value = {
        id: chapterData.id,
        title: chapterData.title || '',
        text: chapterData.text
      }
      selectedPartId.value = chapterData.part_id || ''
    } else {
      console.error('Chapter not found')
      router.push(`/books/${bookId}`)
    }
  } catch (error) {
    console.error('Failed to load chapter:', error)
  } finally {
    loading.value = false
  }
}

const createSlug = (value: string) => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
}

const generateChapterId = () => {
  const slug = createSlug(chapter.value.title)
  const fallback = `chapter-${Date.now().toString(36).slice(-6)}`
  chapter.value.id = slug ? `${slug}-${Date.now().toString(36).slice(-6)}` : fallback
}

const saveChapter = async () => {
  if (!chapter.value.title || !chapter.value.text) return

  if (!isEditing && !chapter.value.id) {
    generateChapterId()
  }

  saving.value = true
  try {
    // Calculate word count
    const wordCount = chapter.value.text.trim().split(/\s+/).length

    // Save to local database
    await dbSaveChapter({
      id: chapter.value.id,
      book_id: bookId,
      part_id: selectedPartId.value || null,
      title: chapter.value.title,
      text: chapter.value.text,
      word_count: wordCount,
      created_at: new Date().toISOString()
    })

    // Navigate to the chapter detail page
    router.push(`/books/${bookId}/chapters/${chapter.value.id}`)
  } catch (error) {
    console.error('Failed to save chapter:', error)
  } finally {
    saving.value = false
  }
}

const goBack = () => {
  router.push(`/books/${bookId}`)
}

onMounted(() => {
  loadParts()
  loadChapter()
})

watch(
  () => chapter.value.title,
  (newTitle) => {
    if (isEditing) return

    const slug = createSlug(newTitle)
    chapter.value.id = slug ? `${slug}-${generatedSuffix.value}` : ''
  },
)
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Header -->
    <div class="sticky top-0 z-40 bg-white/95 dark:bg-gray-800/95 backdrop-blur shadow-sm border-b border-gray-200 dark:border-gray-700">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center h-16">
          <div class="flex items-center">
            <button
              @click="goBack"
              class="mr-4 p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <ArrowLeftIcon class="w-5 h-5" />
            </button>
            <h1 class="text-xl font-semibold text-gray-900 dark:text-white">
              {{ isEditing ? 'Edit Chapter' : 'New Chapter' }}
            </h1>
          </div>

          <div class="flex items-center space-x-3">
            <button
              @click="goBack"
              class="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <XMarkIcon class="w-4 h-4 inline mr-2" />
              Cancel
            </button>
            <button
              @click="saveChapter"
              :disabled="!chapter.title || !chapter.text || saving"
              class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
            >
              <div v-if="saving" class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              <CheckIcon v-else class="w-4 h-4 mr-2" />
              {{ saving ? 'Saving...' : 'Save Chapter' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="flex justify-center items-center h-64">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>

    <!-- Main content -->
    <div v-else class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div class="p-6 space-y-6">
          <!-- Chapter Title -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label for="title" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Chapter Title
              </label>
              <input
                id="title"
                v-model="chapter.title"
                type="text"
                required
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter chapter title..."
              />
            </div>

            <div>
              <label for="id" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Chapter ID
              </label>
              <input
                id="id"
                v-model="chapter.id"
                type="text"
                readonly
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent opacity-75 cursor-not-allowed"
                placeholder="unique-chapter-id"
              />
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {{ isEditing ? 'ID cannot be changed when editing.' : 'Auto-generated and updates with the title. Copy only if you need it elsewhere.' }}
              </p>
            </div>

            <div>
              <label for="part" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Part
              </label>
              <select
                id="part"
                v-model="selectedPartId"
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Uncategorized</option>
                <option v-for="part in parts" :key="part.id" :value="part.id">
                  {{ part.name }}
                </option>
              </select>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Choose the part this chapter belongs to, or leave it uncategorized.
              </p>
            </div>
          </div>

          <!-- Chapter Text Editor -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Chapter Content
            </label>
            <div class="border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden">
              <TextEditor
                v-model="chapter.text"
                placeholder="Write your chapter content here..."
                height="600"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
