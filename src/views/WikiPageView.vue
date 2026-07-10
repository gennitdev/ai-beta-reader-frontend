<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDatabase } from '@/composables/useDatabase'
import { useWikiImages } from '@/composables/useWikiImages'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import WikiPageHeroSection from '@/components/wiki/WikiPageHeroSection.vue'
import WikiPageIllustrationsSection from '@/components/wiki/WikiPageIllustrationsSection.vue'
import IllustrationDetail from '@/components/images/IllustrationDetail.vue'
import Modal from '@/components/Modal.vue'
import type { Book } from '@/lib/database'
import {
  ArrowLeftIcon,
  PencilIcon,
  ClockIcon,
  UserIcon,
  MapPinIcon,
  LightBulbIcon,
  BookOpenIcon,
  TrashIcon,
  BookmarkIcon,
} from '@heroicons/vue/24/outline'

interface WikiPage {
  id: string
  book_id: string
  page_name: string
  page_type: 'character' | 'location' | 'concept' | 'other'
  content: string
  summary: string | null
  aliases: string[]
  tags: string[]
  is_major: boolean
  is_pinned: boolean
  created_by_ai: boolean
  created_at: string
  updated_at: string
}

interface WikiUpdate {
  id: string
  update_type: string
  change_summary: string | null
  contradiction_notes: string | null
  created_at: string
  chapter_title: string | null
}

interface Character {
  id: string
  character_name: string
  wiki_page_id: string | null
  has_wiki_page: boolean
}

const route = useRoute()
const router = useRouter()
const emit = defineEmits<{
  (event: 'wiki-page-pin-changed', payload: { id: string; isPinned: boolean; updatedAt: string }): void
}>()

// Computed route parameters to handle both nested and standalone routes
const bookId = computed(() => (route.params.bookId || route.params.id) as string)
const wikiPageId = computed(() => route.params.wikiPageId as string)

// Mobile detection
const isMobileRoute = computed(() => route.meta?.mobile === true)

// Use local database
const {
  books,
  loadBooks,
  getWikiPageById,
  updateWikiPage,
  deleteWikiPage,
} = useDatabase()

// Use wiki images composable
const {
  wikiImages,
  wikiImagesLoading,
  wikiImageSources,
  wikiImageTags,
  bookWikiPages,
  wikiImageError,
  wikiCoverImageId,
  settingCoverId,
  showImageLightbox,
  activeImageSource,
  activeImage,
  activeImageTags,
  activeImageLabel,
  heroImageSrc,
  savingImageNotes,
  savingImageTags,
  refreshWikiImages,
  openImageModal,
  closeImageModal,
  handleSetAsCover,
  handleDownloadImage,
  handleSaveActiveImageNotes,
  handleSaveActiveImageTags,
  openHeroLightbox,
} = useWikiImages(
  () => wikiPageId.value,
  () => bookId.value
)

const wikiPage = ref<WikiPage | null>(null)
const wikiHistory = ref<WikiUpdate[]>([])
const characters = ref<Character[]>([])
const loading = ref(false)
const loadingHistory = ref(false)
const showHistory = ref(false)
const isEditing = ref(false)
const isEditingTags = ref(false)
const editedTags = ref<string[]>([])
const newTag = ref('')
const savingTags = ref(false)

// Feature flag for wiki history (disabled by default)
const isHistoryFeatureEnabled = computed(() => import.meta.env.VITE_ENABLE_WIKI_HISTORY === 'true')
const editedContent = ref('')
const saving = ref(false)

// Page name editing state
const isEditingPageName = ref(false)
const editedPageName = ref('')

// Delete state
const showDeleteModal = ref(false)
const deleting = ref(false)

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'character': return UserIcon
    case 'location': return MapPinIcon
    case 'concept': return LightBulbIcon
    default: return BookOpenIcon
  }
}

const getTypeColor = (type: string) => {
  switch (type) {
    case 'character': return 'text-blue-600'
    case 'location': return 'text-green-600'
    case 'concept': return 'text-purple-600'
    default: return 'text-gray-600'
  }
}

// Computed book title from database
const bookTitle = computed(() => {
  try {
    if (books.value.length > 0) {
      const book = books.value.find((b: Book) => b.id === bookId.value)
      if (book) {
        return book.title
      }
    }
    return bookId.value // Fallback to bookId
  } catch (error) {
    console.error('Failed to load book title:', error)
    return bookId.value
  }
})

// Computed navigation URLs
// Always use /books/ prefix for going back, since /m/books/:id route doesn't exist
// BookView handles mobile display via CSS media queries
const bookWikiUrl = computed(() => `/books/${bookId.value}?tab=wiki`)

const parseStringArray = (value: unknown): string[] => {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry): entry is string => entry.length > 0)
  }
  if (typeof value !== 'string') return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed
          .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
          .filter((entry): entry is string => entry.length > 0)
      : []
  } catch {
    return []
  }
}

const normalizeTags = (tags: string[]): string[] => {
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const tag of tags) {
    const trimmed = tag.trim()
    if (!trimmed) continue
    const key = trimmed.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(trimmed)
  }

  return normalized
}

const loadWikiPage = async () => {
  loading.value = true
  try {
    // Load books for breadcrumb
    await loadBooks()

    // Load wiki page from local database
    const pageData = await getWikiPageById(wikiPageId.value)
    if (pageData) {
      wikiPage.value = {
        id: pageData.id,
        book_id: pageData.book_id,
        page_name: pageData.page_name,
        page_type: pageData.page_type || 'character',
        content: pageData.content || '',
        summary: pageData.summary || null,
        aliases: parseStringArray(pageData.aliases),
        tags: parseStringArray(pageData.tags),
        is_major: pageData.is_major || false,
        is_pinned: Boolean(pageData.is_pinned),
        created_by_ai: pageData.created_by_ai || false,
        created_at: pageData.created_at,
        updated_at: pageData.updated_at
      }
      editedContent.value = pageData.content || ''
      editedTags.value = parseStringArray(pageData.tags)
      newTag.value = ''
      isEditingTags.value = false
      await refreshWikiImages()
    } else {
      console.error('Wiki page not found')
      router.push(bookWikiUrl.value)
    }
  } catch (error) {
    console.error('Failed to load wiki page:', error)
    router.push(bookWikiUrl.value)
  } finally {
    loading.value = false
  }
}

const loadCharacters = async () => {
  // TODO: Load characters from local database if needed
  characters.value = []
}

const loadWikiHistory = async () => {
  // TODO: Load wiki history from local database
  wikiHistory.value = []
}

const saveChanges = async () => {
  if (!wikiPage.value || editedContent.value === wikiPage.value.content) return

  saving.value = true
  try {
    await updateWikiPage(wikiPageId.value, {
      content: editedContent.value
    })

    wikiPage.value.content = editedContent.value
    wikiPage.value.updated_at = new Date().toISOString()
    isEditing.value = false

    // Reload history if needed
    if (showHistory.value) {
      await loadWikiHistory()
    }
  } catch (error) {
    console.error('Failed to save wiki page:', error)
    alert('Failed to save changes')
  } finally {
    saving.value = false
  }
}

const startEditingPageName = () => {
  if (!wikiPage.value) return
  editedPageName.value = wikiPage.value.page_name
  isEditingPageName.value = true
}

const cancelEditPageName = () => {
  isEditingPageName.value = false
  editedPageName.value = ''
}

const savePageName = async () => {
  if (!wikiPage.value || !editedPageName.value.trim()) return

  saving.value = true
  try {
    await updateWikiPage(wikiPageId.value, {
      page_name: editedPageName.value.trim()
    })

    wikiPage.value.page_name = editedPageName.value.trim()
    wikiPage.value.updated_at = new Date().toISOString()
    isEditingPageName.value = false
    editedPageName.value = ''
  } catch (error) {
    console.error('Failed to rename wiki page:', error)
    alert('Failed to rename page')
  } finally {
    saving.value = false
  }
}

const cancelEdit = () => {
  if (!wikiPage.value) return
  editedContent.value = wikiPage.value.content
  isEditing.value = false
}

const startEditingTags = () => {
  if (!wikiPage.value) return
  editedTags.value = [...wikiPage.value.tags]
  newTag.value = ''
  isEditingTags.value = true
}

const cancelEditTags = () => {
  if (!wikiPage.value) return
  editedTags.value = [...wikiPage.value.tags]
  newTag.value = ''
  isEditingTags.value = false
}

const addTag = () => {
  const nextTag = newTag.value.trim()
  if (!nextTag) return
  editedTags.value = normalizeTags([...editedTags.value, nextTag])
  newTag.value = ''
}

const removeTag = (tagToRemove: string) => {
  editedTags.value = editedTags.value.filter((tag) => tag !== tagToRemove)
}

const saveTags = async () => {
  if (!wikiPage.value) return

  const normalizedTags = normalizeTags(editedTags.value)
  savingTags.value = true
  try {
    await updateWikiPage(wikiPageId.value, {
      tags: JSON.stringify(normalizedTags)
    })

    wikiPage.value.tags = normalizedTags
    wikiPage.value.updated_at = new Date().toISOString()
    editedTags.value = [...normalizedTags]
    newTag.value = ''
    isEditingTags.value = false
  } catch (error) {
    console.error('Failed to save wiki page tags:', error)
    alert('Failed to save tags')
  } finally {
    savingTags.value = false
  }
}

const togglePinned = async () => {
  if (!wikiPage.value) return

  const previousPinned = wikiPage.value.is_pinned
  const nextPinned = !wikiPage.value.is_pinned
  const updatedAt = new Date().toISOString()
  wikiPage.value.is_pinned = nextPinned
  wikiPage.value.updated_at = updatedAt
  emit('wiki-page-pin-changed', {
    id: wikiPage.value.id,
    isPinned: nextPinned,
    updatedAt
  })

  saving.value = true
  try {
    await updateWikiPage(wikiPageId.value, {
      is_pinned: nextPinned
    })
  } catch (error) {
    const rollbackUpdatedAt = new Date().toISOString()
    wikiPage.value.is_pinned = previousPinned
    wikiPage.value.updated_at = rollbackUpdatedAt
    emit('wiki-page-pin-changed', {
      id: wikiPage.value.id,
      isPinned: previousPinned,
      updatedAt: rollbackUpdatedAt
    })
    console.error('Failed to update wiki page pin:', error)
    alert('Failed to update pin')
  } finally {
    saving.value = false
  }
}

const goBack = () => {
  router.push(bookWikiUrl.value)
}

const confirmDelete = () => {
  showDeleteModal.value = true
}

const cancelDelete = () => {
  showDeleteModal.value = false
}

const handleDelete = async () => {
  if (!wikiPage.value) return

  deleting.value = true
  try {
    await deleteWikiPage(wikiPageId.value)
    showDeleteModal.value = false
    router.push(bookWikiUrl.value)
  } catch (error) {
    console.error('Failed to delete wiki page:', error)
    alert('Failed to delete wiki page')
  } finally {
    deleting.value = false
  }
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const toggleHistory = () => {
  showHistory.value = !showHistory.value
  if (showHistory.value && wikiHistory.value.length === 0) {
    loadWikiHistory()
  }
}

onMounted(() => {
  loadWikiPage()
  loadCharacters()
})

watch(
  () => wikiPageId.value,
  () => {
    loadWikiPage()
  }
)
</script>

<template>
  <div class="w-full">
    <!-- Hero Image Section -->
    <WikiPageHeroSection
      v-if="heroImageSrc && wikiPage"
      :hero-image-src="heroImageSrc"
      :book-title="bookTitle"
      :page-name="wikiPage.page_name"
      :page-type="wikiPage.page_type"
      :is-major="wikiPage.is_major"
      @open-lightbox="openHeroLightbox"
      @go-back="goBack"
    />

    <div class="mx-auto max-w-6xl p-6">
      <!-- Header (only show full header when no hero image) -->
      <div v-if="!heroImageSrc" class="mb-8">
        <nav class="breadcrumbs mb-4 text-sm">
          <router-link to="/books" class="text-blue-600 hover:text-blue-700">Books</router-link>
          <span class="mx-2 text-gray-500">></span>
          <router-link :to="bookWikiUrl" class="text-blue-600 hover:text-blue-700">
            {{ bookTitle }}
          </router-link>
          <span class="mx-2 text-gray-500">></span>
          <span class="text-gray-700 dark:text-gray-300">{{ wikiPage?.page_name || 'Loading...' }}</span>
        </nav>

        <div class="flex items-start justify-between">
          <div class="flex items-center space-x-4">
            <button
              @click="goBack"
              :class="isMobileRoute ? 'p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors' : 'lg:hidden p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors'"
            >
              <ArrowLeftIcon class="w-5 h-5" />
            </button>

          <div v-if="wikiPage" class="flex items-center space-x-3">
            <component :is="getTypeIcon(wikiPage.page_type)" :class="['w-8 h-8', getTypeColor(wikiPage.page_type)]" />
            <div class="flex-1">
              <!-- Editing mode -->
              <div v-if="isEditingPageName" class="flex items-center space-x-2">
                <input
                  v-model="editedPageName"
                  @keyup.enter="savePageName"
                  @keyup.esc="cancelEditPageName"
                  type="text"
                  class="text-3xl font-bold bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Page name"
                  autofocus
                />
                <button
                  @click="savePageName"
                  :disabled="saving"
                  class="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  Save
                </button>
                <button
                  @click="cancelEditPageName"
                  class="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </div>

              <!-- Display mode -->
              <div v-else>
                <div class="flex items-center space-x-2 group">
                  <h1 class="text-3xl font-bold text-gray-900 dark:text-white">{{ wikiPage.page_name }}</h1>
                  <button
                    @click="startEditingPageName"
                    class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Rename page"
                  >
                    <PencilIcon class="w-5 h-5" />
                  </button>
                </div>
                <div class="flex items-center space-x-3 mt-1">
                  <span class="text-sm text-gray-500 dark:text-gray-400 capitalize">{{ wikiPage.page_type }}</span>
                  <span v-if="wikiPage.is_major" class="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                    Major
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="wikiPage" class="flex items-center space-x-3">
          <button
            @click="togglePinned"
            :disabled="saving"
            class="inline-flex items-center px-3 py-2 text-sm rounded-md transition-colors disabled:opacity-50"
            :class="wikiPage.is_pinned
              ? 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:hover:bg-blue-800'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'"
          >
            <BookmarkIcon
              class="w-4 h-4 mr-1"
              :class="wikiPage.is_pinned ? 'fill-current' : ''"
            />
            {{ wikiPage.is_pinned ? 'Pinned' : 'Pin' }}
          </button>
          <button
            v-if="isHistoryFeatureEnabled"
            @click="toggleHistory"
            class="inline-flex items-center px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <ClockIcon class="w-4 h-4 mr-1" />
            {{ showHistory ? 'Hide' : 'Show' }} History
          </button>

          <template v-if="isEditing">
            <button
              @click="cancelEdit"
              class="px-3 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              @click="saveChanges"
              :disabled="saving"
              class="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center"
            >
              <span v-if="saving" class="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></span>
              {{ saving ? 'Saving...' : 'Save Changes' }}
            </button>
          </template>
          <template v-else>
            <button
              @click="isEditing = true"
              class="inline-flex items-center px-3 py-2 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
            >
              <PencilIcon class="w-4 h-4 mr-1" />
              Edit
            </button>
            <button
              @click="confirmDelete"
              class="inline-flex items-center px-3 py-2 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-md hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
            >
              <TrashIcon class="w-4 h-4 mr-1" />
              Delete
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- Action bar when hero image is present -->
    <div v-else-if="wikiPage" class="mb-6 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <component :is="getTypeIcon(wikiPage.page_type)" :class="['w-6 h-6', getTypeColor(wikiPage.page_type)]" />
        <div>
          <div v-if="isEditingPageName" class="flex items-center space-x-2">
            <input
              v-model="editedPageName"
              @keyup.enter="savePageName"
              @keyup.esc="cancelEditPageName"
              type="text"
              class="text-xl font-bold bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Page name"
              autofocus
            />
            <button
              @click="savePageName"
              :disabled="saving"
              class="px-2 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Save
            </button>
            <button
              @click="cancelEditPageName"
              class="px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
          <div v-else class="flex items-center gap-2 group">
            <h1 class="text-xl font-bold text-gray-900 dark:text-white">{{ wikiPage.page_name }}</h1>
            <button
              @click="startEditingPageName"
              class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Rename page"
            >
              <PencilIcon class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      <div class="flex items-center space-x-2">
        <button
          @click="togglePinned"
          :disabled="saving"
          class="inline-flex items-center px-2 py-1.5 text-sm rounded-md transition-colors disabled:opacity-50"
          :class="wikiPage.is_pinned
            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:hover:bg-blue-800'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'"
        >
          <BookmarkIcon
            class="w-4 h-4 mr-1"
            :class="wikiPage.is_pinned ? 'fill-current' : ''"
          />
          {{ wikiPage.is_pinned ? 'Pinned' : 'Pin' }}
        </button>
        <template v-if="isEditing">
          <button
            @click="cancelEdit"
            class="px-2 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            @click="saveChanges"
            :disabled="saving"
            class="px-2 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 inline-flex items-center"
          >
            <span v-if="saving" class="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent mr-1"></span>
            {{ saving ? 'Saving...' : 'Save' }}
          </button>
        </template>
        <template v-else>
          <button
            @click="isEditing = true"
            class="inline-flex items-center px-2 py-1.5 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-200 dark:hover:bg-blue-800"
          >
            <PencilIcon class="w-4 h-4 mr-1" />
            Edit
          </button>
          <button
            @click="confirmDelete"
            class="inline-flex items-center px-2 py-1.5 text-sm bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-md hover:bg-red-200 dark:hover:bg-red-800"
          >
            <TrashIcon class="w-4 h-4 mr-1" />
            Delete
          </button>
        </template>
      </div>
    </div>

    <!-- Illustrations Section - at top -->
    <WikiPageIllustrationsSection
      v-if="wikiImages.length > 0"
      :images="wikiImages"
      :image-sources="wikiImageSources"
      :image-tags="wikiImageTags"
      :cover-image-id="wikiCoverImageId"
      :loading="wikiImagesLoading"
      :error="wikiImageError"
      :setting-cover-id="settingCoverId"
      @open-image="openImageModal"
      @set-cover="handleSetAsCover"
      @download="handleDownloadImage"
    />

    <!-- Loading state -->
    <div v-if="loading" class="flex justify-center items-center h-64">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>

    <div v-else-if="wikiPage" class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <!-- Main content -->
      <div class="lg:col-span-2">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
          <div class="p-6">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Content</h2>

            <div v-if="isEditing" class="space-y-4">
              <textarea
                v-model="editedContent"
                rows="20"
                class="w-full p-4 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
                placeholder="Enter wiki content in Markdown format..."
              />
              <p class="text-sm text-gray-500 dark:text-gray-400">
                💡 Use Markdown formatting for headers, lists, bold text, etc.
              </p>
            </div>

            <div v-else-if="wikiPage.content" class="prose prose-gray dark:prose-invert max-w-none">
              <MarkdownRenderer
                :text="wikiPage.content"
                :characters="characters"
                :book-id="bookId"
                :enable-wiki-links="true"
              />
            </div>

            <div v-else class="text-center py-8 text-gray-500 dark:text-gray-400">
              <BookOpenIcon class="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No content yet. Click "Edit" to add information about {{ wikiPage.page_name }}.</p>
            </div>
          </div>
        </div>

      </div>

      <!-- Sidebar -->
      <div class="space-y-6">
        <!-- Page Info -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
          <div class="p-6">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Page Info</h3>

            <div class="space-y-3 text-sm">
              <div>
                <span class="font-medium text-gray-300 ">Type:</span>
                <span class="ml-2 capitalize text-gray-400 dark:text-gray-100">{{ wikiPage.page_type }}</span>
              </div>

              <div v-if="wikiPage.summary">
                <span class="font-medium text-gray-700 dark:text-gray-300">Summary:</span>
                <p class="mt-1 text-gray-600 dark:text-gray-400">{{ wikiPage.summary }}</p>
              </div>

              <div v-if="wikiPage.aliases && wikiPage.aliases.length">
                <span class="font-medium text-gray-700 dark:text-gray-300">Aliases:</span>
                <div class="flex flex-wrap gap-1 mt-1">
                  <span
                    v-for="alias in wikiPage.aliases"
                    :key="alias"
                    class="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded"
                  >
                    {{ alias }}
                  </span>
                </div>
              </div>

              <div>
                <div class="flex items-center justify-between">
                  <span class="font-medium text-gray-700 dark:text-gray-300">Tags:</span>
                  <button
                    v-if="!isEditingTags"
                    type="button"
                    class="text-xs font-medium text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    @click="startEditingTags"
                  >
                    {{ wikiPage.tags.length ? 'Edit tags' : 'Add tags' }}
                  </button>
                </div>

                <div v-if="isEditingTags" class="mt-2 space-y-3">
                  <div v-if="editedTags.length" class="flex flex-wrap gap-2">
                    <button
                      v-for="tag in editedTags"
                      :key="tag"
                      type="button"
                      class="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 text-xs text-blue-800 transition-colors hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:hover:bg-blue-800"
                      @click="removeTag(tag)"
                    >
                      <span>{{ tag }}</span>
                      <span class="ml-1.5 text-[11px]">x</span>
                    </button>
                  </div>
                  <p v-else class="text-xs text-gray-500 dark:text-gray-400">
                    No tags yet. Add a few to improve organization.
                  </p>

                  <div class="flex gap-2">
                    <input
                      v-model="newTag"
                      type="text"
                      class="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                      placeholder="Add a tag"
                      @keyup.enter="addTag"
                    />
                    <button
                      type="button"
                      class="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                      @click="addTag"
                    >
                      Add
                    </button>
                  </div>

                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                      :disabled="savingTags"
                      @click="saveTags"
                    >
                      {{ savingTags ? 'Saving...' : 'Save tags' }}
                    </button>
                    <button
                      type="button"
                      class="text-sm font-medium text-gray-600 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300"
                      :disabled="savingTags"
                      @click="cancelEditTags"
                    >
                      Cancel
                    </button>
                  </div>
                </div>

                <div v-else-if="wikiPage.tags.length" class="mt-1 flex flex-wrap gap-1">
                  <span
                    v-for="tag in wikiPage.tags"
                    :key="tag"
                    class="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded"
                  >
                    {{ tag }}
                  </span>
                </div>
                <p v-else class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  No tags yet.
                </p>
              </div>

              <div>
                <span class="font-medium text-gray-300 dark:text-gray-300">Created:</span>
                <span class="ml-2 text-gray-400 dark:text-gray-100">{{ formatDate(wikiPage.created_at) }}</span>
              </div>

              <div>
                <span class="font-medium text-gray-300 dark:text-gray-300">Updated:</span>
                <span class="ml-2 text-gray-400 dark:text-gray-100">{{ formatDate(wikiPage.updated_at) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- History -->
        <div v-if="isHistoryFeatureEnabled && showHistory" class="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
          <div class="p-6">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Change History</h3>

            <div v-if="loadingHistory" class="flex justify-center py-4">
              <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>

            <div v-else-if="wikiHistory.length > 0" class="space-y-3">
              <div
                v-for="update in wikiHistory"
                :key="update.id"
                class="border-l-4 border-blue-200 pl-4 py-2"
              >
                <div class="flex items-center justify-between">
                  <span class="text-sm font-medium capitalize text-gray-900 dark:text-white">
                    {{ update.update_type.replace('_', ' ') }}
                  </span>
                  <span class="text-xs text-gray-500">{{ formatDate(update.created_at) }}</span>
                </div>

                <p v-if="update.change_summary" class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {{ update.change_summary }}
                </p>

                <p v-if="update.chapter_title" class="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  From chapter: {{ update.chapter_title }}
                </p>

                <div v-if="update.contradiction_notes" class="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-sm">
                  <strong class="text-yellow-800 dark:text-yellow-200">Contradiction noted:</strong>
                  <p class="text-yellow-700 dark:text-yellow-300">{{ update.contradiction_notes }}</p>
                </div>
              </div>
            </div>

            <div v-else class="text-center py-4 text-gray-500 dark:text-gray-400">
              No changes recorded yet.
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Delete confirmation modal -->
  <div v-if="showDeleteModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4 shadow-xl">
        <div class="flex items-center mb-4">
          <div class="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mr-3">
            <TrashIcon class="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Delete Wiki Page</h2>
        </div>

        <p class="text-gray-600 dark:text-gray-400 mb-6">
          Are you sure you want to delete <strong class="text-gray-900 dark:text-white">{{ wikiPage?.page_name }}</strong>? This action cannot be undone.
        </p>

        <div class="flex justify-end space-x-3">
          <button
            @click="cancelDelete"
            :disabled="deleting"
            class="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            @click="handleDelete"
            :disabled="deleting"
            class="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center"
          >
            <span v-if="deleting" class="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></span>
            {{ deleting ? 'Deleting...' : 'Delete' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Illustration detail modal -->
    <Modal
      :show="showImageLightbox"
      :title="activeImageLabel || 'Illustration'"
      max-width="4xl"
      @close="closeImageModal"
    >
      <IllustrationDetail
        :image="activeImage"
        :image-src="activeImageSource"
        :wiki-pages="bookWikiPages"
        :tags="activeImageTags"
        :saving-notes="savingImageNotes"
        :saving-tags="savingImageTags"
        :can-edit-notes="true"
        :can-edit-tags="true"
        :can-download="true"
        @save-notes="handleSaveActiveImageNotes"
        @save-tags="handleSaveActiveImageTags"
        @download="handleDownloadImage"
      />
    </Modal>
  </div>
</template>
