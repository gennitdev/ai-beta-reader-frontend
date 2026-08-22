import { describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { completeDatabaseExportFixture } from '@/__tests__/fixtures/libraryBundle'
import { createFullLibraryBundleExport, createSelectedBooksBundleExport } from '@/lib/libraryBundle/export'

describe('createFullLibraryBundleExport', () => {
  it('uses the existing named JSON backup as the complete database snapshot boundary', async () => {
    const backup = new TextEncoder().encode(JSON.stringify(completeDatabaseExportFixture()))
    const result = await createFullLibraryBundleExport(backup, {
      bundleId: 'bundle:export-test', exportedAt: '2026-08-20T16:00:00.000Z',
      appVersion: 'test', readAssetBytes: async () => new Uint8Array([1, 2, 3]),
    })
    const zip = await JSZip.loadAsync(result.zipBytes)

    expect(result.model.books).toHaveLength(1)
    expect(result.model.chapter_revisions).toHaveLength(1)
    expect(result.model.wiki_review_state).toHaveLength(1)
    expect(zip.file('beta-bot.yaml')).not.toBeNull()
    expect(zip.file('_beta-bot/history/chapter-revisions.jsonl')).not.toBeNull()
    expect(zip.file('books/a-book--book-1/assets/image-1/cover.png')).not.toBeNull()
  })

  it('exports one or multiple exact book IDs through the canonical writer', async () => {
    const database = completeDatabaseExportFixture()
    database.books.push({
      ...(database.books[0] as Record<string, unknown>),
      id: 'book-2', title: 'A Book', chapter_order: '[]', part_order: '[]', cover_image_id: null,
    })
    database.image_assets.push({
      ...(database.image_assets[0] as Record<string, unknown>),
      id: 'image-2', book_id: 'book-2', chapter_id: null, file_name: 'second.png',
    })
    database.custom_reviewer_profiles.push({
      ...(database.custom_reviewer_profiles[0] as Record<string, unknown>),
      id: 2, stable_id: 'profile:unused', name: 'Unused profile',
    })
    const backup = new TextEncoder().encode(JSON.stringify(database))
    const options = {
      bundleId: 'bundle:selection-test', exportedAt: '2026-08-20T16:00:00.000Z',
      appVersion: 'test', readAssetBytes: async () => new Uint8Array([1, 2, 3]),
    }

    const one = await createSelectedBooksBundleExport(backup, ['book-1'], options)
    expect(one.model).toMatchObject({ bundle_kind: 'selection', book_ids: ['book-1'] })
    expect(one.model.books.map((book) => book.id)).toEqual(['book-1'])
    expect(one.model.profiles.map((profile) => profile.id)).toEqual(['profile:test'])
    expect(one.model.assets.map((asset) => asset.id)).toEqual(['image-1'])

    const readOnlySelectedAssets = vi.fn(async () => new Uint8Array([1, 2, 3]))
    const secondOnly = await createSelectedBooksBundleExport(backup, ['book-2'], {
      ...options, bundleId: 'bundle:second-selection-test', readAssetBytes: readOnlySelectedAssets,
    })
    expect(secondOnly.model.assets.map((asset) => asset.id)).toEqual(['image-2'])
    expect(secondOnly.model.profiles).toEqual([])
    expect(readOnlySelectedAssets).toHaveBeenCalledOnce()
    expect(readOnlySelectedAssets).toHaveBeenCalledWith(expect.objectContaining({ id: 'image-2' }))

    const multiple = await createSelectedBooksBundleExport(backup, ['book-2', 'book-1'], {
      ...options, bundleId: 'bundle:multi-selection-test',
    })
    expect(multiple.model.book_ids).toEqual(['book-1', 'book-2'])
    expect(multiple.model.books.map((book) => [book.id, book.title])).toEqual([
      ['book-1', 'A Book'], ['book-2', 'A Book'],
    ])
    const zip = await JSZip.loadAsync(multiple.zipBytes)
    expect(zip.file('books/a-book--book-1/book.yaml')).not.toBeNull()
    expect(zip.file('books/a-book--book-2/book.yaml')).not.toBeNull()
  })

  it('rejects empty, duplicate, and stale selections before writing a bundle', async () => {
    const backup = new TextEncoder().encode(JSON.stringify(completeDatabaseExportFixture()))
    const options = {
      bundleId: 'bundle:invalid-selection', exportedAt: '2026-08-20T16:00:00.000Z',
      appVersion: 'test', readAssetBytes: async () => new Uint8Array([1, 2, 3]),
    }
    await expect(createSelectedBooksBundleExport(backup, [], options)).rejects.toThrow(/at least one book/)
    await expect(createSelectedBooksBundleExport(backup, ['book-1', 'book-1'], options)).rejects.toThrow(/duplicates/)
    await expect(createSelectedBooksBundleExport(backup, ['deleted-book'], options)).rejects.toThrow(/no longer available/)
  })
})
