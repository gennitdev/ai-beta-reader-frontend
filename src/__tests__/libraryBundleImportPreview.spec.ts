import { describe, expect, it } from 'vitest'
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
    expect(Object.isFrozen(preview.plan)).toBe(true)
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
