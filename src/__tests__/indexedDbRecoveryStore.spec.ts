import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { IndexedDbRecoveryStore, RECOVERY_INDEXED_DB_NAME } from '@/lib/recovery/adapters/indexedDb'
import type { StoredRecoveryBundle } from '@/lib/recovery/model'

const bundle: StoredRecoveryBundle = {
  metadata: {
    id: 'recovery-1', bundleId: 'bundle:1', createdAt: '2026-08-20T00:00:00.000Z',
    appVersion: '1.0.0', sourceOperation: 'replace-library', databaseGeneration: 'a'.repeat(64),
    byteLength: 3, sha256: 'b'.repeat(64),
  },
  bytes: new Uint8Array([1, 2, 3]),
}

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(RECOVERY_INDEXED_DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

describe('IndexedDbRecoveryStore', () => {
  beforeEach(deleteDatabase)

  it('stores recovery bytes in a dedicated database and lists, reads, and deletes them', async () => {
    const store = new IndexedDbRecoveryStore()
    await store.write(bundle)
    expect(await store.list()).toEqual([bundle.metadata])
    expect(await store.read(bundle.metadata.id)).toEqual(bundle)
    await store.delete(bundle.metadata.id)
    expect(await store.read(bundle.metadata.id)).toBeNull()
  })

  it('rejects unsafe IDs and missing IndexedDB support', async () => {
    const store = new IndexedDbRecoveryStore()
    await expect(store.read('../bad')).rejects.toThrow('Invalid recovery')
    expect(() => new IndexedDbRecoveryStore(null as unknown as IDBFactory)).toThrow('unavailable')
  })
})
