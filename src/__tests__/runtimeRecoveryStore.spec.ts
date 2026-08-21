// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRuntimeRecoveryStore } from '@/lib/recovery/runtime'
import { DesktopRecoveryStore } from '@/lib/recovery/adapters/desktop'
import { NativeRecoveryStore } from '@/lib/recovery/adapters/native'
import { RECOVERY_INDEXED_DB_NAME } from '@/lib/recovery/adapters/indexedDb'
import type { StoredRecoveryBundle } from '@/lib/recovery/model'

const isNativePlatform = vi.hoisted(() => vi.fn(() => false))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform } }))

const bundle: StoredRecoveryBundle = {
  metadata: {
    id: 'recovery-runtime', bundleId: 'bundle:runtime', createdAt: '2026-08-20T00:00:00.000Z',
    appVersion: '1.0.0', sourceOperation: 'replace-library', databaseGeneration: 'a'.repeat(64),
    byteLength: 1, sha256: 'b'.repeat(64),
  },
  bytes: new Uint8Array([1]),
}

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(RECOVERY_INDEXED_DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

describe('createRuntimeRecoveryStore', () => {
  beforeEach(async () => {
    isNativePlatform.mockReturnValue(false)
    delete window.desktopRecovery
    await deleteDatabase()
  })
  afterEach(() => { delete window.desktopRecovery })

  it('selects the desktop and native adapters from runtime capabilities', () => {
    window.desktopRecovery = {} as typeof window.desktopRecovery
    expect(createRuntimeRecoveryStore()).toBeInstanceOf(DesktopRecoveryStore)
    delete window.desktopRecovery
    isNativePlatform.mockReturnValue(true)
    expect(createRuntimeRecoveryStore()).toBeInstanceOf(NativeRecoveryStore)
  })

  it('lazily delegates every browser operation to the dedicated IndexedDB store', async () => {
    const store = createRuntimeRecoveryStore()
    await store.write(bundle)
    expect(await store.read(bundle.metadata.id)).toEqual(bundle)
    expect(await store.list()).toEqual([bundle.metadata])
    await store.delete(bundle.metadata.id)
    expect(await store.read(bundle.metadata.id)).toBeNull()
  })
})
