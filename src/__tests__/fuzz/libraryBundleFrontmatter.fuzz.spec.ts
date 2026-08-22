import { beforeAll, describe, expect, it } from 'vitest'
import * as fc from 'fast-check'

import { encodeBundleText, type BundleFileMap } from '@/lib/libraryBundle/fileMap'
import { readLibraryBundle } from '@/lib/libraryBundle/read'
import { writeLibraryBundle } from '@/lib/libraryBundle/write'
import { completeCanonicalLibraryFixture } from '../fixtures/libraryBundle'
import { checkFuzzProperty } from './fuzzHarness'

const options = {
  bundleId: 'bundle:fuzz',
  exportedAt: '2026-08-20T15:00:00.000Z',
  appVersion: '1.0.0',
}

let baseline: BundleFileMap
let chapterPath: string
let bookPath: string

function copyBaseline(): BundleFileMap {
  return new Map([...baseline].map(([path, bytes]) => [path, bytes.slice()]))
}

describe('library bundle YAML and Markdown fuzz boundaries', () => {
  beforeAll(async () => {
    baseline = (await writeLibraryBundle(completeCanonicalLibraryFixture(), options)).files
    chapterPath = [...baseline.keys()].find((path) => path.endsWith('/chapter.md')) as string
    bookPath = [...baseline.keys()].find((path) => path.endsWith('/book.yaml')) as string
  })

  it('preserves arbitrary Markdown bodies exactly', () => {
    checkFuzzProperty('markdown-body-round-trip', fc.property(
      fc.string({ maxLength: 2_048 }),
      (body) => {
        const files = copyBaseline()
        const original = new TextDecoder().decode(files.get(chapterPath))
        const closing = original.indexOf('\n---\n', 4)
        files.set(chapterPath, encodeBundleText(`${original.slice(0, closing + 5)}${body}`))

        const parsed = readLibraryBundle(files)
        expect(parsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([])
        expect(parsed.model?.chapters[0].body).toBe(body)
      },
    ))
  })

  it('turns arbitrary bounded parser input into a model or diagnostics without throwing', () => {
    checkFuzzProperty('frontmatter-parser-totality', fc.property(
      fc.string({ maxLength: 4_096 }),
      (input) => {
        const files = copyBaseline()
        files.set(chapterPath, encodeBundleText(input))
        expect(() => readLibraryBundle(files)).not.toThrow()
      },
    ))
  })

  it('rejects generated duplicate YAML keys', () => {
    checkFuzzProperty('yaml-duplicate-keys', fc.property(
      fc.string({ maxLength: 128 }),
      fc.string({ maxLength: 128 }),
      (left, right) => {
        const files = copyBaseline()
        files.set(bookPath, encodeBundleText(`id: ${JSON.stringify(left)}\nid: ${JSON.stringify(right)}\n`))
        const parsed = readLibraryBundle(files)
        expect(parsed.model).toBeNull()
        expect(parsed.diagnostics.some((diagnostic) => diagnostic.code === 'yaml.invalid')).toBe(true)
      },
    ))
  })
})
