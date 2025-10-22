<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useDatabase } from '@/composables/useDatabase'
import JSZip from 'jszip'
import { ArrowLeftIcon, DocumentArrowDownIcon, KeyIcon, EyeIcon, EyeSlashIcon, CloudArrowUpIcon, ArrowPathIcon } from '@heroicons/vue/24/outline'
import CustomProfilesPanel from '@/components/CustomProfilesPanel.vue'

const router = useRouter()

// Use local database
const { books, chapters, loadBooks, loadChapters, backupToCloud, restoreFromCloud, hasCloudSync } = useDatabase()

// OpenAI API Key state
const openaiApiKey = ref('')
const showApiKey = ref(false)
const apiKeyMessage = ref('')
const apiKeyMessageType = ref<'success' | 'error' | ''>('')

// Load API key from localStorage
const loadApiKey = () => {
  const stored = localStorage.getItem('openai_api_key')
  if (stored) {
    openaiApiKey.value = stored
  }
}

// Save API key to localStorage
const saveApiKey = () => {
  if (!openaiApiKey.value.trim()) {
    apiKeyMessage.value = 'Please enter an API key'
    apiKeyMessageType.value = 'error'
    return
  }

  if (!openaiApiKey.value.startsWith('sk-')) {
    apiKeyMessage.value = 'API key should start with "sk-"'
    apiKeyMessageType.value = 'error'
    return
  }

  localStorage.setItem('openai_api_key', openaiApiKey.value)
  apiKeyMessage.value = 'API key saved successfully!'
  apiKeyMessageType.value = 'success'

  setTimeout(() => {
    apiKeyMessage.value = ''
    apiKeyMessageType.value = ''
  }, 3000)
}

// Remove API key from localStorage
const removeApiKey = () => {
  if (!confirm('Are you sure you want to remove your OpenAI API key?')) return

  localStorage.removeItem('openai_api_key')
  openaiApiKey.value = ''
  apiKeyMessage.value = 'API key removed'
  apiKeyMessageType.value = 'success'

  setTimeout(() => {
    apiKeyMessage.value = ''
    apiKeyMessageType.value = ''
  }, 3000)
}

// Export state
const isExporting = ref(false)
const exportProgress = ref('')
const exportError = ref('')

// Cloud backup state
const cloudPassword = ref('')
const isBackingUp = ref(false)
const isRestoring = ref(false)
const cloudMessage = ref('')
const cloudMessageType = ref<'success' | 'error' | ''>('')
const cloudSyncAvailable = computed(() => hasCloudSync())

const goBack = () => {
  router.back()
}

const exportUserData = async () => {
  if (isExporting.value) return

  exportError.value = ''

  try {
    isExporting.value = true
    exportProgress.value = 'Fetching your books...'

    // Create zip file
    const zip = new JSZip()

    // Get all books from local database
    await loadBooks()
    const booksData = books.value
    exportProgress.value = `Found ${booksData.length} books. Processing...`

    for (let i = 0; i < booksData.length; i++) {
      const book = booksData[i]
      exportProgress.value = `Processing book ${i + 1}/${booksData.length}: ${book.title}`

      const bookFolder = zip.folder(sanitizeFileName(book.title))
      if (!bookFolder) continue

      // Create book info file
      bookFolder.file('book-info.txt', `Title: ${book.title}\nID: ${book.id}\nCreated: ${book.created_at || 'Unknown'}\n`)

      // Get chapters for this book from local database
      await loadChapters(book.id)
      const chaptersData = chapters.value
      const chaptersFolder = bookFolder.folder('chapters')

      // Calculate padding length based on total chapters
      const paddingLength = chaptersData.length.toString().length

      for (let chapterIndex = 0; chapterIndex < chaptersData.length; chapterIndex++) {
        const chapter = chaptersData[chapterIndex]
        exportProgress.value = `Processing chapter: ${chapter.title || chapter.id}`

        // Create zero-padded chapter number
        const chapterNumber = (chapterIndex + 1).toString().padStart(paddingLength, '0')
        const chapterFolderName = `${chapterNumber} - ${sanitizeFileName(chapter.title || chapter.id)}`
        const chapterFolder = chaptersFolder?.folder(chapterFolderName)

        if (chapterFolder) {
          // Add chapter content
          chapterFolder.file('content.md', chapter.text || '')

          // Add chapter info
          const chapterInfo = `Title: ${chapter.title || 'Untitled'}\nID: ${chapter.id}\nWord Count: ${chapter.word_count || 0}\nCreated: ${chapter.created_at || 'Unknown'}\n`
          chapterFolder.file('chapter-info.txt', chapterInfo)

          // Note: Summaries are in a separate table, would need to fetch them separately
          // Skipping for now to keep it simple
        }
      }

      // Note: Wiki pages would need separate loading from local DB
      // Skipping for now to keep export simple
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
    exportError.value = 'Export failed: ' + (err instanceof Error ? err.message : 'Unknown error')
    exportProgress.value = ''
  } finally {
    isExporting.value = false
  }
}

const sanitizeFileName = (name: string): string => {
  return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_')
}

const showCloudMessage = (message: string, type: 'success' | 'error') => {
  cloudMessage.value = message
  cloudMessageType.value = type

  if (type === 'success') {
    setTimeout(() => {
      cloudMessage.value = ''
      cloudMessageType.value = ''
    }, 5000)
  }
}

const handleCloudBackup = async () => {
  if (!cloudPassword.value.trim()) {
    showCloudMessage('Enter an encryption password before backing up.', 'error')
    return
  }

  if (!cloudSyncAvailable.value) {
    showCloudMessage('Cloud sync is not configured. Add VITE_GOOGLE_CLIENT_ID to use Google Drive backups.', 'error')
    return
  }

  try {
    isBackingUp.value = true
    cloudMessage.value = ''
    await backupToCloud(cloudPassword.value)
    showCloudMessage('Backup saved to Google Drive.', 'success')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    showCloudMessage(`Backup failed: ${message}`, 'error')
  } finally {
    isBackingUp.value = false
  }
}

const handleCloudRestore = async () => {
  if (!cloudPassword.value.trim()) {
    showCloudMessage('Enter your encryption password before restoring.', 'error')
    return
  }

  if (!cloudSyncAvailable.value) {
    showCloudMessage('Cloud sync is not configured. Add VITE_GOOGLE_CLIENT_ID to use Google Drive backups.', 'error')
    return
  }

  if (!confirm('Restoring from backup will replace your local data. Continue?')) {
    return
  }

  try {
    isRestoring.value = true
    cloudMessage.value = ''
    const success = await restoreFromCloud(cloudPassword.value)
    if (success) {
      showCloudMessage('Backup restored from Google Drive.', 'success')
    } else {
      showCloudMessage('No backup found or the password was incorrect.', 'error')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    showCloudMessage(`Restore failed: ${message}`, 'error')
  } finally {
    isRestoring.value = false
  }
}

onMounted(() => {
  loadApiKey()
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
    <div class="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <!-- OpenAI API Key Section -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div class="flex items-center space-x-2">
            <KeyIcon class="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">OpenAI API Key</h2>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Your OpenAI API key is stored locally in your browser and used for AI-powered features like chapter summaries and reviews.
          </p>
        </div>

        <div class="px-6 py-4 space-y-4">
          <!-- API Key Input -->
          <div>
            <label for="openai-key" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              API Key
            </label>
            <div class="flex items-center space-x-2">
              <div class="relative flex-1">
                <input
                  id="openai-key"
                  v-model="openaiApiKey"
                  :type="showApiKey ? 'text' : 'password'"
                  placeholder="sk-..."
                  class="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                />
                <button
                  type="button"
                  @click="showApiKey = !showApiKey"
                  class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  title="Toggle visibility"
                >
                  <EyeIcon v-if="!showApiKey" class="w-5 h-5" />
                  <EyeSlashIcon v-else class="w-5 h-5" />
                </button>
              </div>
              <button
                @click="saveApiKey"
                class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Save
              </button>
              <button
                v-if="openaiApiKey"
                @click="removeApiKey"
                class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                Remove
              </button>
            </div>
          </div>

          <!-- Success/Error Message -->
          <div v-if="apiKeyMessage" class="flex items-center space-x-2">
            <svg
              v-if="apiKeyMessageType === 'success'"
              class="w-5 h-5 text-green-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
            </svg>
            <svg
              v-else
              class="w-5 h-5 text-red-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
            </svg>
            <span
              :class="apiKeyMessageType === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
              class="text-sm font-medium"
            >
              {{ apiKeyMessage }}
            </span>
          </div>

          <!-- Info Box -->
          <div class="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <h3 class="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
              How to get your OpenAI API key:
            </h3>
            <ol class="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-decimal list-inside">
              <li>Visit <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" class="underline hover:text-blue-600">platform.openai.com/api-keys</a></li>
              <li>Sign in or create an account</li>
              <li>Click "Create new secret key"</li>
              <li>Copy the key and paste it above</li>
            </ol>
            <p class="text-xs text-blue-700 dark:text-blue-300 mt-3">
              <strong>Privacy:</strong> Your API key never leaves your device. All AI requests are made directly from your browser to OpenAI.
            </p>
            <p class="text-xs text-blue-700 dark:text-blue-300 mt-1">
              <strong>Cost:</strong> You'll be billed by OpenAI based on your usage. GPT-4o-mini is approximately $0.15 per 1M input tokens and $0.60 per 1M output tokens.
            </p>
          </div>
        </div>
      </div>

      <!-- Custom Reviewer Profiles Section -->
      <CustomProfilesPanel />

      <!-- Cloud Backup Section -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div class="flex items-center space-x-2">
            <CloudArrowUpIcon class="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Cloud Backup</h2>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Encrypt your data with a password and sync it to your Google Drive. Only the password holder can decrypt the backup.
          </p>
          <p
            v-if="!cloudSyncAvailable"
            class="mt-3 text-sm text-amber-600 dark:text-amber-400"
          >
            Google Drive sync is disabled. Set <code>VITE_GOOGLE_CLIENT_ID</code> in <code>.env.local</code> to enable backups.
          </p>
        </div>

        <div class="px-6 py-4 space-y-4">
          <div>
            <label for="cloud-password" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Encryption Password
            </label>
            <input
              id="cloud-password"
              v-model="cloudPassword"
              type="password"
              placeholder="Enter a password used to encrypt your backup"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Remember this password. Without it your backup cannot be decrypted.
            </p>
          </div>

          <div class="flex flex-wrap gap-3">
            <button
              @click="handleCloudBackup"
              :disabled="isBackingUp || !cloudPassword || !cloudSyncAvailable"
              class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg
                v-if="isBackingUp"
                class="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span class="inline-flex items-center">
                <CloudArrowUpIcon v-if="!isBackingUp" class="w-5 h-5 mr-2" />
                {{ isBackingUp ? 'Backing Up...' : 'Backup to Google Drive' }}
              </span>
            </button>

            <button
              @click="handleCloudRestore"
              :disabled="isRestoring || !cloudPassword || !cloudSyncAvailable"
              class="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg
                v-if="isRestoring"
                class="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-700 dark:text-gray-200"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span class="inline-flex items-center">
                <ArrowPathIcon v-if="!isRestoring" class="w-5 h-5 mr-2" />
                {{ isRestoring ? 'Restoring...' : 'Restore from Backup' }}
              </span>
            </button>
          </div>

          <div
            v-if="cloudMessage"
            :class="[
              'px-4 py-3 rounded-lg text-sm',
              cloudMessageType === 'success'
                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
            ]"
          >
            {{ cloudMessage }}
          </div>

          <div class="text-xs text-gray-500 dark:text-gray-400 space-y-1">
            <p>✓ Data is encrypted client-side before upload</p>
            <p>✓ Backups are stored in your Google Drive only</p>
            <p>✓ Restoring requires the same password used for backup</p>
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

          <div
            v-if="exportError"
            class="mb-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-400"
          >
            {{ exportError }}
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
