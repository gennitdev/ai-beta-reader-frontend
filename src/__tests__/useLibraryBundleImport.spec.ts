// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { completeCanonicalLibraryFixture } from './fixtures/libraryBundle'
import { useLibraryBundleImport } from '@/composables/useLibraryBundleImport'
import { canonicalModelToDatabaseImport } from '@/lib/libraryBundle/apply'
import { sha256Hex } from '@/lib/libraryBundle/semanticHash'
import type { LibraryImportPlan } from '@/lib/libraryBundle/plan'
import type { RecoveryStore, StoredRecoveryBundle } from '@/lib/recovery/model'
import { MAX_BUNDLE_ARCHIVE_BYTES } from '@/lib/libraryBundle/limits'

const previewZip = vi.hoisted(() => vi.fn())
const previewDirectory = vi.hoisted(() => vi.fn())
const prepareReplacement = vi.hoisted(() => vi.fn())
const replaceWithRecovery = vi.hoisted(() => vi.fn())
const importCanonicalModel = vi.hoisted(() => vi.fn())
const removeAbsentAssets = vi.hoisted(() => vi.fn())
vi.mock('@/lib/libraryBundle/importPreview', () => ({
  previewBundleZipImport: previewZip,
  previewBundleDirectoryImport: previewDirectory,
}))
vi.mock('@/lib/recovery/replacement', () => ({
  prepareLibraryReplacement: prepareReplacement,
  replaceLibraryWithRecovery: replaceWithRecovery,
}))
vi.mock('@/lib/libraryBundle/restore', () => ({
  importCanonicalLibraryModel: importCanonicalModel,
  removeCanonicalAssetsAbsentFromModel: removeAbsentAssets,
}))
vi.mock('@/lib/runtimeImageContentStore', () => ({
  createRuntimeImageContentStore: () => ({ kind: 'image-store' }),
}))

function emptyPlan(generation: string): LibraryImportPlan {
  return {
    planVersion: 1, bundleId: 'bundle:test', databaseGeneration: generation, bookIds: ['book-1'],
    operations: [], counts: { create: 0, update: 0, delete: 0, keep_local: 0, unchanged: 0, conflict: 0 },
    countsByEntityType: {}, unresolvedConflicts: 0, canApply: true, replaceEligible: true, diagnostics: [],
    previewSummary: {
      images: { includedCount: 0, includedBytes: 0, omittedCount: 0, omittedBytes: 0 },
      wikiReview: { currentCount: 0, stale: [], missing: [] },
      ambiguousAliases: [], warnings: { unknownProfiles: [], ignoredFiles: [] },
    },
  }
}

function memoryStore(): RecoveryStore {
  const values = new Map<string, StoredRecoveryBundle>()
  return {
    write: vi.fn(async (value) => { values.set(value.metadata.id, value) }),
    read: vi.fn(async (id) => values.get(id) ?? null),
    list: vi.fn(async () => [...values.values()].map((value) => value.metadata)),
    delete: vi.fn(async (id) => { values.delete(id) }),
  }
}

describe('useLibraryBundleImport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    importCanonicalModel.mockImplementation(async (_model, importer) => {
      await importer.importDatabaseBackup(new Uint8Array())
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses a background worker for add/update ZIP previews', async () => {
    const model = completeCanonicalLibraryFixture()
    const backup = new TextEncoder().encode(JSON.stringify(canonicalModelToDatabaseImport(model)))
    const generation = await sha256Hex(backup)
    const workerPreview = {
      plan: emptyPlan(generation), localModel: model, incomingModel: model,
      databaseGeneration: generation, exportedAt: '2026-08-25T03:20:00.000Z',
    }
    const transfers: Transferable[][] = []
    const terminate = vi.fn()
    class SuccessfulWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: ((event: ErrorEvent) => void) | null = null
      postMessage(_message: unknown, transfer: Transferable[]) {
        transfers.push(transfer)
        queueMicrotask(() => this.onmessage?.({
          data: { type: 'preview-complete', preview: workerPreview },
        } as MessageEvent))
      }
      terminate = terminate
    }
    vi.stubGlobal('Worker', SuccessfulWorker)
    const state = useLibraryBundleImport({
      exportDatabase: vi.fn().mockResolvedValue(backup), importDatabaseBackup: vi.fn(),
      getImageBlob: vi.fn(), recoveryStore: memoryStore(), intent: 'add-or-update-books',
    })

    await state.previewFile(new File(['zip'], 'large.zip'))

    expect(state.preview.value).toBe(workerPreview)
    expect(previewZip).not.toHaveBeenCalled()
    expect(transfers).toHaveLength(1)
    expect(transfers[0]).toHaveLength(2)
    expect(terminate).toHaveBeenCalledOnce()
  })

  it('cancels an obsolete worker preview and ignores its result', async () => {
    const model = completeCanonicalLibraryFixture()
    const backup = new TextEncoder().encode(JSON.stringify(canonicalModelToDatabaseImport(model)))
    const generation = await sha256Hex(backup)
    const workers: PendingWorker[] = []
    class PendingWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: ((event: ErrorEvent) => void) | null = null
      postMessage = vi.fn()
      terminate = vi.fn()
      constructor() { workers.push(this) }
    }
    vi.stubGlobal('Worker', PendingWorker)
    const state = useLibraryBundleImport({
      exportDatabase: vi.fn().mockResolvedValue(backup), importDatabaseBackup: vi.fn(),
      getImageBlob: vi.fn(), recoveryStore: memoryStore(), intent: 'add-or-update-books',
    })

    const obsolete = state.previewFile(new File(['old'], 'old.zip'))
    await vi.waitFor(() => expect(workers).toHaveLength(1))
    const current = state.previewFile(new File(['new'], 'new.zip'))
    await vi.waitFor(() => expect(workers).toHaveLength(2))
    expect(workers[0].terminate).toHaveBeenCalledOnce()
    const currentPreview = {
      plan: emptyPlan(generation), localModel: model, incomingModel: model,
      databaseGeneration: generation, exportedAt: null,
    }
    workers[1].onmessage?.({
      data: { type: 'preview-complete', preview: currentPreview },
    } as MessageEvent)

    await Promise.all([obsolete, current])
    expect(state.preview.value).toBe(currentPreview)
    expect(state.importFileName.value).toBe('new.zip')
    expect(state.isPreviewing.value).toBe(false)
  })

  it('previews ZIPs and directories, resolves a conflict, and applies against the same generation', async () => {
    const model = completeCanonicalLibraryFixture()
    const backup = new TextEncoder().encode(JSON.stringify(canonicalModelToDatabaseImport(model)))
    const generation = await sha256Hex(backup)
    previewZip.mockResolvedValue({ plan: emptyPlan(generation), localModel: model, incomingModel: model, databaseGeneration: generation })
    previewDirectory.mockResolvedValue({ plan: emptyPlan(generation), localModel: model, incomingModel: model, databaseGeneration: generation })
    const importDatabaseBackup = vi.fn().mockResolvedValue(undefined)
    const state = useLibraryBundleImport({
      exportDatabase: vi.fn().mockResolvedValue(backup), importDatabaseBackup,
      getImageBlob: vi.fn().mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])])),
      recoveryStore: memoryStore(),
      intent: 'add-or-update-books',
    })

    await state.previewFile(new File(['zip'], 'bundle.zip'))
    expect(state.plan.value?.bundleId).toBe('bundle:test')
    expect(state.importFileName.value).toBe('bundle.zip')
    expect(previewZip).toHaveBeenCalledWith(expect.any(Uint8Array), backup, expect.objectContaining({
      intent: 'add-or-update-books',
      retainLocalAssetBytes: false,
    }))

    const folderFile = new File(['manifest'], 'beta-bot.yaml')
    Object.defineProperty(folderFile, 'webkitRelativePath', { value: 'my-library/beta-bot.yaml' })
    await state.previewDirectory([folderFile])
    expect(state.importFileName.value).toBe('my-library')

    await state.applyChanges()
    expect(importCanonicalModel).toHaveBeenCalledWith(model, expect.objectContaining({
      assetIdsToWrite: expect.any(Set),
    }))
    expect(importDatabaseBackup).toHaveBeenCalledOnce()
    expect(state.importMessage.value).toBe('Bundle changes applied successfully.')
    expect(state.preview.value).toBeNull()
  })

  it('cleans up newly created image content when applying the database import fails', async () => {
    const incomingModel = completeCanonicalLibraryFixture()
    const localModel = structuredClone(incomingModel)
    localModel.book_ids = []
    localModel.books = []
    localModel.assets = []
    const backup = new TextEncoder().encode(JSON.stringify(canonicalModelToDatabaseImport(localModel)))
    const generation = await sha256Hex(backup)
    const plan = {
      ...emptyPlan(generation),
      operations: [{
        key: 'asset\0image-1', entityType: 'asset', entityId: 'image-1', bookId: 'book-1',
        kind: 'create' as const, changedFields: [],
      }],
      counts: { create: 1, update: 0, delete: 0, keep_local: 0, unchanged: 0, conflict: 0 },
      countsByEntityType: {
        asset: { create: 1, update: 0, delete: 0, keep_local: 0, unchanged: 0, conflict: 0 },
      },
    }
    previewZip.mockResolvedValue({ plan, localModel, incomingModel, databaseGeneration: generation })
    importCanonicalModel.mockRejectedValueOnce(new Error('database write failed'))
    const state = useLibraryBundleImport({
      exportDatabase: vi.fn().mockResolvedValue(backup),
      importDatabaseBackup: vi.fn(),
      getImageBlob: vi.fn(),
      recoveryStore: memoryStore(),
      intent: 'add-or-update-books',
    })

    await state.previewFile(new File(['zip'], 'bundle.zip'))
    await expect(state.applyChanges()).resolves.toEqual([])

    expect(removeAbsentAssets).toHaveBeenCalledWith(
      expect.anything(),
      [expect.objectContaining({ id: 'image-1' })],
      localModel,
    )
    expect(state.importError.value).toBe('database write failed')
  })

  it('exposes immutable preview summaries without deriving them from live state', async () => {
    const model = completeCanonicalLibraryFixture()
    const backup = new TextEncoder().encode(JSON.stringify(canonicalModelToDatabaseImport(model)))
    const generation = await sha256Hex(backup)
    const summarizedPlan = {
      ...emptyPlan(generation),
      previewSummary: {
        images: { includedCount: 1, includedBytes: 3, omittedCount: 0, omittedBytes: 0 },
        wikiReview: { currentCount: 1, stale: [], missing: [] },
        ambiguousAliases: [], warnings: { unknownProfiles: [], ignoredFiles: [] },
      },
    }
    previewZip.mockResolvedValue({ plan: summarizedPlan, localModel: model, incomingModel: model, databaseGeneration: generation })
    const state = useLibraryBundleImport({
      exportDatabase: vi.fn().mockResolvedValue(backup), importDatabaseBackup: vi.fn(), getImageBlob: vi.fn(),
      recoveryStore: memoryStore(),
    })
    await state.previewFile(new File(['zip'], 'bundle.zip'))
    expect(state.plan.value?.previewSummary).toEqual(summarizedPlan.previewSummary)
  })

  it('surfaces preview and apply failures without throwing from UI handlers', async () => {
    const model = completeCanonicalLibraryFixture()
    const backup = new TextEncoder().encode(JSON.stringify(canonicalModelToDatabaseImport(model)))
    previewZip.mockRejectedValueOnce(new Error('Bad archive'))
    const state = useLibraryBundleImport({
      exportDatabase: vi.fn().mockResolvedValue(backup),
      importDatabaseBackup: vi.fn().mockRejectedValue(new Error('Write failed')),
      getImageBlob: vi.fn(),
      recoveryStore: memoryStore(),
    })
    await state.previewFile(new File(['bad'], 'bad.zip'))
    expect(state.importError.value).toBe('Bad archive')

    const generation = await sha256Hex(backup)
    previewZip.mockResolvedValueOnce({ plan: emptyPlan(generation), localModel: model, incomingModel: model, databaseGeneration: generation })
    await state.previewFile(new File(['ok'], 'ok.zip'))
    await state.applyChanges()
    expect(state.importError.value).toBe('Write failed')
  })

  it('rejects oversized ZIPs before archive materialization or database reads', async () => {
    const exportDatabase = vi.fn()
    const file = new File(['small placeholder'], 'oversized.zip')
    const arrayBuffer = vi.spyOn(file, 'arrayBuffer')
    Object.defineProperty(file, 'size', { value: MAX_BUNDLE_ARCHIVE_BYTES + 1 })
    const state = useLibraryBundleImport({
      exportDatabase,
      importDatabaseBackup: vi.fn(),
      getImageBlob: vi.fn(),
      recoveryStore: memoryStore(),
    })

    await state.previewFile(file)

    expect(state.importError.value).toContain('browser import limit')
    expect(arrayBuffer).not.toHaveBeenCalled()
    expect(exportDatabase).not.toHaveBeenCalled()
    expect(previewZip).not.toHaveBeenCalled()
  })

  it('records conflict choices as a new plan', () => {
    const state = useLibraryBundleImport({ exportDatabase: vi.fn(), importDatabaseBackup: vi.fn(), getImageBlob: vi.fn(), recoveryStore: memoryStore() })
    const model = completeCanonicalLibraryFixture()
    const operation = {
      key: 'chapter\0chapter-1', entityType: 'chapter', entityId: 'chapter-1', kind: 'conflict' as const,
      conflictReason: 'different_edits' as const, changedFields: ['body'],
    }
    state.preview.value = {
      localModel: model, incomingModel: model, databaseGeneration: 'g', exportedAt: null,
      plan: {
        ...emptyPlan('g'), operations: [operation], canApply: false, unresolvedConflicts: 1,
        counts: { create: 0, update: 0, delete: 0, keep_local: 0, unchanged: 0, conflict: 1 },
        countsByEntityType: { chapter: { create: 0, update: 0, delete: 0, keep_local: 0, unchanged: 0, conflict: 1 } },
      },
    }
    state.resolveConflict(operation.key, 'keep_local')
    expect(state.plan.value?.operations[0].resolution).toBe('keep_local')
    expect(state.plan.value?.canApply).toBe(true)
  })

  it('prepares a verified recovery, requires confirmation, replaces, restores, and downloads it', async () => {
    const localModel = completeCanonicalLibraryFixture()
    const incomingModel = completeCanonicalLibraryFixture()
    incomingModel.books[0].title = 'Incoming title'
    const backup = new TextEncoder().encode(JSON.stringify(canonicalModelToDatabaseImport(localModel)))
    const generation = await sha256Hex(backup)
    const importPlan = emptyPlan(generation)
    previewZip.mockResolvedValue({ plan: importPlan, localModel, incomingModel, databaseGeneration: generation })
    const importDatabaseBackup = vi.fn().mockResolvedValue(undefined)
    const confirmReplace = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
    const recoveryStore = memoryStore()
    const recoveryBytes = new Uint8Array([1, 2, 3])
    const recovery = {
      id: 'recovery-1', bundleId: 'bundle:recovery', createdAt: '2026-08-20T00:00:00.000Z',
      appVersion: '1.0.0', sourceOperation: 'replace-library' as const, databaseGeneration: generation,
      byteLength: recoveryBytes.byteLength, sha256: await sha256Hex(recoveryBytes),
    }
    prepareReplacement.mockResolvedValueOnce(recovery)
    replaceWithRecovery.mockResolvedValueOnce(undefined)
    const state = useLibraryBundleImport({
      exportDatabase: vi.fn().mockResolvedValue(backup), importDatabaseBackup,
      getImageBlob: vi.fn().mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])])),
      recoveryStore, confirmReplace,
    })

    await state.previewFile(new File(['zip'], 'incoming.zip'))
    await state.prepareReplace()
    expect(state.preparedRecovery.value).toEqual(expect.objectContaining({
      sourceOperation: 'replace-library', databaseGeneration: generation,
    }))

    await state.replaceLibrary()
    expect(importDatabaseBackup).not.toHaveBeenCalled()
    await state.replaceLibrary()
    expect(replaceWithRecovery).toHaveBeenCalledOnce()
    expect(state.preview.value).toBeNull()

    await recoveryStore.write({ metadata: recovery, bytes: recoveryBytes })
    await state.refreshRecoveries()
    await state.previewRecovery(recovery.id)
    expect(state.importFileName.value).toContain('Recovery from')

    const createObjectURL = vi.fn(() => 'blob:recovery')
    const revokeObjectURL = vi.fn()
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: createObjectURL },
      revokeObjectURL: { configurable: true, value: revokeObjectURL },
    })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    await state.downloadRecovery(recovery.id)
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:recovery')
    click.mockRestore()
  })

  it('surfaces recovery storage failures without making replacement available', async () => {
    const localModel = completeCanonicalLibraryFixture()
    const backup = new TextEncoder().encode(JSON.stringify(canonicalModelToDatabaseImport(localModel)))
    const generation = await sha256Hex(backup)
    previewZip.mockResolvedValue({ plan: emptyPlan(generation), localModel, incomingModel: localModel, databaseGeneration: generation })
    const recoveryStore = memoryStore()
    prepareReplacement.mockRejectedValueOnce(new Error('recovery disk full'))
    const state = useLibraryBundleImport({
      exportDatabase: vi.fn().mockResolvedValue(backup), importDatabaseBackup: vi.fn(),
      getImageBlob: vi.fn(), recoveryStore,
    })
    await state.previewFile(new File(['zip'], 'incoming.zip'))
    await state.prepareReplace()
    expect(state.importError.value).toBe('recovery disk full')
    expect(state.preparedRecovery.value).toBeNull()
  })
})
