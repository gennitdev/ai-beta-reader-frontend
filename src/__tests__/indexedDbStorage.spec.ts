import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'
import {
  APP_INDEXED_DB_NAME,
  APP_INDEXED_DB_VERSION,
  DATABASE_STORE,
  deleteIndexedDbValue,
  IMAGE_BLOBS_STORE,
  listIndexedDbKeys,
  METADATA_STORE,
  openAppIndexedDb,
  readIndexedDbValue,
  writeIndexedDbValue,
} from '@/lib/indexedDbStorage'

describe('IndexedDB storage', () => {
  it('creates the current schema and closes on version changes', async () => {
    const database = await openAppIndexedDb(new IDBFactory())
    const close = vi.spyOn(database, 'close')

    expect(database.name).toBe(APP_INDEXED_DB_NAME)
    expect(database.version).toBe(APP_INDEXED_DB_VERSION)
    expect(Array.from(database.objectStoreNames)).toEqual([
      DATABASE_STORE,
      IMAGE_BLOBS_STORE,
      METADATA_STORE,
    ])

    database.onversionchange?.(new Event('versionchange') as IDBVersionChangeEvent)
    expect(close).toHaveBeenCalledOnce()
  })

  it('round-trips, lists, and deletes values while closing each connection', async () => {
    const factory = new IDBFactory()

    await writeIndexedDbValue(METADATA_STORE, 'one', { value: 1 }, factory)
    await writeIndexedDbValue(METADATA_STORE, 'two', { value: 2 }, factory)
    await expect(readIndexedDbValue<{ value: number }>(METADATA_STORE, 'one', factory))
      .resolves.toEqual({ value: 1 })
    await expect(readIndexedDbValue(METADATA_STORE, 'missing', factory)).resolves.toBeUndefined()
    await expect(listIndexedDbKeys(METADATA_STORE, factory)).resolves.toEqual(['one', 'two'])

    await deleteIndexedDbValue(METADATA_STORE, 'one', factory)
    await expect(listIndexedDbKeys(METADATA_STORE, factory)).resolves.toEqual(['two'])
  })

  it('reports unavailable IndexedDB contexts clearly', async () => {
    const original = globalThis.indexedDB
    vi.stubGlobal('indexedDB', undefined)
    await expect(openAppIndexedDb()).rejects.toThrow(/not available/)
    vi.stubGlobal('indexedDB', original)
  })

  it('rejects blocked opens and closes a later successful connection', async () => {
    const close = vi.fn()
    const request = {
      result: { close },
      error: null,
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null,
      onblocked: null,
    } as unknown as IDBOpenDBRequest
    const factory = { open: vi.fn(() => request) } as unknown as IDBFactory
    const pending = openAppIndexedDb(factory)

    request.onblocked?.(new Event('blocked') as IDBVersionChangeEvent)
    await expect(pending).rejects.toThrow(/blocked by another app tab/)
    request.onsuccess?.(new Event('success'))
    expect(close).toHaveBeenCalledOnce()
  })

  it('surfaces open errors from the browser request', async () => {
    const failure = new Error('open failed')
    const request = {
      error: failure,
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null,
      onblocked: null,
    } as unknown as IDBOpenDBRequest
    const factory = { open: vi.fn(() => request) } as unknown as IDBFactory
    const pending = openAppIndexedDb(factory)

    request.onerror?.(new Event('error'))
    await expect(pending).rejects.toBe(failure)
  })
})
