import { describe, expect, it, vi } from 'vitest'
import type { RecoveryStore, StoredRecoveryBundle } from '@/lib/recovery/model'
import { assertRecoveryId } from '@/lib/recovery/model'
import { createVerifiedRecovery, readVerifiedRecovery, verifyStoredRecovery } from '@/lib/recovery/service'

function store(overrides: Partial<RecoveryStore> = {}) {
  const values = new Map<string, StoredRecoveryBundle>()
  const recoveryStore: RecoveryStore = {
    write: vi.fn(async (bundle) => { values.set(bundle.metadata.id, structuredClone(bundle)) }),
    read: vi.fn(async (id) => structuredClone(values.get(id) ?? null)),
    list: vi.fn(async () => [...values.values()].map((value) => value.metadata)),
    delete: vi.fn(async (id) => { values.delete(id) }),
    ...overrides,
  }
  return { values, recoveryStore }
}

const options = (id: string, createdAt: string) => ({
  id, bundleId: `bundle:${id}`, createdAt, appVersion: '1.0.0',
  sourceOperation: 'replace-library' as const, databaseGeneration: 'a'.repeat(64),
})

describe('verified recovery service', () => {
  it('writes, reads back, hashes, and retains only the three newest verified bundles', async () => {
    const { recoveryStore } = store()
    for (let index = 1; index <= 4; index++) {
      await createVerifiedRecovery(
        recoveryStore,
        new Uint8Array([index]),
        options(`recovery-${index}`, `2026-08-2${index}T00:00:00.000Z`),
      )
    }
    const listed = await recoveryStore.list()
    expect(listed.map((value) => value.id).sort()).toEqual(['recovery-2', 'recovery-3', 'recovery-4'])
    expect((await readVerifiedRecovery(recoveryStore, 'recovery-4')).bytes).toEqual(new Uint8Array([4]))
  })

  it('deletes a failed write-back verification before propagating the error', async () => {
    const corruptRead = vi.fn(async () => ({
      metadata: {
        ...options('recovery-bad', '2026-08-20T00:00:00.000Z'),
        byteLength: 1, sha256: '0'.repeat(64),
      },
      bytes: new Uint8Array([2]),
    }))
    const { recoveryStore } = store({ read: corruptRead })
    await expect(createVerifiedRecovery(
      recoveryStore, new Uint8Array([1]), options('recovery-bad', '2026-08-20T00:00:00.000Z'),
    )).rejects.toThrow('SHA-256')
    expect(recoveryStore.delete).toHaveBeenCalledWith('recovery-bad')
  })

  it('rejects missing, truncated, corrupt, and invalidly named recoveries', async () => {
    const { recoveryStore } = store()
    await expect(readVerifiedRecovery(recoveryStore, 'missing')).rejects.toThrow('not found')
    const metadata = {
      ...options('recovery-1', '2026-08-20T00:00:00.000Z'), byteLength: 2, sha256: '0'.repeat(64),
    }
    await expect(verifyStoredRecovery({ metadata, bytes: new Uint8Array([1]) })).rejects.toThrow('byte-length')
    await expect(verifyStoredRecovery({ ...{ metadata: { ...metadata, byteLength: 1 } }, bytes: new Uint8Array([1]) })).rejects.toThrow('SHA-256')
    expect(() => assertRecoveryId('../escape')).toThrow('Invalid recovery')
    expect(() => assertRecoveryId('recovery-safe')).not.toThrow()
  })

  it('supports a custom retention count', async () => {
    const { recoveryStore } = store()
    await createVerifiedRecovery(recoveryStore, new Uint8Array(), {
      ...options('recovery-empty', '2026-08-20T00:00:00.000Z'), retentionCount: 0,
    })
    expect(await recoveryStore.list()).toEqual([])
  })

  it('keeps a newly verified recovery usable if stale cleanup fails', async () => {
    const { recoveryStore } = store({ delete: vi.fn(async () => { throw new Error('busy') }) })
    await expect(createVerifiedRecovery(recoveryStore, new Uint8Array([1]), {
      ...options('recovery-keep', '2026-08-20T00:00:00.000Z'), retentionCount: 0,
    })).resolves.toMatchObject({ id: 'recovery-keep' })
  })
})
