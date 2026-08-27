import { lstat, readFile, readdir } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { bundleError, hasBundleErrors, type BundleDiagnostic } from '../src/lib/libraryBundle/diagnostics'
import {
  readBundleDirectoryEntries,
  type DirectoryBundleEntry,
} from '../src/lib/libraryBundle/adapters/directory'
import { readBundleZip } from '../src/lib/libraryBundle/adapters/zip'
import { DEFAULT_BUNDLE_READ_LIMITS, validateEntryMetadata } from '../src/lib/libraryBundle/limits'
import { readLibraryBundle } from '../src/lib/libraryBundle/read'
import { validateLibraryBundle } from '../src/lib/libraryBundle/validate'

interface DiscoveredEntry {
  path: string
  absolutePath: string
  size: number
  isSymlink: boolean
}
export interface BundlePathValidation {
  sourcePath: string
  valid: boolean
  replaceEligible: boolean
  fileCount: number
  entityCount: number
  diagnostics: readonly BundleDiagnostic[]
}

async function discoverDirectory(
  absoluteDirectory: string,
  relativeDirectory = '',
): Promise<DiscoveredEntry[]> {
  const discovered: DiscoveredEntry[] = []
  const children = await readdir(absoluteDirectory, { withFileTypes: true })
  for (const child of children) {
    if (child.name === '.git') continue
    const relativePath = relativeDirectory ? `${relativeDirectory}/${child.name}` : child.name
    const absolutePath = join(absoluteDirectory, child.name)
    if (child.isDirectory()) {
      discovered.push(...await discoverDirectory(absolutePath, relativePath))
      continue
    }
    const stats = await lstat(absolutePath)
    discovered.push({
      path: relativePath,
      absolutePath,
      size: stats.size,
      isSymlink: stats.isSymbolicLink(),
    })
  }
  return discovered
}

function failed(sourcePath: string, diagnostics: readonly BundleDiagnostic[]): BundlePathValidation {
  return {
    sourcePath,
    valid: false,
    replaceEligible: false,
    fileCount: 0,
    entityCount: 0,
    diagnostics,
  }
}

/** Validate a ZIP or directory using the same parser, migrations, and schemas as the app. */
export async function validateBundlePath(inputPath: string): Promise<BundlePathValidation> {
  const sourcePath = resolve(inputPath)
  let stats
  try {
    stats = await lstat(sourcePath)
  } catch (error) {
    return failed(sourcePath, [bundleError('input.unreadable', `Cannot read ${sourcePath}: ${error instanceof Error ? error.message : String(error)}`)])
  }

  let transport
  if (stats.isDirectory()) {
    const discovered = await discoverDirectory(sourcePath)
    const metadataDiagnostics = validateEntryMetadata(discovered.map((entry) => ({
      path: entry.path,
      uncompressedBytes: entry.size,
      isSymlink: entry.isSymlink,
    })))
    if (hasBundleErrors(metadataDiagnostics)) return failed(sourcePath, metadataDiagnostics)
    const entries: DirectoryBundleEntry[] = await Promise.all(discovered.map(async (entry) => ({
      path: entry.path,
      bytes: new Uint8Array(await readFile(entry.absolutePath)),
      isSymlink: entry.isSymlink,
    })))
    transport = readBundleDirectoryEntries(entries)
  } else if (stats.isFile()) {
    if (stats.size > DEFAULT_BUNDLE_READ_LIMITS.maxTotalBytes) {
      return failed(sourcePath, [bundleError(
        'limit.input_size',
        `Input file is ${stats.size} bytes; the limit is ${DEFAULT_BUNDLE_READ_LIMITS.maxTotalBytes}.`,
        { path: basename(sourcePath) },
      )])
    }
    transport = await readBundleZip(new Uint8Array(await readFile(sourcePath)))
  } else {
    return failed(sourcePath, [bundleError('input.type', 'Bundle input must be a directory or ZIP file.')])
  }

  if (!transport.files) return failed(sourcePath, transport.diagnostics)
  const parsed = readLibraryBundle(transport.files)
  const validated = await validateLibraryBundle({
    ...parsed,
    diagnostics: [...transport.diagnostics, ...parsed.diagnostics],
  }, transport.files)
  return {
    sourcePath,
    valid: !hasBundleErrors(validated.diagnostics),
    replaceEligible: validated.replaceEligible,
    fileCount: transport.files.size,
    entityCount: validated.entitySources.length,
    diagnostics: validated.diagnostics,
  }
}
