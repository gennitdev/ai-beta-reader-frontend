import { assertRecoveryId, parseRecoveryMetadata, type RecoveryBundleMetadata, type RecoveryStore, type StoredRecoveryBundle } from '../model'

export const RECOVERY_INDEXED_DB_NAME = 'beta-bot-recovery'
export const RECOVERY_INDEXED_DB_VERSION = 1
export const RECOVERY_OBJECT_STORE = 'bundles'

interface RecoveryRecord {
  metadata: RecoveryBundleMetadata
  bytes: ArrayBuffer
}

export class IndexedDbRecoveryStore implements RecoveryStore {
  constructor(private readonly factory: IDBFactory = globalThis.indexedDB) {
    if (!factory) throw new Error('IndexedDB is unavailable for recovery storage.')
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = this.factory.open(RECOVERY_INDEXED_DB_NAME, RECOVERY_INDEXED_DB_VERSION)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(RECOVERY_OBJECT_STORE)) {
          request.result.createObjectStore(RECOVERY_OBJECT_STORE, { keyPath: 'metadata.id' })
        }
      }
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close()
        resolve(request.result)
      }
      request.onerror = () => reject(request.error ?? new Error('Failed to open recovery storage.'))
      request.onblocked = () => reject(new Error('Recovery storage is blocked by another app tab.'))
    })
  }

  private async transaction<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore, resolve: (value: T) => void) => void,
  ): Promise<T> {
    const database = await this.open()
    try {
      return await new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(RECOVERY_OBJECT_STORE, mode)
        operation(transaction.objectStore(RECOVERY_OBJECT_STORE), resolve)
        transaction.onerror = () => reject(transaction.error ?? new Error('Recovery storage transaction failed.'))
        transaction.onabort = () => reject(transaction.error ?? new Error('Recovery storage transaction was aborted.'))
      })
    } finally {
      database.close()
    }
  }

  async write(bundle: StoredRecoveryBundle): Promise<void> {
    assertRecoveryId(bundle.metadata.id)
    await this.transaction<void>('readwrite', (store, resolve) => {
      const request = store.put({ metadata: bundle.metadata, bytes: bundle.bytes.slice().buffer } satisfies RecoveryRecord)
      request.onsuccess = () => resolve()
    })
  }

  async read(id: string): Promise<StoredRecoveryBundle | null> {
    assertRecoveryId(id)
    return this.transaction('readonly', (store, resolve) => {
      const request = store.get(id)
      request.onsuccess = () => {
        const record = request.result as RecoveryRecord | undefined
        resolve(record ? { metadata: parseRecoveryMetadata(record.metadata), bytes: new Uint8Array(record.bytes) } : null)
      }
    })
  }

  async list(): Promise<RecoveryBundleMetadata[]> {
    return this.transaction('readonly', (store, resolve) => {
      const request = store.getAll()
      request.onsuccess = () => resolve((request.result as RecoveryRecord[]).map((record) => parseRecoveryMetadata(record.metadata)))
    })
  }

  async delete(id: string): Promise<void> {
    assertRecoveryId(id)
    await this.transaction<void>('readwrite', (store, resolve) => {
      const request = store.delete(id)
      request.onsuccess = () => resolve()
    })
  }
}
