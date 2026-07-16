import { describe, expect, it } from 'vitest'
import {
  browserStorageError,
  formatStorageBytes,
  getBrowserStorageSnapshot,
  requestPersistentBrowserStorage,
} from '@/lib/browserStorage'

describe('browser storage helpers', () => {
  it('formats browser-reported byte values without implying a fixed quota', () => {
    expect(formatStorageBytes(null)).toBe('Unavailable')
    expect(formatStorageBytes(512)).toBe('512 B')
    expect(formatStorageBytes(5 * 1024 * 1024)).toBe('5.00 MB')
  })

  it('distinguishes quota and ephemeral-storage failures', () => {
    expect(browserStorageError({ name: 'QuotaExceededError' }, 'saved').message)
      .toContain('storage is full')
    expect(browserStorageError({ name: 'SecurityError' }, 'saved').message)
      .toContain('temporary in this browsing mode')
  })

  it('reports IndexedDB as unavailable without throwing', async () => {
    const snapshot = await getBrowserStorageSnapshot(undefined, undefined)
    expect(snapshot).toMatchObject({ available: false })
    expect(snapshot.error).toContain('IndexedDB is unavailable')
  })

  it('requests persistent storage when supported', async () => {
    const storage = { persist: async () => true } as StorageManager
    await expect(requestPersistentBrowserStorage(storage)).resolves.toBe(true)
    await expect(requestPersistentBrowserStorage(undefined)).resolves.toBeNull()
  })
})
