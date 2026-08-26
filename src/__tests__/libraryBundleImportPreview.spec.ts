import { describe, expect, it, vi } from 'vitest'
import { completeCanonicalLibraryFixture, completeDatabaseExportFixture } from './fixtures/libraryBundle'
import { writeLibraryBundle } from '@/lib/libraryBundle/write'
import { createBundleZip } from '@/lib/libraryBundle/adapters/zip'
import { previewBundleDirectoryImport, previewBundleZipImport } from '@/lib/libraryBundle/importPreview'

describe('bundle import preview orchestration', () => {
  it('reads, validates, snapshots local data, and creates one immutable plan', async () => {
    const model = completeCanonicalLibraryFixture()
    const written = await writeLibraryBundle(model, {
      bundleId: 'bundle:test', exportedAt: '2026-08-20T15:00:00.000Z', appVersion: '1.0.0',
    })
    const zip = await createBundleZip(written.files)
    const backup = new TextEncoder().encode(JSON.stringify(completeDatabaseExportFixture()))
    const preview = await previewBundleZipImport(zip, backup, {
      readLocalAssetBytes: async () => new Uint8Array([1, 2, 3]),
    })
    expect(preview.plan.bundleId).toBe('bundle:test')
    expect(preview.plan.counts.conflict).toBe(0)
    expect(preview.databaseGeneration).toMatch(/^[a-f0-9]{64}$/)
    expect(preview.exportedAt).toBe('2026-08-20T15:00:00.000Z')
    expect(Object.isFrozen(preview.plan)).toBe(true)
  })

  it('can compare local asset integrity without retaining local image bytes', async () => {
    const model = completeCanonicalLibraryFixture()
    const written = await writeLibraryBundle(model, {
      bundleId: 'bundle:metadata-preview', exportedAt: '2026-08-20T15:00:00.000Z', appVersion: '1.0.0',
    })
    const database = completeDatabaseExportFixture()
    database.image_assets[0] = {
      ...(database.image_assets[0] as Record<string, unknown>),
      content_hash: model.assets[0].sha256,
      content_hash_algorithm: 'sha256-v1',
      content_byte_length: model.assets[0].byte_length,
    }
    const backup = new TextEncoder().encode(JSON.stringify(database))
    const readLocalAssetBytes = vi.fn(async () => new Uint8Array([1, 2, 3]))
    const preview = await previewBundleDirectoryImport(
      [...written.files].map(([path, bytes]) => {
        const file = new File([bytes.slice().buffer], path.split('/').at(-1)!)
        Object.defineProperty(file, 'webkitRelativePath', { value: `chosen/${path}` })
        return file
      }),
      backup,
      {
        readLocalAssetBytes,
        retainLocalAssetBytes: false,
      },
    )

    expect(preview.localModel.assets).toHaveLength(1)
    expect(preview.localModel.assets[0].bytes).toBeNull()
    expect(preview.localModel.assets[0].sha256).toBe(model.assets[0].sha256)
    expect(readLocalAssetBytes).not.toHaveBeenCalled()
  })

  it('rejects invalid ZIP input before parsing database data', async () => {
    await expect(previewBundleZipImport(new Uint8Array([1]), new Uint8Array([2])))
      .rejects.toThrow('Invalid ZIP')
  })

  it('previews the same canonical tree from a selected directory', async () => {
    const written = await writeLibraryBundle(completeCanonicalLibraryFixture(), {
      bundleId: 'bundle:directory', exportedAt: '2026-08-20T15:00:00.000Z', appVersion: '1.0.0',
    })
    const selected = [...written.files].map(([path, bytes]) => {
      const file = new File([bytes.slice().buffer], path.split('/').at(-1)!)
      Object.defineProperty(file, 'webkitRelativePath', { value: `chosen/${path}` })
      return file
    })
    const backup = new TextEncoder().encode(JSON.stringify(completeDatabaseExportFixture()))
    const preview = await previewBundleDirectoryImport(selected, backup, {
      readLocalAssetBytes: async () => new Uint8Array([1, 2, 3]),
    })
    expect(preview.plan.bundleId).toBe('bundle:directory')
  })

  it('rejects unsafe directory selections before parsing', async () => {
    const unsafe = new File(['x'], '../escape')
    await expect(previewBundleDirectoryImport([unsafe], new Uint8Array()))
      .rejects.toThrow('Path must be relative')
  })
})
