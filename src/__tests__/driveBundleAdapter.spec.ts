import { describe, expect, it, vi } from 'vitest'
import {
  createDriveBackupGeneration,
  encryptedGenerationIntegrity,
  type DriveBackupGeneration,
  type DriveGenerationStore,
  type UploadDriveGenerationRequest,
} from '@/lib/libraryBundle/adapters/drive'

function driveStore() {
  const generations: DriveBackupGeneration[] = []
  const store: DriveGenerationStore = {
    uploadGeneration: vi.fn(async (request: UploadDriveGenerationRequest) => {
      const generation = { id: `generation-${generations.length + 1}`, ...request.metadata, name: request.name }
      generations.push(generation)
      return generation
    }),
    listGenerations: vi.fn(async () => [...generations]),
    downloadGeneration: vi.fn(async () => ''),
    deleteGeneration: vi.fn(async (id) => {
      const index = generations.findIndex((generation) => generation.id === id)
      if (index >= 0) generations.splice(index, 1)
    }),
  }
  return { store, generations }
}

describe('Drive canonical bundle generations', () => {
  it('records ciphertext integrity and retires only generations older than the newest three', async () => {
    const { store, generations } = driveStore()
    for (let day = 1; day <= 4; day++) {
      await createDriveBackupGeneration(store, `WC2:encrypted-${day}`, {
        createdAt: `2026-08-0${day}T00:00:00.000Z`, appVersion: '1.2.3', bundleFormatVersion: 1,
      })
    }
    expect(generations.map((generation) => generation.createdAt)).toEqual([
      '2026-08-02T00:00:00.000Z', '2026-08-03T00:00:00.000Z', '2026-08-04T00:00:00.000Z',
    ])
    expect(generations[0]).toEqual(expect.objectContaining({
      encryptedByteLength: expect.any(Number), ciphertextSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    }))
  })

  it('does not retire an older generation until the upload metadata is verified', async () => {
    const { store, generations } = driveStore()
    generations.push({
      id: 'existing', name: 'existing.enc', createdAt: '2026-08-01T00:00:00.000Z', appVersion: '1',
      bundleFormatVersion: 1, encryptedByteLength: 1, ciphertextSha256: 'a'.repeat(64),
    })
    store.uploadGeneration = vi.fn(async (request) => ({
      id: 'bad', name: request.name, ...request.metadata, ciphertextSha256: '0'.repeat(64),
    }))
    await expect(createDriveBackupGeneration(store, 'ciphertext', {
      createdAt: '2026-08-02T00:00:00.000Z', appVersion: '1', bundleFormatVersion: 1, retentionCount: 1,
    })).rejects.toThrow('did not record')
    expect(store.deleteGeneration).not.toHaveBeenCalled()
    expect(generations.map((value) => value.id)).toEqual(['existing'])
  })

  it('keeps the successful new generation when stale cleanup is temporarily unavailable', async () => {
    const { store } = driveStore()
    store.deleteGeneration = vi.fn(async () => { throw new Error('Drive busy') })
    await expect(createDriveBackupGeneration(store, 'ciphertext', {
      createdAt: '2026-08-02T00:00:00.000Z', appVersion: '1', bundleFormatVersion: 1, retentionCount: 0,
    })).resolves.toMatchObject({ id: 'generation-1' })
  })

  it('keeps the successful new generation when the retention listing fails', async () => {
    const { store } = driveStore()
    store.listGenerations = vi.fn(async () => { throw new Error('Drive busy') })
    await expect(createDriveBackupGeneration(store, 'ciphertext', {
      createdAt: '2026-08-02T00:00:00.000Z', appVersion: '1', bundleFormatVersion: 1,
    })).resolves.toMatchObject({ id: 'generation-1' })
  })

  it('hashes UTF-8 ciphertext bytes rather than JavaScript character count', async () => {
    await expect(encryptedGenerationIntegrity('é')).resolves.toEqual({
      encryptedByteLength: 2, ciphertextSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
  })
})
