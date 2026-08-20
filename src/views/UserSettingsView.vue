<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { initializeDatabase, useDatabase } from '@/composables/useDatabase'
import { useImageLibrary } from '@/composables/useImageLibrary'
import { useApiKey } from '@/composables/useApiKey'
import { useCloudSync } from '@/composables/useCloudSync'
import { useBrowserStorage } from '@/composables/useBrowserStorage'
import { useDataExport } from '@/composables/useDataExport'
import { useBardwallSettings } from '@/composables/useBardwallSettings'
import { useTheme } from '@/composables/useTheme'
import { formatStorageBytes } from '@/lib/browserStorage'
import { ArrowLeftIcon, DocumentArrowDownIcon, KeyIcon, EyeIcon, EyeSlashIcon, CloudArrowUpIcon, ArrowPathIcon, CircleStackIcon, MusicalNoteIcon, MoonIcon, SunIcon } from '@heroicons/vue/24/outline'

const router = useRouter()

// Local database + image library provide the primitives the settings composables build on.
const {
  books,
  chapters,
  loadBooks,
  loadChapters,
  getParts,
  getNotes,
  backupToCloud,
  restoreFromCloud,
  hasCloudSync,
  prepareCloudSync,
  cloudSyncReady,
  exportDatabase,
} = useDatabase()

const {
  canStoreImages,
  fetchBookCover,
  fetchPartCover,
  fetchChapterImages,
  getImageBlob,
} = useImageLibrary()

const goBack = () => {
  router.back()
}

const { bardwallEnabled } = useBardwallSettings()
const { theme, setTheme } = useTheme()

// OpenAI API key management
const {
  openaiApiKey,
  showApiKey,
  apiKeyMessage,
  apiKeyMessageType,
  hasStoredApiKey,
  usesSecureStorage,
  loadApiKey,
  saveApiKey,
  removeApiKey,
} = useApiKey()

// Browser storage usage + persistence
const {
  browserStorage,
  loadingBrowserStorage,
  browserStorageMessage,
  showBrowserStorage,
  browserStoragePercent,
  refreshBrowserStorage,
  makeBrowserStoragePersistent,
} = useBrowserStorage({ canStoreImages })

// Encrypted Google Drive backup/restore
const {
  cloudPassword,
  showCloudPassword,
  isBackingUp,
  isRestoring,
  cloudMessage,
  cloudMessageType,
  cloudSyncAvailable,
  handleCloudBackup,
  handleCloudRestore,
} = useCloudSync({ backupToCloud, restoreFromCloud, hasCloudSync, cloudSyncReady })

// Library export (structured ZIP or Markdown)
const {
  isExporting,
  exportProgress,
  exportError,
  exportFormat,
  markdownGranularity,
  includeNotes,
  handleExport,
} = useDataExport({
  books,
  chapters,
  loadBooks,
  loadChapters,
  getParts,
  getNotes,
  canStoreImages,
  fetchBookCover,
  fetchPartCover,
  fetchChapterImages,
  getImageBlob,
  exportDatabase,
})

onMounted(async () => {
  await initializeDatabase()
  await loadApiKey()
  await refreshBrowserStorage()
  if (!cloudSyncReady.value) {
    try {
      await prepareCloudSync()
    } catch (error) {
      console.error('Failed to prepare cloud sync:', error)
    }
  }
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-navy-900">
    <!-- Header -->
    <div class="bg-white dark:bg-navy-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
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
      <section class="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-navy-800" aria-labelledby="appearance-heading">
        <div class="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h2 id="appearance-heading" class="text-lg font-semibold text-gray-900 dark:text-white">Appearance</h2>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Choose the theme used throughout beta bot.
          </p>
        </div>
        <div class="grid gap-3 px-6 py-4 sm:grid-cols-2" role="radiogroup" aria-labelledby="appearance-heading">
          <button
            type="button"
            role="radio"
            :aria-checked="theme === 'light'"
            data-testid="theme-light"
            class="flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors"
            :class="theme === 'light'
              ? 'border-gold-500 bg-gold-50 text-gold-900 ring-1 ring-gold-500 dark:bg-gold-900/30 dark:text-gold-100'
              : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'"
            @click="setTheme('light')"
          >
            <SunIcon class="h-5 w-5" />
            <span>
              <span class="block font-medium">Light</span>
              <span class="block text-xs opacity-75">Bright backgrounds and dark text</span>
            </span>
          </button>
          <button
            type="button"
            role="radio"
            :aria-checked="theme === 'dark'"
            data-testid="theme-dark"
            class="flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors"
            :class="theme === 'dark'
              ? 'border-gold-500 bg-gold-50 text-gold-900 ring-1 ring-gold-500 dark:bg-gold-900/30 dark:text-gold-100'
              : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'"
            @click="setTheme('dark')"
          >
            <MoonIcon class="h-5 w-5" />
            <span>
              <span class="block font-medium">Dark</span>
              <span class="block text-xs opacity-75">Deep navy backgrounds and light text</span>
            </span>
          </button>
        </div>
      </section>

      <div class="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-navy-800">
        <div class="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <div class="flex items-center space-x-2">
            <MusicalNoteIcon class="h-5 w-5 text-gray-600 dark:text-gray-400" />
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Features</h2>
          </div>
        </div>
        <div class="flex items-center justify-between gap-6 px-6 py-4">
          <div>
            <label for="bardwall-enabled" class="text-sm font-medium text-gray-900 dark:text-white">
              Show Bardwall
            </label>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Show the Bardwall game link in the navigation menu. Hiding it does not remove game progress or prevent direct access.
            </p>
          </div>
          <input
            id="bardwall-enabled"
            v-model="bardwallEnabled"
            data-testid="bardwall-enabled"
            type="checkbox"
            role="switch"
            class="h-5 w-5 shrink-0 rounded border-gray-300 text-gold-600 focus:ring-gold-500 dark:border-gray-600 dark:bg-gray-700"
          />
        </div>
      </div>

      <!-- OpenAI API Key Section -->
      <div class="bg-white dark:bg-navy-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div class="flex items-center space-x-2">
            <KeyIcon class="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">OpenAI API Key</h2>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Your OpenAI API key is used for AI-powered features like chapter summaries and reviews.
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
                  class="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-gold-500 focus:border-transparent font-mono text-sm"
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
                class="px-4 py-2 bg-gold-600 text-white rounded-lg hover:bg-gold-700 transition-colors font-medium"
              >
                Save
              </button>
              <button
                v-if="hasStoredApiKey"
                @click="removeApiKey"
                class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                Remove
              </button>
            </div>
            <p v-if="hasStoredApiKey" class="mt-2 text-xs text-green-700 dark:text-green-300">
              An API key is saved. Enter a new key and save to replace it.
            </p>
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
          <div class="p-4 bg-gold-50 dark:bg-gold-900/20 rounded-lg">
            <h3 class="text-sm font-medium text-gold-900 dark:text-gold-100 mb-2">
              How to get your OpenAI API key:
            </h3>
            <ol class="text-sm text-gold-800 dark:text-gold-200 space-y-1 list-decimal list-inside">
              <li>Visit <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" class="underline hover:text-gold-600">platform.openai.com/api-keys</a></li>
              <li>Sign in or create an account</li>
              <li>Click "Create new secret key"</li>
              <li>Copy the key and paste it above</li>
            </ol>
            <p class="text-xs text-gold-700 dark:text-gold-300 mt-3">
              <strong>Storage:</strong>
              <template v-if="usesSecureStorage">Your API key is encrypted at rest using this device's secure storage.</template>
              <template v-else>Your browser does not provide an OS-backed secret store, so a remembered key is stored in this site's browser storage.</template>
            </p>
            <p class="text-xs text-gold-700 dark:text-gold-300 mt-1">
              <strong>Privacy:</strong> AI requests and your API key are sent directly to OpenAI, without passing through a beta bot server.
            </p>
            <p class="text-xs text-gold-700 dark:text-gold-300 mt-1">
              <strong>Cost:</strong> You'll be billed by OpenAI based on your usage. GPT-4o-mini is approximately $0.15 per 1M input tokens and $0.60 per 1M output tokens.
            </p>
          </div>
        </div>
      </div>


      <div
        v-if="showBrowserStorage"
        class="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-navy-800"
      >
        <div class="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <div class="flex items-center space-x-2">
            <CircleStackIcon class="h-5 w-5 text-gray-600 dark:text-gray-400" />
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Browser Storage</h2>
          </div>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Manuscripts and image files are stored locally by this browser. Browser settings can still remove them, so keep encrypted backups.
          </p>
        </div>
        <div class="space-y-4 px-6 py-4 text-sm">
          <p v-if="loadingBrowserStorage" class="text-gray-500 dark:text-gray-400">Checking storage…</p>
          <div
            v-else-if="browserStorage?.error"
            role="alert"
            class="rounded-lg bg-red-50 p-3 text-red-700 dark:bg-red-900/20 dark:text-red-300"
          >
            {{ browserStorage.error }}
          </div>
          <template v-else-if="browserStorage">
            <dl class="grid grid-cols-2 gap-3 text-gray-700 dark:text-gray-300 sm:grid-cols-3">
              <div>
                <dt class="text-xs text-gray-500 dark:text-gray-400">Used by this site</dt>
                <dd class="font-medium">{{ formatStorageBytes(browserStorage.usage) }}</dd>
              </div>
              <div>
                <dt class="text-xs text-gray-500 dark:text-gray-400">Browser quota</dt>
                <dd class="font-medium">{{ formatStorageBytes(browserStorage.quota) }}</dd>
              </div>
              <div>
                <dt class="text-xs text-gray-500 dark:text-gray-400">Persistence</dt>
                <dd class="font-medium">{{ browserStorage.persisted ? 'Granted' : 'Not guaranteed' }}</dd>
              </div>
            </dl>
            <div v-if="browserStoragePercent !== null" class="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div class="h-full bg-gold-600" :style="{ width: `${browserStoragePercent}%` }"></div>
            </div>
            <div
              v-if="browserStorage.migrationStatus?.status === 'partial'"
              role="alert"
              class="rounded-lg bg-amber-50 p-3 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
            >
              {{ browserStorage.migrationStatus.failedImageIds.length }} legacy image(s) could not be migrated. Their original database data was retained for recovery.
            </div>
            <button
              v-if="!browserStorage.persisted"
              type="button"
              class="rounded-lg bg-gold-600 px-4 py-2 font-medium text-white hover:bg-gold-700"
              @click="makeBrowserStoragePersistent"
            >
              Request persistent storage
            </button>
            <p v-if="browserStorageMessage" class="text-gray-600 dark:text-gray-300">{{ browserStorageMessage }}</p>
          </template>
        </div>
      </div>


      <!-- Cloud Backup Section -->
      <div class="bg-white dark:bg-navy-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div class="flex items-center space-x-2">
            <CloudArrowUpIcon class="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Cloud Backup</h2>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Encrypt your data with a password and sync it to your Google Drive. Only the password holder can decrypt the backup.
          </p>
          <p class="mt-3 rounded-lg bg-gold-50 p-3 text-sm text-gold-900 dark:bg-gold-900/20 dark:text-gold-100">
            When you choose backup or restore, beta bot asks Google for permission to create, find, update, and read only the backup file it creates in your Drive (<code>drive.file</code>). It cannot access unrelated Drive files. Your backup is encrypted on this device before upload. See the <RouterLink to="/privacy" class="font-medium underline">Privacy Policy</RouterLink>.
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
            <div class="relative">
              <input
                id="cloud-password"
                v-model="cloudPassword"
                :type="showCloudPassword ? 'text' : 'password'"
                placeholder="Enter a password used to encrypt your backup"
                class="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-gold-500 focus:border-transparent text-sm"
              />
              <button
                type="button"
                class="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                @click="showCloudPassword = !showCloudPassword"
                :aria-pressed="showCloudPassword"
                :aria-label="showCloudPassword ? 'Hide encryption password' : 'Show encryption password'"
              >
                <EyeSlashIcon v-if="showCloudPassword" class="w-5 h-5" />
                <EyeIcon v-else class="w-5 h-5" />
              </button>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
              <strong>Important:</strong> Use the same password every time. Backup will encrypt with any password you enter, but you'll need this exact password to restore.
            </p>
          </div>

          <div class="flex flex-wrap gap-3">
            <button
              @click="handleCloudBackup"
              :disabled="isBackingUp || !cloudPassword || !cloudSyncAvailable || !cloudSyncReady"
              class="inline-flex items-center px-4 py-2 bg-gold-600 text-white rounded-lg hover:bg-gold-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
              :disabled="isRestoring || !cloudPassword || !cloudSyncAvailable || !cloudSyncReady"
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

          <p
            v-if="!cloudSyncReady"
            class="text-xs text-amber-600 dark:text-amber-400"
          >
            Preparing Google Drive services...
          </p>

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
            <p>✓ Backups are stored in your Google Drive as <code class="bg-gray-100 dark:bg-gray-700 px-1 rounded">ai-beta-reader-backup.enc</code></p>
            <p>✓ Restoring requires the same password used for backup</p>
            <p>⚠️ Each backup overwrites the previous one - use the same password each time</p>
          </div>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
            To find your backup: Open <a href="https://drive.google.com" target="_blank" rel="noopener noreferrer" class="text-gold-600 dark:text-gold-400 hover:underline">Google Drive</a> and search for <code class="bg-gray-100 dark:bg-gray-700 px-1 rounded">ai-beta-reader-backup.enc</code>
          </p>
        </div>
      </div>

      <!-- Data Export Section -->
      <div class="bg-white dark:bg-navy-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mt-8">
        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Export Your Data</h2>
              <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Download all your books, chapters, and character data in a structured format.
              </p>
            </div>
            <button
              @click="handleExport"
              :disabled="isExporting"
              class="inline-flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium whitespace-nowrap w-full sm:w-auto"
            >
              <DocumentArrowDownIcon class="w-5 h-5 mr-2" />
              {{ isExporting ? 'Exporting...' : exportFormat === 'bundle' ? 'Export full library backup' : 'Export Data' }}
            </button>
          </div>
        </div>

        <div class="px-6 py-4 space-y-4">
          <!-- Export Format Selection -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Export Format
            </label>
            <div class="space-y-2">
              <label class="flex items-start cursor-pointer">
                <input
                  type="radio"
                  v-model="exportFormat"
                  value="bundle"
                  class="mt-0.5 h-4 w-4 text-green-600 border-gray-300 dark:border-gray-600 focus:ring-green-500"
                />
                <span class="ml-2">
                  <span class="block text-sm text-gray-900 dark:text-white">Full library backup (recommended)</span>
                  <span class="block text-xs text-gray-500 dark:text-gray-400">
                    Creates a complete canonical Beta Bot bundle with images, history, profiles, and audit records
                  </span>
                </span>
              </label>
              <label class="flex items-start cursor-pointer">
                <input
                  type="radio"
                  v-model="exportFormat"
                  value="zip"
                  class="mt-0.5 h-4 w-4 text-green-600 border-gray-300 dark:border-gray-600 focus:ring-green-500"
                />
                <span class="ml-2">
                  <span class="block text-sm text-gray-900 dark:text-white">Legacy structured ZIP (reading copy)</span>
                  <span class="block text-xs text-gray-500 dark:text-gray-400">
                    Creates folders for each book with separate files for chapters, images, and metadata
                  </span>
                </span>
              </label>
              <label class="flex items-start cursor-pointer">
                <input
                  type="radio"
                  v-model="exportFormat"
                  value="markdown"
                  class="mt-0.5 h-4 w-4 text-green-600 border-gray-300 dark:border-gray-600 focus:ring-green-500"
                />
                <span class="ml-2">
                  <span class="block text-sm text-gray-900 dark:text-white">Markdown files</span>
                  <span class="block text-xs text-gray-500 dark:text-gray-400">
                    Exports each book as a single .md file with all chapters combined
                  </span>
                </span>
              </label>
            </div>
          </div>

          <!-- Markdown Options (only for markdown export) -->
          <div v-if="exportFormat === 'markdown'" class="pl-6 border-l-2 border-gray-200 dark:border-gray-700 space-y-4">
            <!-- Granularity Option -->
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                File Organization
              </label>
              <div class="space-y-2">
                <label class="flex items-start cursor-pointer">
                  <input
                    type="radio"
                    v-model="markdownGranularity"
                    value="book"
                    class="mt-0.5 h-4 w-4 text-green-600 border-gray-300 dark:border-gray-600 focus:ring-green-500"
                  />
                  <span class="ml-2">
                    <span class="block text-sm text-gray-900 dark:text-white">One file per book</span>
                    <span class="block text-xs text-gray-500 dark:text-gray-400">
                      Each book becomes a single markdown file
                    </span>
                  </span>
                </label>
                <label class="flex items-start cursor-pointer">
                  <input
                    type="radio"
                    v-model="markdownGranularity"
                    value="part"
                    class="mt-0.5 h-4 w-4 text-green-600 border-gray-300 dark:border-gray-600 focus:ring-green-500"
                  />
                  <span class="ml-2">
                    <span class="block text-sm text-gray-900 dark:text-white">One file per part</span>
                    <span class="block text-xs text-gray-500 dark:text-gray-400">
                      Each part becomes a separate markdown file (books without parts export as one file)
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <!-- Include Notes Option -->
            <div>
              <label class="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  v-model="includeNotes"
                  class="h-4 w-4 text-green-600 border-gray-300 dark:border-gray-600 rounded focus:ring-green-500"
                />
                <span class="ml-2 text-sm text-gray-900 dark:text-white">Include chapter notes</span>
              </label>
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400 ml-6">
                Adds your personal notes at the end of each chapter
              </p>
            </div>
          </div>

          <div v-if="isExporting" class="pt-2">
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
            class="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-400"
          >
            {{ exportError }}
          </div>

          <div class="text-sm text-gray-600 dark:text-gray-400 space-y-2 pt-2">
            <p><strong>What's included in your export:</strong></p>
            <ul class="list-disc pl-5 space-y-1">
              <li>All your books with metadata</li>
              <li>Chapter content and summaries</li>
              <li v-if="exportFormat === 'bundle'">Complete restorable library data and image bytes</li>
              <li v-if="exportFormat === 'bundle'">Revision history, activity, profiles, and wiki audit state</li>
              <li v-if="exportFormat === 'bundle'">Deterministic human-readable Markdown and YAML files</li>
              <li v-if="exportFormat === 'zip'">Character wiki pages with all details</li>
              <li v-if="exportFormat === 'zip'">Organized folder structure for easy navigation</li>
              <li v-if="exportFormat === 'markdown' && markdownGranularity === 'book'">Combined chapters in reading order (one file per book)</li>
              <li v-if="exportFormat === 'markdown' && markdownGranularity === 'part'">Separate files for each part within book folders</li>
              <li v-if="exportFormat === 'markdown' && includeNotes">Your personal chapter notes</li>
            </ul>
            <p class="mt-4 text-xs text-gray-500 dark:text-gray-500">
              <template v-if="exportFormat === 'bundle'">
                This full backup is the canonical portable format. Import and restore support will be added in a later phase.
              </template>
              <template v-else-if="exportFormat === 'zip'">
                Your data will be downloaded as a ZIP file containing folders for each book, with subfolders for chapters and characters.
              </template>
              <template v-else-if="markdownGranularity === 'book'">
                Your data will be downloaded as a ZIP file containing one Markdown file per book.
              </template>
              <template v-else>
                Your data will be downloaded as a ZIP file with folders for each book, containing one Markdown file per part.
              </template>
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
