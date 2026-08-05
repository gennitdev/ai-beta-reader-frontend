import { computed, ref, type Ref } from 'vue'
import {
  getBrowserStorageSnapshot,
  requestPersistentBrowserStorage,
  type BrowserStorageSnapshot,
} from '@/lib/browserStorage'
import { isDesktopAppRuntime } from '@/utils/platform'

interface UseBrowserStorageDeps {
  canStoreImages: Ref<boolean>
}

/**
 * Browser storage usage/quota snapshot and the "make persistent" request.
 * Only relevant on web/mobile builds that store images in the browser.
 */
export function useBrowserStorage(deps: UseBrowserStorageDeps) {
  const { canStoreImages } = deps

  const browserStorage = ref<BrowserStorageSnapshot | null>(null)
  const loadingBrowserStorage = ref(false)
  const browserStorageMessage = ref('')

  const showBrowserStorage = computed(
    () => canStoreImages.value && !isDesktopAppRuntime(),
  )

  const browserStoragePercent = computed(() => {
    const usage = browserStorage.value?.usage
    const quota = browserStorage.value?.quota
    if (usage == null || quota == null || quota <= 0) return null
    return Math.min(100, (usage / quota) * 100)
  })

  const refreshBrowserStorage = async () => {
    if (!showBrowserStorage.value) return
    loadingBrowserStorage.value = true
    browserStorage.value = await getBrowserStorageSnapshot()
    loadingBrowserStorage.value = false
  }

  const makeBrowserStoragePersistent = async () => {
    const persisted = await requestPersistentBrowserStorage()
    browserStorageMessage.value = persisted
      ? 'This browser granted persistent storage.'
      : 'Persistent storage was not granted. Keep encrypted backups in case browser data is cleared.'
    await refreshBrowserStorage()
  }

  return {
    browserStorage,
    loadingBrowserStorage,
    browserStorageMessage,
    showBrowserStorage,
    browserStoragePercent,
    refreshBrowserStorage,
    makeBrowserStoragePersistent,
  }
}
