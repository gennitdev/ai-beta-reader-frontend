import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { readBundleDirectoryEntries, readBundleDirectoryFiles } from '@/lib/libraryBundle/adapters/directory'
import { readBundleZip, readZipCentralDirectory } from '@/lib/libraryBundle/adapters/zip'
import { normalizedPortablePath, validateEntryMetadata } from '@/lib/libraryBundle/limits'

describe('untrusted bundle transports', () => {
  function zipOffsets(bytes: Uint8Array) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    let end = bytes.length - 22
    while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--
    return { view, end, central: view.getUint32(end + 16, true), size: view.getUint32(end + 12, true) }
  }

  function patched(bytes: Uint8Array, patch: (view: DataView, offsets: ReturnType<typeof zipOffsets>) => void) {
    const copy = bytes.slice()
    const offsets = zipOffsets(copy)
    patch(offsets.view, offsets)
    return copy
  }

  it('reads directory entries and browser File selections with parity', async () => {
    const entries = [{ path: 'beta-bot.yaml', bytes: new Uint8Array([1, 2]) }]
    expect(readBundleDirectoryEntries(entries).files?.get('beta-bot.yaml')).toEqual(entries[0].bytes)
    const file = new File([new Uint8Array([1, 2])], 'beta-bot.yaml')
    expect((await readBundleDirectoryFiles([file])).files?.get('beta-bot.yaml')).toEqual(entries[0].bytes)

    const nested = new File(['manifest'], 'beta-bot.yaml')
    Object.defineProperty(nested, 'webkitRelativePath', { value: 'selected-folder/beta-bot.yaml' })
    expect((await readBundleDirectoryFiles([nested])).files?.has('beta-bot.yaml')).toBe(true)
    expect((await readBundleDirectoryFiles([])).files?.size).toBe(0)
  })

  it('does not materialize directory bytes when metadata validation fails', async () => {
    const file = new File(['too large'], '../unsafe')
    const result = await readBundleDirectoryFiles([file])
    expect(result.files).toBeNull()
    expect(result.diagnostics[0].code).toBe('path.unsafe')
  })

  it.each(['', '/root', '../escape', 'a/../b', 'a//b', 'C:/drive', 'a\\b', 'a\0b'])('rejects unsafe path %j', (path) => {
    expect(normalizedPortablePath(path)).toBeNull()
  })

  it('reports file count, total size, individual size, path length, ratio, symlink, and normalized collisions', () => {
    const diagnostics = validateEntryMetadata([
      { path: 'A'.repeat(20), uncompressedBytes: 20, compressedBytes: 1, isSymlink: true },
      { path: 'é.txt', uncompressedBytes: 20 },
      { path: 'É.TXT', uncompressedBytes: 20 },
    ], { maxFiles: 2, maxTotalBytes: 10, maxNonImageBytes: 5, maxPathBytes: 5, maxCompressionRatio: 2 })
    expect(diagnostics.map((value) => value.code)).toEqual(expect.arrayContaining([
      'limit.file_count', 'limit.total_size', 'limit.file_size', 'limit.path_length',
      'limit.compression_ratio', 'path.symlink', 'path.collision',
    ]))
  })

  it('reads valid ZIPs and rejects invalid, traversal, and high-ratio ZIPs', async () => {
    const valid = new JSZip().file('beta-bot.yaml', 'format: test').generateAsync({ type: 'uint8array' })
    expect((await readBundleZip(await valid)).files?.has('beta-bot.yaml')).toBe(true)
    expect((await readBundleZip(new Uint8Array([1, 2, 3]))).diagnostics[0].code).toBe('zip.invalid')

    const unsafe = await new JSZip().file('../escape.txt', 'x').generateAsync({ type: 'uint8array' })
    expect((await readBundleZip(unsafe)).diagnostics.some((value) => value.code === 'path.unsafe')).toBe(true)

    const compressed = await new JSZip().file('large.txt', 'x'.repeat(10_000)).generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
    expect((await readBundleZip(compressed, { maxFiles: 10, maxTotalBytes: 20_000, maxNonImageBytes: 20_000, maxPathBytes: 100, maxCompressionRatio: 2 })).diagnostics.some((value) => value.code === 'limit.compression_ratio')).toBe(true)
  })

  it('reads central-directory metadata before inflation and detects exact duplicate names', async () => {
    const original = await new JSZip().file('same.txt', 'hello').generateAsync({ type: 'uint8array' })
    const { end, central, size } = zipOffsets(original)
    const duplicate = new Uint8Array(original.length + size)
    duplicate.set(original.subarray(0, end), 0)
    duplicate.set(original.subarray(central, central + size), end)
    duplicate.set(original.subarray(end), end + size)
    const duplicateEnd = end + size
    const view = new DataView(duplicate.buffer)
    view.setUint16(duplicateEnd + 8, 2, true)
    view.setUint16(duplicateEnd + 10, 2, true)
    view.setUint32(duplicateEnd + 12, size * 2, true)
    expect((await readBundleZip(duplicate)).diagnostics.some((value) => value.code === 'path.collision')).toBe(true)
  })

  it('rejects malformed, multi-disk, ZIP64, out-of-bounds, truncated, and symlink metadata', async () => {
    const zip = await new JSZip().file('entry.txt', 'hello').generateAsync({ type: 'uint8array' })
    const cases = [
      patched(zip, (view, { end }) => view.setUint16(end + 4, 1, true)),
      patched(zip, (view, { end }) => view.setUint16(end + 10, 0xffff, true)),
      patched(zip, (view, { end }) => view.setUint32(end + 16, 0xffffff00, true)),
      patched(zip, (view, { central }) => view.setUint32(central, 0, true)),
      patched(zip, (view, { central }) => view.setUint16(central + 28, 0xffff, true)),
      patched(zip, (view, { end, size }) => view.setUint32(end + 12, size + 1, true)),
    ]
    cases.forEach((value) => expect(() => readZipCentralDirectory(value)).toThrow())

    const symlink = patched(zip, (view, { central }) => view.setUint32(central + 38, 0o120777 << 16, true))
    expect((await readBundleZip(symlink)).diagnostics.some((value) => value.code === 'path.symlink')).toBe(true)
  })

  it('decodes UTF-8 entry names and ignores directory records for file limits', async () => {
    const archive = new JSZip()
    archive.folder('folder')
    archive.file('folder/é.txt', 'x')
    const zip = await archive.generateAsync({ type: 'uint8array' })
    const metadata = readZipCentralDirectory(zip)
    expect(metadata.some((value) => value.path.endsWith('é.txt'))).toBe(true)
    expect(metadata.some((value) => value.isDirectory)).toBe(true)
  })
})
