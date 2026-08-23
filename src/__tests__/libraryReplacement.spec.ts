import { describe, expect, it, vi } from 'vitest'
import { completeCanonicalLibraryFixture } from './fixtures/libraryBundle'
import type { LibraryImportPlan } from '@/lib/libraryBundle/plan'
import type { RecoveryStore, StoredRecoveryBundle } from '@/lib/recovery/model'
import { prepareLibraryReplacement, replaceLibraryWithRecovery } from '@/lib/recovery/replacement'

function memoryStore() {
  const values = new Map<string, StoredRecoveryBundle>()
  const store: RecoveryStore = {
    write: vi.fn(async (bundle) => values.set(bundle.metadata.id, structuredClone(bundle))),
    read: vi.fn(async (id) => structuredClone(values.get(id) ?? null)),
    list: vi.fn(async () => [...values.values()].map((value) => value.metadata)),
    delete: vi.fn(async (id) => { values.delete(id) }),
  }
  return { store, values }
}

function plan(generation = 'a'.repeat(64), replaceEligible = true): LibraryImportPlan {
  return {
    planVersion: 1, bundleId: 'bundle:incoming', databaseGeneration: generation,
    bookIds: ['book-1'], operations: [],
    counts: { create: 0, update: 0, delete: 0, keep_local: 0, unchanged: 0, conflict: 0 },
    countsByEntityType: {}, unresolvedConflicts: 0, canApply: false, replaceEligible, diagnostics: [],
    previewSummary: {
      images: { includedCount: 0, includedBytes: 0, omittedCount: 0, omittedBytes: 0 },
      wikiReview: { currentCount: 0, stale: [], missing: [] },
      ambiguousAliases: [], warnings: { unknownProfiles: [], ignoredFiles: [] },
    },
  }
}

async function prepared(store: RecoveryStore, importPlan = plan()) {
  return prepareLibraryReplacement(
    store, importPlan, completeCanonicalLibraryFixture(), importPlan.databaseGeneration,
    {
      recoveryId: 'recovery-1', recoveryBundleId: 'bundle:recovery',
      createdAt: '2026-08-20T15:00:00.000Z', appVersion: '1.0.0',
    },
  )
}

describe('Replace library with verified recovery', () => {
  it('writes a complete canonical recovery and then replaces every table', async () => {
    const { store } = memoryStore()
    const recovery = await prepared(store)
    const incoming = completeCanonicalLibraryFixture()
    incoming.books[0].title = 'Replacement title'
    const importDatabase = vi.fn().mockResolvedValue(undefined)
    await replaceLibraryWithRecovery(store, plan(), incoming, recovery, plan().databaseGeneration, importDatabase)
    expect(importDatabase).toHaveBeenCalledOnce()
    const imported = importDatabase.mock.calls[0][0]
    expect(imported.books[0].title).toBe('Replacement title')
    expect(recovery).toEqual(expect.objectContaining({ byteLength: expect.any(Number), sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }))
  })

  it('restores the prior model when replacement fails after writes begin', async () => {
    const { store } = memoryStore()
    const recovery = await prepared(store)
    const importDatabase = vi.fn()
      .mockRejectedValueOnce(new Error('persistence failed'))
      .mockResolvedValueOnce(undefined)
    await expect(replaceLibraryWithRecovery(
      store, plan(), completeCanonicalLibraryFixture(), recovery, plan().databaseGeneration, importDatabase,
    )).rejects.toThrow('prior library was restored')
    expect(importDatabase).toHaveBeenCalledTimes(2)
    const rollback = importDatabase.mock.calls[1][0]
    expect(rollback.books[0].title).toBe('A Book')
  })

  it('preserves the external recovery and reports both failures if rollback also fails', async () => {
    const { store } = memoryStore()
    const recovery = await prepared(store)
    const importDatabase = vi.fn().mockRejectedValue(new Error('write failed'))
    await expect(replaceLibraryWithRecovery(
      store, plan(), completeCanonicalLibraryFixture(), recovery, plan().databaseGeneration, importDatabase,
    )).rejects.toThrow(`Verified recovery ${recovery.id} is still available`)
    expect(await store.read(recovery.id)).not.toBeNull()
  })

  it('rejects invalid replacement metadata and loads recovery bytes only after a write failure', async () => {
    const { store, values } = memoryStore()
    await expect(prepared(store, plan('a'.repeat(64), false))).rejects.toThrow('not eligible')
    await expect(prepareLibraryReplacement(
      store, plan(), completeCanonicalLibraryFixture(), 'b'.repeat(64),
      { recoveryId: 'x', recoveryBundleId: 'bundle:x', createdAt: '2026-08-20T15:00:00.000Z', appVersion: '1' },
    )).rejects.toThrow('library changed')

    const recovery = await prepared(store)
    const importDatabase = vi.fn()
    const selection = completeCanonicalLibraryFixture()
    selection.bundle_kind = 'selection'
    await expect(replaceLibraryWithRecovery(
      store, plan(), selection, recovery, plan().databaseGeneration, importDatabase,
    )).rejects.toThrow('Selection bundles cannot replace')
    await expect(replaceLibraryWithRecovery(
      store, plan(), completeCanonicalLibraryFixture(), { ...recovery, databaseGeneration: 'b'.repeat(64) },
      plan().databaseGeneration, importDatabase,
    )).rejects.toThrow('does not match')
    values.get(recovery.id)!.bytes[0] ^= 0xff
    importDatabase.mockRejectedValueOnce(new Error('write failed'))
    await expect(replaceLibraryWithRecovery(
      store, plan(), completeCanonicalLibraryFixture(), recovery, plan().databaseGeneration, importDatabase,
    )).rejects.toThrow(`Verified recovery ${recovery.id} is still available`)
    expect(importDatabase).toHaveBeenCalledOnce()
  })
})
