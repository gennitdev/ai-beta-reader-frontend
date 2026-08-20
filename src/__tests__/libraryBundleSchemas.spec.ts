import { describe, expect, it } from 'vitest'
import { canonicalLibraryModelSchema } from '@/lib/libraryBundle/schemas'
import { completeCanonicalLibraryFixture } from './fixtures/libraryBundle'

describe('canonicalLibraryModelSchema', () => {
  it('accepts a complete logical library covering every entity type', () => {
    const fixture = completeCanonicalLibraryFixture()
    expect(canonicalLibraryModelSchema.parse(fixture)).toEqual(fixture)
  })

  it('rejects unknown fields so format changes must be deliberate', () => {
    const fixture = completeCanonicalLibraryFixture() as unknown as Record<string, unknown>
    fixture.unversioned_extension = true

    expect(canonicalLibraryModelSchema.safeParse(fixture).success).toBe(false)
  })

  it('rejects timestamps that are not canonical UTC milliseconds', () => {
    const fixture = completeCanonicalLibraryFixture()
    fixture.books[0].updated_at = '2026-08-20 15:00:00'

    expect(canonicalLibraryModelSchema.safeParse(fixture).success).toBe(false)
  })

  it('requires binary asset integrity metadata', () => {
    const fixture = completeCanonicalLibraryFixture()
    fixture.assets[0].sha256 = 'not-a-hash'

    expect(canonicalLibraryModelSchema.safeParse(fixture).success).toBe(false)
  })
})
