import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'

import { readBundleDirectoryEntries } from '@/lib/libraryBundle/adapters/directory'
import { normalizedPortablePath, validateEntryMetadata } from '@/lib/libraryBundle/limits'
import { checkFuzzProperty } from './fuzzHarness'

const segment = fc.stringMatching(/^[A-Za-z0-9_-]{1,24}$/)
const portablePath = fc.array(segment, { minLength: 1, maxLength: 8 }).map((segments) => segments.join('/'))

describe('library bundle path and resource-limit fuzz boundaries', () => {
  it('normalizes generated portable paths idempotently', () => {
    checkFuzzProperty('portable-path-idempotence', fc.property(portablePath, (path) => {
      const normalized = normalizedPortablePath(path)
      expect(normalized).not.toBeNull()
      expect(normalizedPortablePath(normalized as string)).toBe(normalized)
    }))
  })

  it('rejects generated traversal, absolute, drive, backslash, and NUL paths', () => {
    const hostilePath = fc.oneof(
      portablePath.map((path) => `../${path}`),
      portablePath.map((path) => `/${path}`),
      portablePath.map((path) => `C:/${path}`),
      portablePath.map((path) => path.replace('/', '\\') + '\\escape'),
      portablePath.map((path) => `${path}/../escape`),
      portablePath.map((path) => `${path}\0escape`),
      portablePath.map((path) => `${path}//escape`),
    )
    checkFuzzProperty('hostile-path-rejection', fc.property(hostilePath, (path) => {
      expect(normalizedPortablePath(path)).toBeNull()
      const result = readBundleDirectoryEntries([{ path, bytes: new Uint8Array([1]) }])
      expect(result.files).toBeNull()
      expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'path.unsafe')).toBe(true)
    }))
  })

  it('detects generated case and Unicode-normalization collisions', () => {
    checkFuzzProperty('normalized-path-collisions', fc.property(segment, (suffix) => {
      const diagnostics = validateEntryMetadata([
        { path: `Books/CAFÉ-${suffix}.md`, uncompressedBytes: 1 },
        { path: `books/cafe\u0301-${suffix.toLowerCase()}.MD`, uncompressedBytes: 1 },
      ])
      expect(diagnostics.some((diagnostic) => diagnostic.code === 'path.collision')).toBe(true)
    }))
  })

  it('rejects generated values immediately beyond every resource threshold', () => {
    checkFuzzProperty('resource-limit-boundaries', fc.property(
      fc.integer({ min: 1, max: 16_384 }),
      (limit) => {
        const limits = {
          maxFiles: 1,
          maxTotalBytes: limit,
          maxNonImageBytes: limit,
          maxPathBytes: limit,
          maxCompressionRatio: limit,
        }
        const diagnostics = validateEntryMetadata([
          { path: 'a.txt', uncompressedBytes: limit + 1, compressedBytes: 1 },
          { path: 'b.txt', uncompressedBytes: 0 },
        ], limits)
        const codes = diagnostics.map((diagnostic) => diagnostic.code)
        expect(codes).toContain('limit.file_count')
        expect(codes).toContain('limit.total_size')
        expect(codes).toContain('limit.file_size')
        expect(codes).toContain('limit.compression_ratio')
      },
    ))
  })
})
