import { parseDocument } from 'yaml'
import { bundleInventorySchema } from '../inventory'
import type { BundleFileMap } from '../fileMap'
import { decodeBundleText, sortedBundlePaths, type ReadonlyBundleFileMap } from '../fileMap'
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

export interface BundleWritableFile {
  write(data: Blob): Promise<void>
  close(): Promise<void>
}

export interface BundleFileHandle {
  readonly kind: 'file'
  getFile(): Promise<Blob>
  createWritable(): Promise<BundleWritableFile>
}

export interface BundleDirectoryHandle {
  readonly kind: 'directory'
  readonly name?: string
  getFileHandle(name: string, options?: { create?: boolean }): Promise<BundleFileHandle>
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<BundleDirectoryHandle>
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>
}

export interface DirectoryBundleWriteResult {
  writtenFiles: number
  deletedFiles: number
  scaffoldedFiles: number
}

const FIXED_MANAGED_PATHS = [
  'beta-bot.yaml',
  '_beta-bot/inventory.json',
  '_beta-bot/history/chapter-revisions.jsonl',
  '_beta-bot/history/chapter-activity.jsonl',
  '_beta-bot/history/wiki-updates.jsonl',
  '_beta-bot/review-state.jsonl',
] as const

const INVENTORY_PATHS: Readonly<Record<string, RegExp>> = Object.freeze({
  book: /^books\/[^/]+\/book\.yaml$/,
  book_character: /^books\/[^/]+\/characters\.yaml$/,
  part: /^books\/[^/]+\/parts\/[^/]+\/part\.yaml$/,
  chapter: /^books\/[^/]+\/chapters\/[^/]+\/chapter\.md$/,
  chapter_note: /^books\/[^/]+\/chapters\/[^/]+\/notes\.md$/,
  chapter_summary: /^books\/[^/]+\/chapters\/[^/]+\/summary\.md$/,
  part_summary: /^books\/[^/]+\/parts\/[^/]+\/summary\.md$/,
  review: /^books\/[^/]+\/chapters\/[^/]+\/reviews\/[^/]+\.md$/,
  wiki_page: /^books\/[^/]+\/wiki\/[^/]+\.md$/,
  profile: /^profiles\/[^/]+\.yaml$/,
  asset: /^books\/[^/]+\/assets\/[^/]+\/asset\.yaml$/,
  chapter_revision: /^_beta-bot\/history\/chapter-revisions\.jsonl$/,
  chapter_activity: /^_beta-bot\/history\/chapter-activity\.jsonl$/,
  wiki_update: /^_beta-bot\/history\/wiki-updates\.jsonl$/,
  wiki_review_state: /^_beta-bot\/review-state\.jsonl$/,
})

function isMissingEntry(error: unknown): boolean {
  return typeof error === 'object' && error !== null
    && 'name' in error && error.name === 'NotFoundError'
}

async function parentDirectory(
  root: BundleDirectoryHandle,
  path: string,
  create: boolean,
): Promise<{ directory: BundleDirectoryHandle; name: string }> {
  const segments = path.split('/')
  const name = segments.pop() as string
  let directory = root
  for (const segment of segments) {
    directory = await directory.getDirectoryHandle(segment, { create })
  }
  return { directory, name }
}

async function readFileIfPresent(root: BundleDirectoryHandle, path: string): Promise<Uint8Array | null> {
  try {
    const { directory, name } = await parentDirectory(root, path, false)
    const file = await directory.getFileHandle(name)
    return new Uint8Array(await (await file.getFile()).arrayBuffer())
  } catch (error) {
    if (isMissingEntry(error)) return null
    throw error
  }
}

async function removeFileIfPresent(root: BundleDirectoryHandle, path: string): Promise<void> {
  try {
    const { directory, name } = await parentDirectory(root, path, false)
    await directory.removeEntry(name)
  } catch (error) {
    if (!isMissingEntry(error)) throw error
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index])
}

async function writeVerifiedFile(root: BundleDirectoryHandle, path: string, bytes: Uint8Array): Promise<void> {
  const { directory, name } = await parentDirectory(root, path, true)
  const file = await directory.getFileHandle(name, { create: true })
  const writable = await file.createWritable()
  await writable.write(new Blob([bytes.slice().buffer]))
  await writable.close()
  const verified = new Uint8Array(await (await file.getFile()).arrayBuffer())
  if (!equalBytes(verified, bytes)) throw new Error(`Directory write verification failed for ${path}.`)
}

function yamlObject(bytes: Uint8Array, path: string): Record<string, unknown> {
  const document = parseDocument(decodeBundleText(bytes), {
    schema: 'core', strict: true, uniqueKeys: true, merge: false,
  })
  if (document.errors.length || document.warnings.length) {
    throw new Error(`Existing ${path} is not valid canonical YAML.`)
  }
  const value: unknown = document.toJS({ maxAliasCount: 0 })
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Existing ${path} must contain a YAML mapping.`)
  }
  return value as Record<string, unknown>
}

interface PriorManagedPaths {
  managed: Set<string>
  assetBinaries: Set<string>
}

async function priorManagedPaths(root: BundleDirectoryHandle): Promise<PriorManagedPaths> {
  const manifestBytes = await readFileIfPresent(root, 'beta-bot.yaml')
  const inventoryBytes = await readFileIfPresent(root, '_beta-bot/inventory.json')
  if (!manifestBytes && !inventoryBytes) return { managed: new Set(), assetBinaries: new Set() }
  if (!manifestBytes || !inventoryBytes) {
    throw new Error('The selected folder contains an incomplete Beta Bot bundle; export will not overwrite it.')
  }

  const manifest = yamlObject(manifestBytes, 'beta-bot.yaml')
  if (manifest.format !== 'beta-bot-library' || typeof manifest.bundle_id !== 'string') {
    throw new Error('The selected folder is not a Beta Bot library bundle.')
  }
  let inventoryValue: unknown
  try {
    inventoryValue = JSON.parse(decodeBundleText(inventoryBytes))
  } catch (error) {
    throw new Error('Existing _beta-bot/inventory.json is not valid JSON.', { cause: error })
  }
  const inventory = bundleInventorySchema.safeParse(inventoryValue)
  if (!inventory.success || inventory.data.bundle_id !== manifest.bundle_id) {
    throw new Error('The selected folder has invalid or mismatched Beta Bot inventory metadata.')
  }

  const managed = new Set<string>(FIXED_MANAGED_PATHS)
  const assetBinaries = new Set<string>()
  for (const entry of inventory.data.entities) {
    if (!INVENTORY_PATHS[entry.entity_type]?.test(entry.path)) {
      throw new Error(`Existing inventory claims unsafe managed path ${entry.path}.`)
    }
    managed.add(entry.path)
    if (entry.entity_type !== 'asset' || !entry.path.endsWith('/asset.yaml')) continue
    const metadataBytes = await readFileIfPresent(root, entry.path)
    if (!metadataBytes) continue
    try {
      const metadata = yamlObject(metadataBytes, entry.path)
      const fileName = metadata.file_name
      if (typeof fileName === 'string' && fileName && !/[\\/\0\r\n]/.test(fileName)) {
        const assetPath = `${entry.path.slice(0, -'asset.yaml'.length)}${fileName.normalize('NFC')}`
        managed.add(assetPath)
        assetBinaries.add(assetPath)
      }
    } catch {
      // If externally edited asset metadata is no longer canonical, preserve
      // the sibling file rather than guessing what the app owns.
    }
  }
  return { managed, assetBinaries }
}

/**
 * Update a canonical directory without overwriting unknown user files.
 *
 * New files are written and byte-verified before obsolete files owned by the
 * prior inventory are removed. Any failure restores overwritten/deleted bytes
 * and removes files created by the failed attempt.
 */
export async function writeBundleDirectory(
  root: BundleDirectoryHandle,
  files: ReadonlyBundleFileMap,
  scaffoldFiles: ReadonlyBundleFileMap = new Map(),
): Promise<DirectoryBundleWriteResult> {
  const paths = sortedBundlePaths(files)
  const diagnostics = validateEntryMetadata(paths.map((path) => ({
    path, uncompressedBytes: (files.get(path) as Uint8Array).byteLength,
  })))
  if (hasBundleErrors(diagnostics)) {
    throw new Error(diagnostics.filter((value) => value.severity === 'error').map((value) => value.message).join('\n'))
  }

  const { managed: oldManaged, assetBinaries } = await priorManagedPaths(root)
  const incomingManifest = yamlObject(files.get('beta-bot.yaml') as Uint8Array, 'beta-bot.yaml')
  const preservesImageBytes = incomingManifest.content_mode === 'text-only'
    && (incomingManifest.includes as { image_bytes?: unknown } | undefined)?.image_bytes === false
  const originalWrites = new Map<string, Uint8Array | null>()
  for (const path of paths) {
    const existing = await readFileIfPresent(root, path)
    if (existing && !oldManaged.has(path)) {
      throw new Error(`Export would overwrite unknown file ${path}; choose an empty folder or an existing Beta Bot bundle.`)
    }
    originalWrites.set(path, existing)
  }

  const obsolete = [...oldManaged]
    .filter((path) => !files.has(path) && !(preservesImageBytes && assetBinaries.has(path)))
    .sort()
  const obsoleteBytes = new Map<string, Uint8Array>()
  for (const path of obsolete) {
    const existing = await readFileIfPresent(root, path)
    if (existing) obsoleteBytes.set(path, existing)
  }
  const newScaffolds = new Map<string, Uint8Array>()
  for (const path of sortedBundlePaths(scaffoldFiles)) {
    if (await readFileIfPresent(root, path) === null) {
      newScaffolds.set(path, scaffoldFiles.get(path) as Uint8Array)
    }
  }

  const attemptedWrites: string[] = []
  const deletedPaths: string[] = []
  const attemptedScaffolds: string[] = []
  try {
    for (const path of paths) {
      attemptedWrites.push(path)
      await writeVerifiedFile(root, path, files.get(path) as Uint8Array)
    }
    for (const [path, bytes] of newScaffolds) {
      attemptedScaffolds.push(path)
      await writeVerifiedFile(root, path, bytes)
    }
    for (const path of obsoleteBytes.keys()) {
      deletedPaths.push(path)
      await removeFileIfPresent(root, path)
    }
  } catch (writeError) {
    const rollbackFailures: unknown[] = []
    for (const path of attemptedWrites.reverse()) {
      try {
        const original = originalWrites.get(path)
        if (original) await writeVerifiedFile(root, path, original)
        else await removeFileIfPresent(root, path)
      } catch (error) {
        rollbackFailures.push(error)
      }
    }
    for (const path of attemptedScaffolds.reverse()) {
      try { await removeFileIfPresent(root, path) } catch (error) { rollbackFailures.push(error) }
    }
    for (const path of deletedPaths.reverse()) {
      try { await writeVerifiedFile(root, path, obsoleteBytes.get(path) as Uint8Array) } catch (error) { rollbackFailures.push(error) }
    }
    if (rollbackFailures.length) {
      throw new AggregateError([writeError, ...rollbackFailures], 'Directory export failed and could not be fully rolled back.')
    }
    throw new Error('Directory export failed; the prior bundle was restored.', { cause: writeError })
  }

  return {
    writtenFiles: paths.length,
    deletedFiles: obsoleteBytes.size,
    scaffoldedFiles: newScaffolds.size,
  }
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
  const selectedEntries = selectedFiles
    .map((file, index) => ({ file, path: paths[index] }))
    .filter((entry) => !entry.path.split('/').includes('.git'))
  const metadata = selectedEntries.map(({ file, path }) => ({ path, uncompressedBytes: file.size }))
  const diagnostics = validateEntryMetadata(metadata, limits)
  if (hasBundleErrors(diagnostics)) return { files: null, diagnostics }
  const entries = await Promise.all(selectedEntries.map(async ({ file, path }) => ({
    path,
    bytes: new Uint8Array(await file.arrayBuffer()),
  })))
  return readBundleDirectoryEntries(entries, limits)
}
