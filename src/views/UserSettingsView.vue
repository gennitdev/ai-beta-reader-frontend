<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth0 } from '@auth0/auth0-vue'
import { createBookService, createChapterService, createWikiService } from '@/services/api'
import JSZip from 'jszip'
import { PlusIcon, PencilIcon, TrashIcon, ArrowLeftIcon, DocumentArrowDownIcon } from '@heroicons/vue/24/outline'

const router = useRouter()
const { getAccessTokenSilently } = useAuth0()

interface CustomReviewerProfile {
  id: number
  name: string
  description: string
  created_at: string
  updated_at: string
}

const profiles = ref<CustomReviewerProfile[]>([])
const isLoading = ref(false)
const error = ref('')
const showCreateForm = ref(false)
const editingProfile = ref<CustomReviewerProfile | null>(null)

// Export state
const isExporting = ref(false)
const exportProgress = ref('')

// Form data
const formData = ref({
  name: '',
  description: ''
})

// API functions
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

const getAuthToken = async () => {
  try {
    return await getAccessTokenSilently()
  } catch (error) {
    console.warn('Failed to get access token:', error)
    return ''
  }
}

// Create authenticated services
const getToken = async () => {
  try {
    return await getAccessTokenSilently()
  } catch (error) {
    console.warn('Failed to get access token:', error)
    return undefined
  }
}

const bookService = createBookService(getToken)
const chapterService = createChapterService(getToken)
const wikiService = createWikiService(getToken)

const fetchProfiles = async () => {
  try {
    isLoading.value = true
    const token = await getAuthToken()
    const response = await fetch(`${API_BASE_URL}/custom-reviewer-profiles`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    if (!response.ok) {
      throw new Error('Failed to fetch profiles')
    }

    profiles.value = await response.json()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load profiles'
  } finally {
    isLoading.value = false
  }
}

const createProfile = async () => {
  try {
    const token = await getAuthToken()
    const response = await fetch(`${API_BASE_URL}/custom-reviewer-profiles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(formData.value)
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to create profile')
    }

    await fetchProfiles()
    resetForm()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to create profile'
  }
}

const updateProfile = async () => {
  if (!editingProfile.value) return

  try {
    const token = await getAuthToken()
    const response = await fetch(`${API_BASE_URL}/custom-reviewer-profiles/${editingProfile.value.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(formData.value)
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to update profile')
    }

    await fetchProfiles()
    resetForm()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to update profile'
  }
}

const deleteProfile = async (id: number) => {
  if (!confirm('Are you sure you want to delete this profile?')) return

  try {
    const token = await getAuthToken()
    const response = await fetch(`${API_BASE_URL}/custom-reviewer-profiles/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    if (!response.ok) {
      throw new Error('Failed to delete profile')
    }

    await fetchProfiles()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to delete profile'
  }
}

const startEdit = (profile: CustomReviewerProfile) => {
  editingProfile.value = profile
  formData.value = {
    name: profile.name,
    description: profile.description
  }
  showCreateForm.value = true
}

const resetForm = () => {
  formData.value = { name: '', description: '' }
  editingProfile.value = null
  showCreateForm.value = false
  error.value = ''
}

const handleSubmit = async () => {
  if (!formData.value.name.trim() || !formData.value.description.trim()) {
    error.value = 'Please fill in all fields'
    return
  }

  if (editingProfile.value) {
    await updateProfile()
  } else {
    await createProfile()
  }
}

const goBack = () => {
  router.back()
}

const exportUserData = async () => {
  if (isExporting.value) return

  try {
    isExporting.value = true
    exportProgress.value = 'Fetching your books...'

    // Create zip file
    const zip = new JSZip()

    // Get all books
    const books = await bookService.getBooks()
    exportProgress.value = `Found ${books.length} books. Processing...`

    for (let i = 0; i < books.length; i++) {
      const book = books[i]
      exportProgress.value = `Processing book ${i + 1}/${books.length}: ${book.title}`

      const bookFolder = zip.folder(sanitizeFileName(book.title))
      if (!bookFolder) continue

      // Create book info file
      bookFolder.file('book-info.txt', `Title: ${book.title}\nID: ${book.id}\nCreated: ${book.created_at || 'Unknown'}\n`)

      // Get chapters for this book
      const chapters = await bookService.getBookChapters(book.id)
      const chaptersFolder = bookFolder.folder('chapters')

      // Calculate padding length based on total chapters
      const paddingLength = chapters.length.toString().length

      for (let chapterIndex = 0; chapterIndex < chapters.length; chapterIndex++) {
        const chapter = chapters[chapterIndex]
        exportProgress.value = `Processing chapter: ${chapter.title || chapter.id}`

        // Get full chapter data
        const fullChapter = await chapterService.getChapter(chapter.id)

        // Create zero-padded chapter number
        const chapterNumber = (chapterIndex + 1).toString().padStart(paddingLength, '0')
        const chapterFolderName = `${chapterNumber} - ${sanitizeFileName(chapter.title || chapter.id)}`
        const chapterFolder = chaptersFolder?.folder(chapterFolderName)

        if (chapterFolder) {
          // Add chapter content
          chapterFolder.file('content.md', fullChapter.text || '')

          // Add chapter info
          const chapterInfo = `Title: ${fullChapter.title || 'Untitled'}\nID: ${fullChapter.id}\nWord Count: ${fullChapter.word_count || 0}\nCreated: ${fullChapter.updated_at || 'Unknown'}\n`
          chapterFolder.file('chapter-info.txt', chapterInfo)

          // Add summary if exists
          if (fullChapter.summary) {
            const summaryInfo = `Summary: ${fullChapter.summary}\n\nPOV: ${fullChapter.pov || 'Not specified'}\n\nCharacters: ${fullChapter.characters ? fullChapter.characters.join(', ') : 'None listed'}\n\nBeats:\n${fullChapter.beats ? fullChapter.beats.map((beat: string) => `- ${beat}`).join('\n') : 'None listed'}\n`
            chapterFolder.file('summary.txt', summaryInfo)
          }
        }
      }

      // Get wiki pages (characters) for this book
      try {
        const wikiPages = await wikiService.getBookWiki(book.id)
        const charactersFolder = bookFolder.folder('characters')

        for (const wikiPage of wikiPages) {
          exportProgress.value = `Processing character: ${wikiPage.page_name}`

          // Get full wiki page data
          const fullWikiPage = await wikiService.getWikiPage(wikiPage.id)

          const wikiFileName = sanitizeFileName(wikiPage.page_name) + '.md'
          let wikiContent = `# ${fullWikiPage.page_name}\n\n`
          wikiContent += `**Type:** ${fullWikiPage.page_type}\n`
          if (fullWikiPage.summary) {
            wikiContent += `**Summary:** ${fullWikiPage.summary}\n`
          }
          if (fullWikiPage.aliases && fullWikiPage.aliases.length > 0) {
            wikiContent += `**Aliases:** ${fullWikiPage.aliases.join(', ')}\n`
          }
          if (fullWikiPage.tags && fullWikiPage.tags.length > 0) {
            wikiContent += `**Tags:** ${fullWikiPage.tags.join(', ')}\n`
          }
          wikiContent += `**Major Character:** ${fullWikiPage.is_major ? 'Yes' : 'No'}\n`
          wikiContent += `**Created:** ${fullWikiPage.created_at}\n`
          wikiContent += `**Updated:** ${fullWikiPage.updated_at}\n\n`
          wikiContent += fullWikiPage.content || 'No content available.'

          charactersFolder?.file(wikiFileName, wikiContent)
        }
      } catch (error) {
        console.warn('Error fetching wiki pages for book:', book.title, error)
      }
    }

    exportProgress.value = 'Creating zip file...'

    // Generate and download zip
    const content = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(content)
    const link = document.createElement('a')
    link.href = url
    link.download = `beta-bot-export-${new Date().toISOString().split('T')[0]}.zip`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    exportProgress.value = 'Export completed!'
    setTimeout(() => {
      exportProgress.value = ''
    }, 3000)

  } catch (err) {
    console.error('Export failed:', err)
    error.value = 'Export failed: ' + (err instanceof Error ? err.message : 'Unknown error')
    exportProgress.value = ''
  } finally {
    isExporting.value = false
  }
}

const sanitizeFileName = (name: string): string => {
  return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_')
}

onMounted(() => {
  fetchProfiles()
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Header -->
    <div class="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
      <div class="max-w-4xl mx-auto px-4 sm:px-6 py-4">
        <div class="flex items-center space-x-4">
          <button
            @click="goBack"
            class="inline-flex items-center px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeftIcon class="w-5 h-5 mr-2" />
            Back
          </button>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">User Settings</h1>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div class="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <!-- Custom Reviewer Profiles Section -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Custom Reviewer Profiles</h2>
              <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Create custom AI reviewer profiles with your own descriptions and personalities.
              </p>
            </div>
            <button
              @click="showCreateForm = true"
              class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <PlusIcon class="w-5 h-5 mr-2" />
              Add Profile
            </button>
          </div>
        </div>

        <!-- Error Message -->
        <div v-if="error" class="px-6 py-4 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
          <p class="text-red-600 dark:text-red-400">{{ error }}</p>
        </div>

        <!-- Create/Edit Form -->
        <div v-if="showCreateForm" class="px-6 py-4 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
          <form @submit.prevent="handleSubmit" class="space-y-4">
            <div>
              <label for="profile-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Profile Name
              </label>
              <input
                id="profile-name"
                v-model="formData.name"
                type="text"
                placeholder="e.g., Encouraging Beta Reader"
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label for="profile-description" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Description & Personality
              </label>
              <textarea
                id="profile-description"
                v-model="formData.description"
                rows="4"
                placeholder="Describe how this reviewer should provide feedback. Include tone, style, focus areas, etc."
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical"
                required
              ></textarea>
            </div>
            <div class="flex items-center space-x-3">
              <button
                type="submit"
                class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                {{ editingProfile ? 'Update Profile' : 'Create Profile' }}
              </button>
              <button
                type="button"
                @click="resetForm"
                class="inline-flex items-center px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>

        <!-- Profiles List -->
        <div class="px-6 py-4">
          <div v-if="isLoading" class="text-center py-8">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p class="text-gray-600 dark:text-gray-400 mt-2">Loading profiles...</p>
          </div>

          <div v-else-if="profiles.length === 0" class="text-center py-8">
            <p class="text-gray-600 dark:text-gray-400">No custom reviewer profiles yet.</p>
            <p class="text-sm text-gray-500 dark:text-gray-500 mt-1">
              Create your first profile to get started!
            </p>
          </div>

          <div v-else class="space-y-4">
            <div
              v-for="profile in profiles"
              :key="profile.id"
              class="border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <h3 class="font-semibold text-gray-900 dark:text-white">{{ profile.name }}</h3>
                  <p class="text-gray-600 dark:text-gray-400 mt-1">{{ profile.description }}</p>
                  <p class="text-xs text-gray-500 dark:text-gray-500 mt-2">
                    Created {{ new Date(profile.created_at).toLocaleDateString() }}
                  </p>
                </div>
                <div class="flex items-center space-x-2 ml-4">
                  <button
                    @click="startEdit(profile)"
                    class="inline-flex items-center p-2 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    title="Edit profile"
                  >
                    <PencilIcon class="w-5 h-5" />
                  </button>
                  <button
                    @click="deleteProfile(profile.id)"
                    class="inline-flex items-center p-2 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                    title="Delete profile"
                  >
                    <TrashIcon class="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Data Export Section -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mt-8">
        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Export Your Data</h2>
              <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Download all your books, chapters, and character data in a structured format.
              </p>
            </div>
            <button
              @click="exportUserData"
              :disabled="isExporting"
              class="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              <DocumentArrowDownIcon class="w-5 h-5 mr-2" />
              {{ isExporting ? 'Exporting...' : 'Export Data' }}
            </button>
          </div>
        </div>

        <div class="px-6 py-4">
          <div v-if="isExporting" class="mb-4">
            <div class="flex items-center mb-2">
              <div class="animate-spin rounded-full h-4 w-4 border-2 border-green-600 border-t-transparent mr-2"></div>
              <span class="text-sm text-gray-600 dark:text-gray-400">{{ exportProgress }}</span>
            </div>
            <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div class="bg-green-600 h-2 rounded-full transition-all duration-300" style="width: 60%"></div>
            </div>
          </div>

          <div class="text-sm text-gray-600 dark:text-gray-400 space-y-2">
            <p><strong>What's included in your export:</strong></p>
            <ul class="list-disc pl-5 space-y-1">
              <li>All your books with metadata</li>
              <li>Chapter content and summaries</li>
              <li>Character wiki pages with all details</li>
              <li>Organized folder structure for easy navigation</li>
            </ul>
            <p class="mt-4 text-xs text-gray-500 dark:text-gray-500">
              Your data will be downloaded as a ZIP file containing folders for each book, with subfolders for chapters and characters.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>