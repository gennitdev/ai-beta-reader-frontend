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

  it('captures an error when the storage estimate/read fails', async () => {
    const storage = {
      estimate: async () => {
        throw new Error('estimate failed')
      },
      persisted: async () => false,
    } as unknown as StorageManager
    const factory = { open: () => ({}) } as unknown as IDBFactory

    const snapshot = await getBrowserStorageSnapshot(storage, factory)
    expect(snapshot.available).toBe(false)
    expect(snapshot.error).toBeTruthy()
  })

  it('requests persistent storage when supported', async () => {
    const storage = { persist: async () => true } as StorageManager
    await expect(requestPersistentBrowserStorage(storage)).resolves.toBe(true)
    await expect(requestPersistentBrowserStorage(undefined)).resolves.toBeNull()
  })

  it('returns false when requesting persistent storage throws', async () => {
    const storage = {
      persist: async () => {
        throw new Error('denied')
      },
    } as unknown as StorageManager
    await expect(requestPersistentBrowserStorage(storage)).resolves.toBe(false)
  })

  it('formats large values and rounds appropriately', () => {
    expect(formatStorageBytes(2048)).toBe('2.00 KB')
    expect(formatStorageBytes(15 * 1024 * 1024)).toBe('15.0 MB')
    expect(formatStorageBytes(3 * 1024 ** 4)).toBe('3.00 TB')
    expect(formatStorageBytes(Infinity)).toBe('Unavailable')
  })

  it('maps the remaining storage error names to friendly messages', () => {
    expect(browserStorageError({ name: 'InvalidStateError' }, 'saved').message)
      .toContain('temporary in this browsing mode')
    expect(browserStorageError({ name: 'AbortError' }, 'saved').message)
      .toContain('interrupted')
    expect(browserStorageError(new Error('boom'), 'saved').message)
      .toContain('boom')
    expect(browserStorageError('weird', 'saved').message)
      .toContain('could not be saved in browser storage')
  })
})
