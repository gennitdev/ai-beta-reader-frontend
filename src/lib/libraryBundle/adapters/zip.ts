import JSZip from 'jszip'
import { sortedBundlePaths, type ReadonlyBundleFileMap } from '../fileMap'
import { bundleError, hasBundleErrors } from '../diagnostics'
import type { BundleEntryMetadata, BundleReadLimits } from '../limits'
import { DEFAULT_BUNDLE_READ_LIMITS, validateEntryMetadata } from '../limits'
import type { BundleFileReadResult } from './directory'

const DETERMINISTIC_ZIP_DATE = new Date('1980-01-01T00:00:00.000Z')

function stripSharedBundleRoot(files: Map<string, Uint8Array>): Map<string, Uint8Array> {
  if (files.has('beta-bot.yaml') || files.size === 0) return files
  const roots = new Set([...files.keys()].map((path) => path.split('/')[0]))
  if (roots.size !== 1) return files
  const root = [...roots][0]
  if (!files.has(`${root}/beta-bot.yaml`)) return files
  return new Map([...files].map(([path, bytes]) => [path.slice(root.length + 1), bytes]))
}

export async function createBundleZip(files: ReadonlyBundleFileMap): Promise<Uint8Array> {
  const zip = new JSZip()
  for (const path of sortedBundlePaths(files)) {
    zip.file(path, files.get(path)!, {
      binary: true,
      createFolders: false,
      date: DETERMINISTIC_ZIP_DATE,
      unixPermissions: 0o100644,
    })
  }

  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    platform: 'UNIX',
  })
}

export async function readBundleZipForTest(zipBytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const zip = await JSZip.loadAsync(zipBytes)
  const files = new Map<string, Uint8Array>()
  const paths = Object.keys(zip.files).filter((path) => !zip.files[path].dir).sort()
  for (const path of paths) files.set(path, await zip.files[path].async('uint8array'))
  return files
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const minimum = Math.max(0, bytes.byteLength - 65_557)
  for (let offset = bytes.byteLength - 22; offset >= minimum; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset
  }
  throw new Error('ZIP end-of-central-directory record is missing.')
}

/** Parse ZIP metadata without inflating content so limits and duplicate paths fail first. */
export function readZipCentralDirectory(zipBytes: Uint8Array): BundleEntryMetadata[] {
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength)
  const endOffset = findEndOfCentralDirectory(zipBytes)
  const disk = view.getUint16(endOffset + 4, true)
  const centralDisk = view.getUint16(endOffset + 6, true)
  const entriesOnDisk = view.getUint16(endOffset + 8, true)
  const entryCount = view.getUint16(endOffset + 10, true)
  const centralSize = view.getUint32(endOffset + 12, true)
  const centralOffset = view.getUint32(endOffset + 16, true)
  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) throw new Error('Multi-disk ZIPs are not supported.')
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) throw new Error('ZIP64 metadata is not supported.')
  if (centralOffset + centralSize > endOffset) throw new Error('ZIP central directory points outside the archive.')

  const entries: BundleEntryMetadata[] = []
  let offset = centralOffset
  for (let index = 0; index < entryCount; index++) {
    if (offset + 46 > endOffset || view.getUint32(offset, true) !== 0x02014b50) throw new Error('ZIP central directory is malformed.')
    const flags = view.getUint16(offset + 8, true)
    const compressedBytes = view.getUint32(offset + 20, true)
    const uncompressedBytes = view.getUint32(offset + 24, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const externalAttributes = view.getUint32(offset + 38, true)
    const localOffset = view.getUint32(offset + 42, true)
    const recordLength = 46 + nameLength + extraLength + commentLength
    if (offset + recordLength > endOffset) throw new Error('ZIP central directory entry is truncated.')
    const nameBytes = zipBytes.subarray(offset + 46, offset + 46 + nameLength)
    if (localOffset + 30 > centralOffset || view.getUint32(localOffset, true) !== 0x04034b50) {
      throw new Error('ZIP central directory points to an invalid local file header.')
    }
    const localFlags = view.getUint16(localOffset + 6, true)
    const localCompression = view.getUint16(localOffset + 8, true)
    const localCrc32 = view.getUint32(localOffset + 14, true)
    const localCompressedBytes = view.getUint32(localOffset + 18, true)
    const localUncompressedBytes = view.getUint32(localOffset + 22, true)
    const localNameLength = view.getUint16(localOffset + 26, true)
    const localExtraLength = view.getUint16(localOffset + 28, true)
    const localNameStart = localOffset + 30
    const localDataStart = localNameStart + localNameLength + localExtraLength
    if (localDataStart > centralOffset || localDataStart + compressedBytes > centralOffset) {
      throw new Error('ZIP local file data points outside the archive.')
    }
    const centralCompression = view.getUint16(offset + 10, true)
    const centralCrc32 = view.getUint32(offset + 16, true)
    const localNameBytes = zipBytes.subarray(localNameStart, localNameStart + localNameLength)
    if (localFlags !== flags || localCompression !== centralCompression
      || localNameLength !== nameLength || !localNameBytes.every((value, index) => value === nameBytes[index])) {
      throw new Error('ZIP local and central directory metadata do not match.')
    }
    const usesDataDescriptor = (flags & 0x0008) !== 0
    if (!usesDataDescriptor && (localCrc32 !== centralCrc32
      || localCompressedBytes !== compressedBytes || localUncompressedBytes !== uncompressedBytes)) {
      throw new Error('ZIP local and central directory sizes do not match.')
    }
    if (usesDataDescriptor) {
      if ((localCrc32 !== 0 && localCrc32 !== centralCrc32)
        || (localCompressedBytes !== 0 && localCompressedBytes !== compressedBytes)
        || (localUncompressedBytes !== 0 && localUncompressedBytes !== uncompressedBytes)) {
        throw new Error('ZIP local and central directory sizes do not match.')
      }
      let descriptorOffset = localDataStart + compressedBytes
      const hasDescriptorSignature = descriptorOffset + 4 <= centralOffset
        && view.getUint32(descriptorOffset, true) === 0x08074b50
      if (hasDescriptorSignature) descriptorOffset += 4
      if (descriptorOffset + 12 > centralOffset
        || view.getUint32(descriptorOffset, true) !== centralCrc32
        || view.getUint32(descriptorOffset + 4, true) !== compressedBytes
        || view.getUint32(descriptorOffset + 8, true) !== uncompressedBytes) {
        throw new Error('ZIP data descriptor and central directory sizes do not match.')
      }
    }
    const path = new TextDecoder((flags & 0x0800) ? 'utf-8' : 'windows-1252', { fatal: true }).decode(nameBytes)
    const unixMode = externalAttributes >>> 16
    entries.push({
      path,
      compressedBytes,
      uncompressedBytes,
      isDirectory: path.endsWith('/'),
      isSymlink: (unixMode & 0o170000) === 0o120000,
    })
    offset += recordLength
  }
  if (offset !== centralOffset + centralSize) throw new Error('ZIP central directory size does not match its records.')
  return entries
}

/** Read an untrusted ZIP only after central-directory metadata passes resource and path checks. */
export async function readBundleZip(
  zipBytes: Uint8Array,
  limits: BundleReadLimits = DEFAULT_BUNDLE_READ_LIMITS,
): Promise<BundleFileReadResult> {
  let entries: BundleEntryMetadata[]
  try {
    entries = readZipCentralDirectory(zipBytes)
  } catch (error) {
    return { files: null, diagnostics: [bundleError('zip.invalid', `Invalid ZIP: ${error instanceof Error ? error.message : String(error)}`)] }
  }
  const diagnostics = validateEntryMetadata(entries, limits)
  if (hasBundleErrors(diagnostics)) return { files: null, diagnostics }

  const files = new Map<string, Uint8Array>()
  try {
    const zip = await JSZip.loadAsync(zipBytes, { createFolders: false, checkCRC32: true })
    for (const entry of Object.values(zip.files).filter((value) => !value.dir)) {
      files.set(entry.name.normalize('NFC'), await entry.async('uint8array'))
    }
  } catch (error) {
    diagnostics.push(bundleError('zip.read_failed', `Could not decompress ZIP entry: ${error instanceof Error ? error.message : String(error)}`))
    return { files: null, diagnostics }
  }
  return { files: stripSharedBundleRoot(files), diagnostics }
}
