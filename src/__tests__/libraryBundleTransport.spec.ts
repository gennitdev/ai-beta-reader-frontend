import { describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { isIgnoredWorkspacePath, readBundleDirectoryEntries, readBundleDirectoryFiles } from '@/lib/libraryBundle/adapters/directory'
import { readBundleZip, readZipCentralDirectory } from '@/lib/libraryBundle/adapters/zip'
import { normalizedPortablePath, validateEntryMetadata } from '@/lib/libraryBundle/limits'

describe('untrusted bundle transports', () => {
  function zipOffsets(bytes: Uint8Array) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    let end = bytes.length - 22
    while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--
    const central = view.getUint32(end + 16, true)
    return {
      view, end, central, size: view.getUint32(end + 12, true),
      local: view.getUint32(central + 42, true),
    }
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
    const arrayBuffer = vi.spyOn(file, 'arrayBuffer')
    const result = await readBundleDirectoryFiles([file])
    expect(result.files).toBeNull()
    expect(result.diagnostics[0].code).toBe('path.unsafe')
    expect(arrayBuffer).not.toHaveBeenCalled()
  })

  it('does not materialize source-control and operating-system metadata', async () => {
    const manifest = new File(['manifest'], 'beta-bot.yaml')
    Object.defineProperty(manifest, 'webkitRelativePath', { value: 'library/beta-bot.yaml' })
    const gitObject = new File(['large repository object'], 'object')
    Object.defineProperty(gitObject, 'webkitRelativePath', { value: 'library/books/story/.git/objects/object' })
    const finderMetadata = new File(['metadata'], '.DS_Store')
    Object.defineProperty(finderMetadata, 'webkitRelativePath', { value: 'library/books/.DS_Store' })
    const gitRead = vi.spyOn(gitObject, 'arrayBuffer')
    const metadataRead = vi.spyOn(finderMetadata, 'arrayBuffer')

    const result = await readBundleDirectoryFiles([manifest, gitObject, finderMetadata])

    expect(result.files?.has('beta-bot.yaml')).toBe(true)
    expect(result.files?.size).toBe(1)
    expect(gitRead).not.toHaveBeenCalled()
    expect(metadataRead).not.toHaveBeenCalled()
    expect(isIgnoredWorkspacePath('books/story/.git/objects/one')).toBe(true)
    expect(isIgnoredWorkspacePath('books/story/chapter.md')).toBe(false)
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

  it('accepts a canonical bundle wrapped in a single repository ZIP folder', async () => {
    const wrapped = await new JSZip()
      .file('example-story-jack-main/beta-bot.yaml', 'format: test')
      .file('example-story-jack-main/README.md', 'Example story')
      .generateAsync({ type: 'uint8array' })
    const result = await readBundleZip(wrapped)

    expect(result.files?.has('beta-bot.yaml')).toBe(true)
    expect(result.files?.has('README.md')).toBe(true)
    expect(result.files?.has('example-story-jack-main/beta-bot.yaml')).toBe(false)
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

  it('cross-checks local headers and data descriptors before inflation', async () => {
    const zip = await new JSZip().file('entry.txt', 'repeated-content-'.repeat(64)).generateAsync({
      type: 'uint8array', compression: 'DEFLATE',
    })
    const cases = [
      patched(zip, (view, { central }) => view.setUint32(central + 42, central, true)),
      patched(zip, (view, { local }) => view.setUint16(local + 6, view.getUint16(local + 6, true) ^ 1, true)),
      patched(zip, (view, { local }) => view.setUint32(local + 14, view.getUint32(local + 14, true) ^ 1, true)),
      patched(zip, (view, { central }) => view.setUint32(central + 20, central, true)),
    ]
    cases.forEach((value) => expect(() => readZipCentralDirectory(value)).toThrow(/local/))

    const descriptorZip = await new JSZip().file('entry.txt', 'repeated-content-'.repeat(64)).generateAsync({
      type: 'uint8array', compression: 'DEFLATE', streamFiles: true,
    })
    expect(readZipCentralDirectory(descriptorZip)).toHaveLength(1)
    const badLocalDescriptor = patched(descriptorZip, (view, { local }) => view.setUint32(local + 14, 1, true))
    expect(() => readZipCentralDirectory(badLocalDescriptor)).toThrow(/sizes/)
    const badDescriptor = patched(descriptorZip, (view, { central, local }) => {
      const nameLength = view.getUint16(local + 26, true)
      const extraLength = view.getUint16(local + 28, true)
      const compressedBytes = view.getUint32(central + 20, true)
      let descriptor = local + 30 + nameLength + extraLength + compressedBytes
      if (view.getUint32(descriptor, true) === 0x08074b50) descriptor += 4
      view.setUint32(descriptor, view.getUint32(descriptor, true) ^ 1, true)
    })
    expect(() => readZipCentralDirectory(badDescriptor)).toThrow(/data descriptor/)
  })

  it('reports compressed payload corruption after metadata validation', async () => {
    const zip = await new JSZip().file('entry.txt', 'repeated-content-'.repeat(64)).generateAsync({
      type: 'uint8array', compression: 'DEFLATE',
    })
    const corrupt = patched(zip, (view, { local }) => {
      const data = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
      view.setUint8(data, view.getUint8(data) ^ 0xff)
    })
    const result = await readBundleZip(corrupt)
    expect(result.files).toBeNull()
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'zip.read_failed')).toBe(true)
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
