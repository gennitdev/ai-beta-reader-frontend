import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { completeDatabaseExportFixture } from '@/__tests__/fixtures/libraryBundle'
import { createFullLibraryBundleExport, createTextOnlyLibraryBundleExport } from '@/lib/libraryBundle/export'
import { readLibraryBundle } from '@/lib/libraryBundle/read'
import { validateLibraryBundle } from '@/lib/libraryBundle/validate'

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

  it('exports a standalone-valid text-only workspace with truthful omissions', async () => {
    const database = completeDatabaseExportFixture()
    database.image_assets[0] = {
      ...(database.image_assets[0] as Record<string, unknown>),
      content_hash: '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
      content_hash_algorithm: 'sha256', content_byte_length: 3,
    }
    const result = await createTextOnlyLibraryBundleExport(
      new TextEncoder().encode(JSON.stringify(database)),
      { bundleId: 'bundle:text', exportedAt: '2026-08-20T16:00:00.000Z', appVersion: 'test' },
    )
    const validated = await validateLibraryBundle(readLibraryBundle(result.files), result.files)

    expect(validated.diagnostics.filter((value) => value.severity === 'error')).toEqual([])
    expect(validated.replaceEligible).toBe(false)
    expect(result.model.includes).toEqual({ image_bytes: false, history: false, audit_records: false })
    expect([...result.files.keys()]).not.toContain('books/a-book--book-1/assets/image-1/cover.png')
    expect([...result.files.keys()].some((path) => path.startsWith('_beta-bot/history/'))).toBe(false)
    expect([...result.files.keys()].some((path) => path.endsWith('/asset.yaml'))).toBe(true)
  })
})
