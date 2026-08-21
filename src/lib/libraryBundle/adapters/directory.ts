import type { BundleFileMap } from '../fileMap'
import type { BundleReadLimits } from '../limits'
import { DEFAULT_BUNDLE_READ_LIMITS, validateEntryMetadata } from '../limits'
import { hasBundleErrors, type BundleDiagnostic } from '../diagnostics'

export interface DirectoryBundleEntry {
  path: string
  bytes: Uint8Array
  isSymlink?: boolean
}

export interface BundleFileReadResult {
  files: BundleFileMap | null
  diagnostics: BundleDiagnostic[]
}

export function readBundleDirectoryEntries(
  entries: readonly DirectoryBundleEntry[],
  limits: BundleReadLimits = DEFAULT_BUNDLE_READ_LIMITS,
): BundleFileReadResult {
  const diagnostics = validateEntryMetadata(entries.map((entry) => ({
    path: entry.path,
    uncompressedBytes: entry.bytes.byteLength,
    isSymlink: entry.isSymlink,
  })), limits)
  if (hasBundleErrors(diagnostics)) return { files: null, diagnostics }
  const files: BundleFileMap = new Map()
  for (const entry of entries) files.set(entry.path.normalize('NFC'), entry.bytes)
  return { files, diagnostics }
}

/** Browser adapter for files selected with webkitdirectory or a directory picker. */
export async function readBundleDirectoryFiles(
  selectedFiles: readonly File[],
  limits: BundleReadLimits = DEFAULT_BUNDLE_READ_LIMITS,
): Promise<BundleFileReadResult> {
  const rawPaths = selectedFiles.map((file) => file.webkitRelativePath || file.name)
  const firstSegments = rawPaths.map((path) => path.split('/')[0])
  const sharedDirectoryRoot = selectedFiles.length > 0
    && selectedFiles.every((file) => Boolean(file.webkitRelativePath))
    && new Set(firstSegments).size === 1
  const paths = rawPaths.map((path) => sharedDirectoryRoot ? path.slice(path.indexOf('/') + 1) : path)
  const metadata = selectedFiles.map((file, index) => ({
    path: paths[index],
    uncompressedBytes: file.size,
  }))
  const diagnostics = validateEntryMetadata(metadata, limits)
  if (hasBundleErrors(diagnostics)) return { files: null, diagnostics }
  const entries = await Promise.all(selectedFiles.map(async (file, index) => ({
    path: paths[index],
    bytes: new Uint8Array(await file.arrayBuffer()),
  })))
  return readBundleDirectoryEntries(entries, limits)
}
