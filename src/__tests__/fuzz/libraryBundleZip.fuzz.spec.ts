import { beforeAll, describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import JSZip from 'jszip'

import { readBundleZip, readZipCentralDirectory } from '@/lib/libraryBundle/adapters/zip'
import { checkAsyncFuzzProperty, checkFuzzProperty } from './fuzzHarness'

interface ZipOffsets {
  end: number
  central: number
  centralSize: number
  local: number
}

function zipOffsets(bytes: Uint8Array): ZipOffsets {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = bytes.length - 22
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--
  const central = view.getUint32(end + 16, true)
  return {
    end,
    central,
    centralSize: view.getUint32(end + 12, true),
    local: view.getUint32(central + 42, true),
  }
}

function patched(bytes: Uint8Array, patch: (view: DataView, offsets: ZipOffsets) => void): Uint8Array {
  const copy = bytes.slice()
  patch(new DataView(copy.buffer, copy.byteOffset, copy.byteLength), zipOffsets(copy))
  return copy
}

function duplicateCentralRecord(bytes: Uint8Array, copies: number): Uint8Array {
  const { end, central, centralSize } = zipOffsets(bytes)
  const duplicate = new Uint8Array(bytes.length + centralSize * (copies - 1))
  duplicate.set(bytes.subarray(0, end), 0)
  for (let index = 1; index < copies; index++) {
    duplicate.set(bytes.subarray(central, central + centralSize), end + centralSize * (index - 1))
  }
  const duplicateEnd = end + centralSize * (copies - 1)
  duplicate.set(bytes.subarray(end), duplicateEnd)
  const view = new DataView(duplicate.buffer)
  view.setUint16(duplicateEnd + 8, copies, true)
  view.setUint16(duplicateEnd + 10, copies, true)
  view.setUint32(duplicateEnd + 12, centralSize * copies, true)
  return duplicate
}

describe('hostile ZIP metadata fuzz boundaries', () => {
  let baseline: Uint8Array
  let descriptorBaseline: Uint8Array
  let offsets: ZipOffsets

  beforeAll(async () => {
    baseline = await new JSZip().file('entry.txt', 'repeated-content-'.repeat(64)).generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
    })
    descriptorBaseline = await new JSZip().file('entry.txt', 'repeated-content-'.repeat(64)).generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      streamFiles: true,
    })
    offsets = zipOffsets(baseline)
    expect(readZipCentralDirectory(descriptorBaseline)).toHaveLength(1)
  })

  it('rejects generated central-directory size declarations that disagree with local headers', () => {
    checkFuzzProperty('zip-declared-size-mismatch', fc.property(
      fc.constantFrom('compressed', 'uncompressed'),
      fc.boolean(),
      fc.integer({ min: 1, max: 65_535 }),
      (field, usesDataDescriptor, delta) => {
        const source = usesDataDescriptor ? descriptorBaseline : baseline
        const fieldOffset = field === 'compressed' ? 20 : 24
        const current = zipOffsets(source)
        const sourceView = new DataView(source.buffer, source.byteOffset, source.byteLength)
        const actual = sourceView.getUint32(current.central + fieldOffset, true)
        const forged = patched(source, (view, currentOffsets) => {
          view.setUint32(currentOffsets.central + fieldOffset, actual + delta, true)
        })
        expect(() => readZipCentralDirectory(forged)).toThrow(/local|outside|descriptor/)
      },
    ))
  })

  it('rejects generated central-directory pointers that do not identify the local header', () => {
    checkFuzzProperty('zip-local-header-pointer', fc.property(
      fc.integer({ min: 0, max: 1_024 }),
      (delta) => {
        const forged = patched(baseline, (view, current) => {
          view.setUint32(current.central + 42, offsets.central + delta, true)
        })
        expect(() => readZipCentralDirectory(forged)).toThrow(/local file header/)
      },
    ))
  })

  it('rejects generated exact duplicate central-directory records before inflation', async () => {
    await checkAsyncFuzzProperty('zip-duplicate-central-records', fc.asyncProperty(
      fc.integer({ min: 2, max: 32 }),
      async (copies) => {
        const result = await readBundleZip(duplicateCentralRecord(baseline, copies))
        expect(result.files).toBeNull()
        expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'path.collision')).toBe(true)
      },
    ))
  })

  it('turns arbitrary bounded ZIP bytes into diagnostics without throwing', async () => {
    await checkAsyncFuzzProperty('zip-reader-totality', fc.asyncProperty(
      fc.uint8Array({ maxLength: 4_096 }),
      async (bytes) => {
        const result = await readBundleZip(bytes)
        expect(result.files === null || result.files instanceof Map).toBe(true)
      },
    ))
  })
})
