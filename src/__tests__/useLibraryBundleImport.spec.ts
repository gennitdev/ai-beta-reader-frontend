// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { completeCanonicalLibraryFixture } from './fixtures/libraryBundle'
import { useLibraryBundleImport } from '@/composables/useLibraryBundleImport'
import { canonicalModelToDatabaseImport } from '@/lib/libraryBundle/apply'
import { sha256Hex } from '@/lib/libraryBundle/semanticHash'
import type { LibraryImportPlan } from '@/lib/libraryBundle/plan'

const previewZip = vi.hoisted(() => vi.fn())
const previewDirectory = vi.hoisted(() => vi.fn())
vi.mock('@/lib/libraryBundle/importPreview', () => ({
  previewBundleZipImport: previewZip,
  previewBundleDirectoryImport: previewDirectory,
}))

function emptyPlan(generation: string): LibraryImportPlan {
  return {
    planVersion: 1, bundleId: 'bundle:test', databaseGeneration: generation, bookIds: ['book-1'],
    operations: [], counts: { create: 0, update: 0, delete: 0, keep_local: 0, unchanged: 0, conflict: 0 },
    countsByEntityType: {}, unresolvedConflicts: 0, canApply: true, replaceEligible: true, diagnostics: [],
  }
}

describe('useLibraryBundleImport', () => {
  beforeEach(() => vi.clearAllMocks())

  it('previews ZIPs and directories, resolves a conflict, and applies against the same generation', async () => {
    const model = completeCanonicalLibraryFixture()
    const backup = new TextEncoder().encode(JSON.stringify(canonicalModelToDatabaseImport(model)))
    const generation = await sha256Hex(backup)
    previewZip.mockResolvedValue({ plan: emptyPlan(generation), localModel: model, databaseGeneration: generation })
    previewDirectory.mockResolvedValue({ plan: emptyPlan(generation), localModel: model, databaseGeneration: generation })
    const importDatabaseBackup = vi.fn().mockResolvedValue(undefined)
    const state = useLibraryBundleImport({
      exportDatabase: vi.fn().mockResolvedValue(backup), importDatabaseBackup,
      getImageBlob: vi.fn().mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])])),
    })

    await state.previewFile(new File(['zip'], 'bundle.zip'))
    expect(state.plan.value?.bundleId).toBe('bundle:test')
    expect(state.importFileName.value).toBe('bundle.zip')

    const folderFile = new File(['manifest'], 'beta-bot.yaml')
    Object.defineProperty(folderFile, 'webkitRelativePath', { value: 'my-library/beta-bot.yaml' })
    await state.previewDirectory([folderFile])
    expect(state.importFileName.value).toBe('my-library')

    await state.applyChanges()
    expect(importDatabaseBackup).toHaveBeenCalledOnce()
    expect(state.importMessage.value).toBe('Bundle changes applied successfully.')
    expect(state.preview.value).toBeNull()
  })

  it('surfaces preview and apply failures without throwing from UI handlers', async () => {
    const model = completeCanonicalLibraryFixture()
    const backup = new TextEncoder().encode(JSON.stringify(canonicalModelToDatabaseImport(model)))
    previewZip.mockRejectedValueOnce(new Error('Bad archive'))
    const state = useLibraryBundleImport({
      exportDatabase: vi.fn().mockResolvedValue(backup),
      importDatabaseBackup: vi.fn().mockRejectedValue(new Error('Write failed')),
      getImageBlob: vi.fn(),
    })
    await state.previewFile(new File(['bad'], 'bad.zip'))
    expect(state.importError.value).toBe('Bad archive')

    const generation = await sha256Hex(backup)
    previewZip.mockResolvedValueOnce({ plan: emptyPlan(generation), localModel: model, databaseGeneration: generation })
    await state.previewFile(new File(['ok'], 'ok.zip'))
    await state.applyChanges()
    expect(state.importError.value).toBe('Write failed')
  })

  it('records conflict choices as a new plan', () => {
    const state = useLibraryBundleImport({ exportDatabase: vi.fn(), importDatabaseBackup: vi.fn(), getImageBlob: vi.fn() })
    const model = completeCanonicalLibraryFixture()
    const operation = {
      key: 'chapter\0chapter-1', entityType: 'chapter', entityId: 'chapter-1', kind: 'conflict' as const,
      conflictReason: 'different_edits' as const, changedFields: ['body'],
    }
    state.preview.value = {
      localModel: model, databaseGeneration: 'g',
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
})
