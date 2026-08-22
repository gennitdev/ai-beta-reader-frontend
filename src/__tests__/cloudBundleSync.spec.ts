import { beforeEach, describe, expect, it, vi } from 'vitest'
import { completeDatabaseExportFixture } from './fixtures/libraryBundle'
import { canonicalModelToDatabaseImport } from '@/lib/libraryBundle/apply'
import { readBundleZipForTest } from '@/lib/libraryBundle/adapters/zip'
import type {
  DriveBackupGeneration,
  UploadDriveGenerationRequest,
} from '@/lib/libraryBundle/adapters/drive'
import type { CloudProvider } from '@/lib/cloudSync'
import { Encryption } from '@/lib/encryption'
import {
  CapacitorImageContentStore,
  IndexedDbImageContentStore,
} from '@/lib/imageContentStore'
import type { RecoveryStore, StoredRecoveryBundle } from '@/lib/recovery/model'
import { completeCanonicalLibraryFixture } from './fixtures/libraryBundle'

const dbMock = vi.hoisted(() => ({
  exportDatabase: vi.fn(), importDatabase: vi.fn(async () => undefined),
}))
const platformMock = vi.hoisted(() => ({ native: false }))
vi.mock('@/lib/database', () => ({ db: dbMock }))
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => platformMock.native,
    getPlatform: () => platformMock.native ? 'android' : 'web',
  },
  CapacitorHttp: {},
}))

import { CloudSync } from '@/lib/cloudSync'

function memoryRecoveryStore(): RecoveryStore {
  const values = new Map<string, StoredRecoveryBundle>()
  return {
    write: vi.fn(async (bundle) => { values.set(bundle.metadata.id, structuredClone(bundle)) }),
    read: vi.fn(async (id) => structuredClone(values.get(id) ?? null)),
    list: vi.fn(async () => [...values.values()].map((bundle) => bundle.metadata)),
    delete: vi.fn(async (id) => { values.delete(id) }),
  }
}

function generationProvider() {
  let encrypted = ''
  const generations: DriveBackupGeneration[] = []
  const provider: CloudProvider = {
    name: 'Drive', authenticate: vi.fn(async () => undefined), isAuthenticated: vi.fn(() => true),
    upload: vi.fn(async () => undefined), download: vi.fn(async () => null),
    uploadGeneration: vi.fn(async (request: UploadDriveGenerationRequest) => {
      encrypted = request.encryptedData
      const generation = { id: 'generation-1', name: request.name, ...request.metadata }
      generations.unshift(generation)
      return generation
    }),
    listGenerations: vi.fn(async () => [...generations]),
    downloadGeneration: vi.fn(async () => encrypted),
    deleteGeneration: vi.fn(async () => undefined),
  }
  return { provider, generations, encrypted: () => encrypted, setEncrypted: (value: string) => { encrypted = value } }
}

describe('CloudSync canonical Drive generations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    platformMock.native = false
    const database = completeDatabaseExportFixture()
    dbMock.exportDatabase.mockResolvedValue(new TextEncoder().encode(JSON.stringify(database)))
    dbMock.importDatabase.mockResolvedValue(undefined)
    vi.spyOn(IndexedDbImageContentStore.prototype, 'read').mockResolvedValue(
      new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    )
    vi.spyOn(IndexedDbImageContentStore.prototype, 'write').mockResolvedValue(undefined)
    vi.spyOn(IndexedDbImageContentStore.prototype, 'delete').mockResolvedValue(undefined)
    vi.spyOn(CapacitorImageContentStore.prototype, 'read').mockResolvedValue(
      new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    )
    vi.spyOn(CapacitorImageContentStore.prototype, 'write').mockResolvedValue(undefined)
    vi.spyOn(CapacitorImageContentStore.prototype, 'delete').mockResolvedValue(undefined)
    vi.spyOn(CapacitorImageContentStore.prototype, 'exists').mockResolvedValue(true)
    vi.spyOn(CapacitorImageContentStore.prototype, 'listStoredIds').mockResolvedValue(['image-1'])
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  it('uploads an encrypted canonical ZIP and restores it through verified recovery Replace', async () => {
    const drive = generationProvider()
    const recoveryStore = memoryRecoveryStore()
    const sync = new CloudSync(drive.provider, {
      recoveryStore, appVersion: '2.0.0', now: () => new Date('2026-08-20T15:00:00.000Z'),
    })

    const generation = await sync.backup('pw')
    expect(generation).toMatchObject({ appVersion: '2.0.0', bundleFormatVersion: 1 })
    expect(drive.encrypted()).toMatch(/^WC2:/)
    const plaintext = await Encryption.decrypt(drive.encrypted(), 'pw')
    expect([...plaintext.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])
    expect((await readBundleZipForTest(plaintext)).has('beta-bot.yaml')).toBe(true)

    await expect(sync.restore('pw', generation.id)).resolves.toBe(true)
    expect(dbMock.importDatabase).toHaveBeenCalledOnce()
    const imported = JSON.parse(new TextDecoder().decode(dbMock.importDatabase.mock.calls[0][0]))
    const expected = canonicalModelToDatabaseImport(completeCanonicalLibraryFixture())
    expected.image_assets = [{
      ...(expected.image_assets[0] as Record<string, unknown>),
      file_path: 'images/library/image-1/cover.png', image_data: null,
    }]
    expect(imported).toEqual(expected)
    expect(await recoveryStore.list()).toHaveLength(1)
  })

  it('rejects a changed generation ciphertext before decryption or database writes', async () => {
    const drive = generationProvider()
    const sync = new CloudSync(drive.provider, { recoveryStore: memoryRecoveryStore() })
    const generation = await sync.backup('pw')
    drive.setEncrypted(`${drive.encrypted()}changed`)
    await expect(sync.restore('pw', generation.id)).rejects.toThrow('integrity check')
    expect(dbMock.importDatabase).not.toHaveBeenCalled()
  })

  it('restores canonical image bytes and metadata to Android storage', async () => {
    const drive = generationProvider()
    const sync = new CloudSync(drive.provider, { recoveryStore: memoryRecoveryStore() })
    const generation = await sync.backup('pw')

    const nativeLocal = completeDatabaseExportFixture()
    nativeLocal.books[0].cover_image_id = null
    nativeLocal.image_assets = []
    nativeLocal.image_wiki_tags = []
    dbMock.exportDatabase.mockResolvedValue(new TextEncoder().encode(JSON.stringify(nativeLocal)))
    platformMock.native = true
    await sync.restore('pw', generation.id)

    const imported = JSON.parse(new TextDecoder().decode(dbMock.importDatabase.mock.calls[0][0]))
    expect(imported.image_assets[0]).toMatchObject({
      id: 'image-1', image_data: null, file_path: 'images/library/image-1/cover.png',
    })
    expect(CapacitorImageContentStore.prototype.write).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'image-1' }),
      expect.any(Blob),
    )
  })

  it('rolls back staged Android image content when canonical metadata import fails', async () => {
    const drive = generationProvider()
    const sync = new CloudSync(drive.provider, { recoveryStore: memoryRecoveryStore() })
    const generation = await sync.backup('pw')

    const nativeLocal = completeDatabaseExportFixture()
    nativeLocal.books[0].cover_image_id = null
    nativeLocal.image_assets = []
    nativeLocal.image_wiki_tags = []
    dbMock.exportDatabase.mockResolvedValue(new TextEncoder().encode(JSON.stringify(nativeLocal)))
    platformMock.native = true

    const blobs = new Map<string, Blob>()
    vi.mocked(CapacitorImageContentStore.prototype.read).mockImplementation(
      async (asset) => blobs.get(asset.id) ?? null,
    )
    vi.mocked(CapacitorImageContentStore.prototype.write).mockImplementation(
      async (asset, blob) => { blobs.set(asset.id, blob) },
    )
    vi.mocked(CapacitorImageContentStore.prototype.delete).mockImplementation(
      async (asset) => { blobs.delete(asset.id) },
    )
    dbMock.importDatabase.mockRejectedValueOnce(new Error('SQLite unavailable'))

    await expect(sync.restore('pw', generation.id)).rejects.toThrow(/prior library was restored/i)

    expect(blobs.size).toBe(0)
    expect(CapacitorImageContentStore.prototype.delete).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'image-1' }),
    )
  })

  it('preserves the verified recovery when both replacement and rollback imports fail', async () => {
    const drive = generationProvider()
    const recoveryStore = memoryRecoveryStore()
    const sync = new CloudSync(drive.provider, { recoveryStore })
    const generation = await sync.backup('pw')
    dbMock.importDatabase.mockRejectedValue(new Error('persistence unavailable'))
    await expect(sync.restore('pw', generation.id)).rejects.toThrow('automatic rollback also failed')
    expect(await recoveryStore.list()).toHaveLength(1)
  })
})
