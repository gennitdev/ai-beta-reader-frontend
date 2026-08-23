import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { completeCanonicalLibraryFixture } from './fixtures/libraryBundle'
import { canonicalModelToDatabaseImport, applyImportPlanToModel } from '@/lib/libraryBundle/apply'
import { previewBundleZipImport } from '@/lib/libraryBundle/importPreview'
import { sha256Hex } from '@/lib/libraryBundle/semanticHash'

function emptyLocalLibrary() {
  const model = completeCanonicalLibraryFixture()
  model.book_ids = []
  for (const key of [
    'books', 'parts', 'chapters', 'chapter_notes', 'chapter_summaries', 'part_summaries',
    'reviews', 'wiki_pages', 'book_characters', 'profiles', 'assets', 'chapter_revisions',
    'chapter_activity', 'wiki_updates', 'wiki_review_state',
  ] as const) model[key] = []
  return model
}

describe('book-list bundle import', () => {
  it('previews and imports the complete Jack fixture as a writable local book', async () => {
    const bundlePath = fileURLToPath(new URL('../demo/stories/jack-and-the-beanstalk.zip', import.meta.url))
    const bundleBytes = new Uint8Array(await readFile(bundlePath))
    const localModel = emptyLocalLibrary()
    const backup = new TextEncoder().encode(JSON.stringify(canonicalModelToDatabaseImport(localModel)))
    const preview = await previewBundleZipImport(bundleBytes, backup, {
      intent: 'add-or-update-books',
    })

    expect(preview.plan.canApply).toBe(true)
    expect(preview.plan.operations.find((operation) => operation.entityType === 'book')).toEqual(
      expect.objectContaining({ entityId: 'jack-house-above-rain', kind: 'create' }),
    )
    expect(preview.plan.countsByEntityType.asset.create).toBe(18)

    const imported = applyImportPlanToModel(
      preview.plan,
      preview.localModel,
      preview.incomingModel,
      await sha256Hex(backup),
    )
    expect(imported.books[0].title).toBe('Jack and the Beanstalk')
    expect(imported.parts).toHaveLength(3)
    expect(imported.chapters).toHaveLength(7)
    expect(imported.wiki_pages.length).toBeGreaterThan(10)
    expect(imported.assets).toHaveLength(18)
    expect(imported.assets.every((asset) => asset.bytes?.byteLength)).toBe(true)
  })
})
