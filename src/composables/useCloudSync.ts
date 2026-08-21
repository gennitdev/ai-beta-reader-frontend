import { computed, ref, type Ref } from 'vue'
import type { DriveBackupGeneration } from '@/lib/libraryBundle/adapters/drive'

interface UseCloudSyncDeps {
  backupToCloud: (password: string) => Promise<void>
  restoreFromCloud: (password: string, generationId?: string) => Promise<void>
  listCloudBackups: () => Promise<DriveBackupGeneration[]>
  hasCloudSync: () => boolean
  cloudSyncReady: Ref<boolean>
}

/**
 * Google Drive encrypted backup/restore: the password field, in-flight state,
 * availability/readiness gating, and status messaging.
 */
export function useCloudSync(deps: UseCloudSyncDeps) {
  const { backupToCloud, restoreFromCloud, listCloudBackups, hasCloudSync, cloudSyncReady } = deps

  const cloudPassword = ref('')
  const showCloudPassword = ref(false)
  const isBackingUp = ref(false)
  const isRestoring = ref(false)
  const isLoadingGenerations = ref(false)
  const cloudGenerations = ref<DriveBackupGeneration[]>([])
  const cloudMessage = ref('')
  const cloudMessageType = ref<'success' | 'error' | ''>('')
  const cloudSyncAvailable = computed(() => hasCloudSync())

  const showCloudMessage = (message: string, type: 'success' | 'error') => {
    cloudMessage.value = message
    cloudMessageType.value = type

    if (type === 'success') {
      setTimeout(() => {
        cloudMessage.value = ''
        cloudMessageType.value = ''
      }, 10000) // Keep success visible for 10 seconds
    }
  }

  /** Shared availability/readiness gate. Returns false and messages if not usable. */
  const ensureCloudReady = (): boolean => {
    if (!cloudSyncAvailable.value) {
      showCloudMessage('Cloud sync is not configured. Add VITE_GOOGLE_CLIENT_ID to use Google Drive backups.', 'error')
      return false
    }
    if (!cloudSyncReady.value) {
      showCloudMessage('Still preparing Google Drive services. Please wait a moment.', 'error')
      return false
    }
    return true
  }

  const refreshCloudGenerations = async () => {
    if (!ensureCloudReady()) return
    isLoadingGenerations.value = true
    cloudMessage.value = ''
    try {
      cloudGenerations.value = await listCloudBackups()
      if (cloudGenerations.value.length === 0) {
        showCloudMessage('No versioned backups found. Legacy backup restore remains available.', 'success')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      showCloudMessage(`Could not list backups: ${message}`, 'error')
    } finally {
      isLoadingGenerations.value = false
    }
  }

  const handleCloudBackup = async () => {
    if (!cloudPassword.value.trim()) {
      showCloudMessage('Enter an encryption password before backing up.', 'error')
      return
    }
    if (!ensureCloudReady()) return

    try {
      isBackingUp.value = true
      cloudMessage.value = ''
      await backupToCloud(cloudPassword.value)
      await refreshCloudGenerations()
      showCloudMessage('Backup saved to Google Drive.', 'success')
    } catch (error) {
      console.error('[CloudSync] handleCloudBackup failed:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      showCloudMessage(`Backup failed: ${message}`, 'error')
    } finally {
      isBackingUp.value = false
    }
  }

  const handleCloudRestore = async (generationId?: string) => {
    if (!cloudPassword.value.trim()) {
      showCloudMessage('Enter your encryption password before restoring.', 'error')
      return
    }
    if (!ensureCloudReady()) return

    if (!confirm('Restoring from backup will replace your local data. Continue?')) {
      return
    }

    try {
      isRestoring.value = true
      cloudMessage.value = ''
      if (generationId) await restoreFromCloud(cloudPassword.value, generationId)
      else await restoreFromCloud(cloudPassword.value)
      showCloudMessage('Backup restored from Google Drive.', 'success')
    } catch (error) {
      console.error('[CloudSync] handleCloudRestore error:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      showCloudMessage(message, 'error')
    } finally {
      isRestoring.value = false
    }
  }

  return {
    cloudPassword,
    showCloudPassword,
    isBackingUp,
    isRestoring,
    isLoadingGenerations,
    cloudGenerations,
    cloudMessage,
    cloudMessageType,
    cloudSyncAvailable,
    handleCloudBackup,
    handleCloudRestore,
    refreshCloudGenerations,
  }
}
