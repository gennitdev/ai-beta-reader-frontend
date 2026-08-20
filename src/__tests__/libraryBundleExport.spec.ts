import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { completeDatabaseExportFixture } from '@/__tests__/fixtures/libraryBundle'
import { createFullLibraryBundleExport } from '@/lib/libraryBundle/export'

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
})
