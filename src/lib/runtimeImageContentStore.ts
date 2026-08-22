import { Capacitor } from '@capacitor/core'
import {
  CapacitorImageContentStore,
  ElectronImageContentStore,
  IndexedDbImageContentStore,
  type ImageContentStore,
} from '@/lib/imageContentStore'

export type ImageStorageRuntime = 'android' | 'electron' | 'browser' | 'unsupported'

export function getImageStorageRuntime(): ImageStorageRuntime {
  if (typeof window !== 'undefined' && window.desktopImages) return 'electron'
  try {
    const platform = Capacitor.getPlatform()
    if (platform === 'electron') return 'electron'
    if (platform === 'android') return 'android'
    if (platform === 'web') return 'browser'
    if (Capacitor.isNativePlatform()) return 'unsupported'
  } catch {
    // Fall through to browser capability detection.
  }
  return typeof window === 'undefined' ? 'unsupported' : 'browser'
}

export function createRuntimeImageContentStore(): ImageContentStore | null {
  const runtime = getImageStorageRuntime()
  if (runtime === 'electron') {
    return typeof window !== 'undefined' && window.desktopImages
      ? new ElectronImageContentStore(window.desktopImages)
      : null
  }
  if (runtime === 'android') return new CapacitorImageContentStore()
  if (runtime === 'browser') return new IndexedDbImageContentStore()
  return null
}
