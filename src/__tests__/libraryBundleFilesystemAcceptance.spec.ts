import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { readBundleZip, createBundleZip } from '@/lib/libraryBundle/adapters/zip'
import type { BundleFileMap } from '@/lib/libraryBundle/fileMap'
import { writeLibraryBundle } from '@/lib/libraryBundle/write'
import { completeCanonicalLibraryFixture } from './fixtures/libraryBundle'

const roots: string[] = []

async function materialize(root: string, files: BundleFileMap): Promise<void> {
  for (const [path, bytes] of files) {
    const target = join(root, ...path.split('/'))
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, bytes)
  }
}

describe('bundle acceptance on the host filesystem', () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  })

  it('materializes duplicate Unicode titles distinctly through directory and ZIP transports', async () => {
    const model = completeCanonicalLibraryFixture()
    for (const key of [
      'books', 'parts', 'chapters', 'chapter_notes', 'chapter_summaries', 'part_summaries',
      'reviews', 'wiki_pages', 'book_characters', 'profiles', 'assets', 'chapter_revisions',
      'chapter_activity', 'wiki_updates', 'wiki_review_state',
    ] as const) model[key] = []
    model.book_ids = ['book-cafe-one', 'book-cafe-two']
    model.books = [
      { id: 'book-cafe-one', title: 'Café', chapter_order: [], part_order: [], cover_image_id: null, created_at: '2026-08-20T15:00:00.000Z', updated_at: '2026-08-20T15:00:00.000Z' },
      { id: 'book-cafe-two', title: 'CAFE\u0301', chapter_order: [], part_order: [], cover_image_id: null, created_at: '2026-08-20T15:00:00.000Z', updated_at: '2026-08-20T15:00:00.000Z' },
    ]
    const written = await writeLibraryBundle(model, {
      bundleId: 'bundle:filesystem-acceptance',
      exportedAt: '2026-08-20T15:00:00.000Z',
      appVersion: '1.0.0',
    })
    const bookPaths = [...written.files.keys()].filter((path) => path.endsWith('/book.yaml')).sort()
    expect(bookPaths).toEqual([
      'books/cafe--ook-cafe-one/book.yaml',
      'books/cafe--ook-cafe-two/book.yaml',
    ])

    const directoryRoot = await mkdtemp(join(tmpdir(), 'beta-bot-directory-'))
    roots.push(directoryRoot)
    await materialize(directoryRoot, written.files)
    for (const path of bookPaths) {
      expect(new Uint8Array(await readFile(join(directoryRoot, ...path.split('/'))))).toEqual(written.files.get(path))
    }

    const zip = await readBundleZip(await createBundleZip(written.files))
    expect(zip.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([])
    expect(zip.files).not.toBeNull()
    const zipRoot = await mkdtemp(join(tmpdir(), 'beta-bot-zip-'))
    roots.push(zipRoot)
    await materialize(zipRoot, zip.files as BundleFileMap)
    for (const path of bookPaths) {
      expect(new Uint8Array(await readFile(join(zipRoot, ...path.split('/'))))).toEqual(written.files.get(path))
    }
  })
})
