import {
  IMAGE_BLOB_MIGRATION_STATUS_KEY,
  type ImageDataMigrationStatus,
} from '@/lib/imageDataMigration'
import { METADATA_STORE, readIndexedDbValue } from '@/lib/indexedDbStorage'

export interface BrowserStorageSnapshot {
  available: boolean
  persisted: boolean | null
  usage: number | null
  quota: number | null
  migrationStatus: ImageDataMigrationStatus | null
  error: string | null
}

export function formatStorageBytes(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'Unavailable'
  if (value < 1024) return `${value} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let amount = value / 1024
  let unitIndex = 0
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024
    unitIndex += 1
  }
  return `${amount.toFixed(amount >= 10 ? 1 : 2)} ${units[unitIndex]}`
}

export function browserStorageError(error: unknown, action: string): Error {
  const name = typeof DOMException !== 'undefined' && error instanceof DOMException
    ? error.name
    : typeof error === 'object' && error && 'name' in error
      ? String(error.name)
      : ''

  if (name === 'QuotaExceededError') {
    return new Error(
      `Browser storage is full, so the image could not be ${action}. Free device space or remove images, then try again.`,
    )
  }
  if (['InvalidStateError', 'NotAllowedError', 'SecurityError'].includes(name)) {
    return new Error(
      `Browser storage is unavailable or temporary in this browsing mode, so the image could not be ${action}. Try a regular browser window and allow site storage.`,
    )
  }
  if (name === 'AbortError') {
    return new Error(`Saving the image was interrupted before it could be ${action}. Please try again.`)
  }

  const detail = error instanceof Error ? ` ${error.message}` : ''
  return new Error(`The image could not be ${action} in browser storage.${detail}`)
}

export async function requestPersistentBrowserStorage(
  storage: StorageManager | undefined = globalThis.navigator?.storage,
): Promise<boolean | null> {
  if (!storage?.persist) return null
  try {
    return await storage.persist()
  } catch {
    return false
  }
}

export async function getBrowserStorageSnapshot(
  storage: StorageManager | undefined = globalThis.navigator?.storage,
  factory: IDBFactory | undefined = globalThis.indexedDB,
): Promise<BrowserStorageSnapshot> {
  if (!factory) {
    return {
      available: false,
      persisted: null,
      usage: null,
      quota: null,
      migrationStatus: null,
      error: 'IndexedDB is unavailable. Local images cannot be stored in this browsing mode.',
    }
  }

  try {
    const [estimate, persisted, migrationStatus] = await Promise.all([
      storage?.estimate?.() ?? Promise.resolve({}),
      storage?.persisted?.() ?? Promise.resolve(null),
      readIndexedDbValue<ImageDataMigrationStatus>(
        METADATA_STORE,
        IMAGE_BLOB_MIGRATION_STATUS_KEY,
        factory,
      ),
    ])
    return {
      available: true,
      persisted,
      usage: estimate.usage ?? null,
      quota: estimate.quota ?? null,
      migrationStatus: migrationStatus ?? null,
      error: null,
    }
  } catch (error) {
    return {
      available: false,
      persisted: null,
      usage: null,
      quota: null,
      migrationStatus: null,
      error: browserStorageError(error, 'accessed').message,
    }
  }
}
