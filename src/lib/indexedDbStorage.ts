export const APP_INDEXED_DB_NAME = 'ai-beta-reader-db'
export const APP_INDEXED_DB_VERSION = 2
export const DATABASE_STORE = 'database'
export const IMAGE_BLOBS_STORE = 'imageBlobs'
export const METADATA_STORE = 'metadata'
export const SQLITE_DATABASE_KEY = 'sqliteDb'

function getIndexedDbFactory(factory?: IDBFactory): IDBFactory {
  const resolved = factory ?? globalThis.indexedDB
  if (!resolved) {
    throw new Error('IndexedDB is not available in this browser context.')
  }
  return resolved
}

export function openAppIndexedDb(factory?: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = getIndexedDbFactory(factory).open(
      APP_INDEXED_DB_NAME,
      APP_INDEXED_DB_VERSION,
    )
    let wasBlocked = false

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(DATABASE_STORE)) {
        database.createObjectStore(DATABASE_STORE)
      }
      if (!database.objectStoreNames.contains(IMAGE_BLOBS_STORE)) {
        database.createObjectStore(IMAGE_BLOBS_STORE)
      }
      if (!database.objectStoreNames.contains(METADATA_STORE)) {
        database.createObjectStore(METADATA_STORE)
      }
    }

    request.onsuccess = () => {
      const database = request.result
      if (wasBlocked) {
        database.close()
        return
      }
      database.onversionchange = () => database.close()
      resolve(database)
    }
    request.onerror = () => reject(
      request.error ?? new Error('Failed to open IndexedDB.'),
    )
    request.onblocked = () => {
      wasBlocked = true
      reject(new Error(
        'Opening IndexedDB was blocked by another app tab. Close other tabs and try again.',
      ))
    }
  })
}

export async function readIndexedDbValue<T>(
  storeName: string,
  key: IDBValidKey,
  factory?: IDBFactory,
): Promise<T | undefined> {
  const database = await openAppIndexedDb(factory)

  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readonly')
      const request = transaction.objectStore(storeName).get(key)
      let value: T | undefined

      request.onsuccess = () => {
        value = request.result as T | undefined
      }
      transaction.oncomplete = () => resolve(value)
      transaction.onerror = () => reject(
        transaction.error ?? new Error(`Failed to read from IndexedDB store ${storeName}.`),
      )
      transaction.onabort = () => reject(
        transaction.error ?? new Error(`Reading IndexedDB store ${storeName} was aborted.`),
      )
    })
  } finally {
    database.close()
  }
}

export async function writeIndexedDbValue(
  storeName: string,
  key: IDBValidKey,
  value: unknown,
  factory?: IDBFactory,
): Promise<void> {
  const database = await openAppIndexedDb(factory)

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite')
      transaction.objectStore(storeName).put(value, key)

      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(
        transaction.error ?? new Error(`Failed to write IndexedDB store ${storeName}.`),
      )
      transaction.onabort = () => reject(
        transaction.error ?? new Error(`Writing IndexedDB store ${storeName} was aborted.`),
      )
    })
  } finally {
    database.close()
  }
}

export async function deleteIndexedDbValue(
  storeName: string,
  key: IDBValidKey,
  factory?: IDBFactory,
): Promise<void> {
  const database = await openAppIndexedDb(factory)

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite')
      transaction.objectStore(storeName).delete(key)

      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(
        transaction.error ?? new Error(`Failed to delete from IndexedDB store ${storeName}.`),
      )
      transaction.onabort = () => reject(
        transaction.error ?? new Error(`Deleting from IndexedDB store ${storeName} was aborted.`),
      )
    })
  } finally {
    database.close()
  }
}

export async function listIndexedDbKeys(
  storeName: string,
  factory?: IDBFactory,
): Promise<IDBValidKey[]> {
  const database = await openAppIndexedDb(factory)

  try {
    return await new Promise<IDBValidKey[]>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readonly')
      const request = transaction.objectStore(storeName).getAllKeys()
      let keys: IDBValidKey[] = []

      request.onsuccess = () => {
        keys = request.result
      }
      transaction.oncomplete = () => resolve(keys)
      transaction.onerror = () => reject(
        transaction.error ?? new Error(`Failed to list IndexedDB store ${storeName}.`),
      )
      transaction.onabort = () => reject(
        transaction.error ?? new Error(`Listing IndexedDB store ${storeName} was aborted.`),
      )
    })
  } finally {
    database.close()
  }
}
