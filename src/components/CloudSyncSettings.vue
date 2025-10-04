<template>
  <div class="bg-white dark:bg-gray-800 shadow sm:rounded-lg">
    <div class="px-4 py-5 sm:p-6">
      <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">
        Cloud Backup & Sync
      </h3>
      <div class="mt-2 max-w-xl text-sm text-gray-500 dark:text-gray-400">
        <p>
          Encrypt and backup your data to your own Google Drive. Your data is encrypted with your
          password before upload - only you can decrypt it.
        </p>
      </div>

      <div class="mt-5 space-y-4">
        <!-- Password Input -->
        <div>
          <label for="sync-password" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Encryption Password
          </label>
          <input
            id="sync-password"
            v-model="password"
            type="password"
            placeholder="Enter your encryption password"
            class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white sm:text-sm"
          />
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Use a strong password. If you forget it, your backups are unrecoverable.
          </p>
        </div>

        <!-- Action Buttons -->
        <div class="flex gap-3">
          <button
            @click="handleBackup"
            :disabled="!password || loading"
            class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg v-if="loading" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Backup to Google Drive
          </button>

          <button
            @click="handleRestore"
            :disabled="!password || loading"
            class="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Restore from Google Drive
          </button>
        </div>

        <!-- Status Message -->
        <div v-if="message" :class="[
          'p-3 rounded-md text-sm',
          messageType === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300'
        ]">
          {{ message }}
        </div>

        <!-- Info -->
        <div class="mt-4 text-xs text-gray-500 dark:text-gray-400 space-y-1">
          <p>✓ All data stored locally on your device</p>
          <p>✓ Encrypted backup to your Google Drive</p>
          <p>✓ Works offline - sync when ready</p>
          <p>✓ Your data, your cloud, your control</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useDatabase } from '@/composables/useDatabase'

const { backupToCloud, restoreFromCloud, hasCloudSync, loadBooks } = useDatabase()

const password = ref('')
const loading = ref(false)
const message = ref('')
const messageType = ref<'success' | 'error'>('success')

async function handleBackup() {
  if (!hasCloudSync()) {
    showMessage('Cloud sync not configured', 'error')
    return
  }

  try {
    loading.value = true
    message.value = ''
    await backupToCloud(password.value)
    showMessage('✓ Backup successful!', 'success')
  } catch (error) {
    showMessage(`Backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
  } finally {
    loading.value = false
  }
}

async function handleRestore() {
  if (!hasCloudSync()) {
    showMessage('Cloud sync not configured', 'error')
    return
  }

  if (!confirm('This will replace your local data with the backup. Continue?')) {
    return
  }

  try {
    loading.value = true
    message.value = ''
    const success = await restoreFromCloud(password.value)

    if (success) {
      showMessage('✓ Restore successful!', 'success')
      await loadBooks() // Refresh the UI
      // Optionally emit event or use router to refresh
      window.location.reload()
    } else {
      showMessage('No backup found or wrong password', 'error')
    }
  } catch (error) {
    showMessage(`Restore failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
  } finally {
    loading.value = false
  }
}

function showMessage(msg: string, type: 'success' | 'error') {
  message.value = msg
  messageType.value = type

  // Auto-clear success messages after 5 seconds
  if (type === 'success') {
    setTimeout(() => {
      message.value = ''
    }, 5000)
  }
}
</script>
