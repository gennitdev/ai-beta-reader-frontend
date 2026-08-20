import { describe, expect, it } from 'vitest'
import { completeCanonicalLibraryFixture } from '@/__tests__/fixtures/libraryBundle'
import { sortedBundlePaths } from '@/lib/libraryBundle/fileMap'
import { createBundleZip, readBundleZipForTest } from '@/lib/libraryBundle/adapters/zip'
import { writeLibraryBundle } from '@/lib/libraryBundle/write'

describe('canonical bundle ZIP adapter', () => {
  it('round-trips every file byte-for-byte and emits deterministic ZIP bytes', async () => {
    const written = await writeLibraryBundle(completeCanonicalLibraryFixture(), {
      bundleId: 'bundle:zip-test', exportedAt: '2026-08-20T16:00:00.000Z', appVersion: 'test',
    })
    const first = await createBundleZip(written.files)
    const second = await createBundleZip(written.files)
    const restored = await readBundleZipForTest(first)

    expect(second).toEqual(first)
    expect(sortedBundlePaths(restored)).toEqual(sortedBundlePaths(written.files))
    for (const path of sortedBundlePaths(written.files)) {
      expect(restored.get(path)).toEqual(written.files.get(path))
    }
  })
})
