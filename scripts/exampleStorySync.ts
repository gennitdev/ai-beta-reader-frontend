import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { createBundleZip } from '../src/lib/libraryBundle/adapters/zip'
import type { BundleFileMap } from '../src/lib/libraryBundle/fileMap'
import { readLibraryBundle } from '../src/lib/libraryBundle/read'
import { sha256Hex } from '../src/lib/libraryBundle/semanticHash'
import { validateBundlePath } from './bundleValidator'

export interface ExampleStoryProvenance {
  schemaVersion: 1
  storyId: string
  sourceRepository: string
  sourceCommit: string
  bundleId: string
  bundleSha256: string
  fileCount: number
  entityCount: number
}

export interface SyncExampleStoryOptions {
  sourceDirectory: string
  outputZipPath: string
  provenancePath: string
  sourceRepository: string
  sourceCommit: string
}

async function readDirectory(
  root: string,
  directory = root,
  files: BundleFileMap = new Map(),
): Promise<BundleFileMap> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.git') continue
    const absolutePath = join(directory, entry.name)
    if (entry.isDirectory()) await readDirectory(root, absolutePath, files)
    else files.set(relative(root, absolutePath).split('\\').join('/'), new Uint8Array(await readFile(absolutePath)))
  }
  return files
}

function requireFile(files: BundleFileMap, path: string): Uint8Array {
  const bytes = files.get(path)
  if (!bytes) throw new Error(`Canonical bundle file is missing: ${path}`)
  return bytes
}

/** Package the managed canonical files from a Git workspace into the frontend's deterministic demo asset. */
export async function syncExampleStory(options: SyncExampleStoryOptions): Promise<ExampleStoryProvenance> {
  const sourceDirectory = resolve(options.sourceDirectory)
  const validation = await validateBundlePath(sourceDirectory)
  if (!validation.valid) {
    const messages = validation.diagnostics
      .filter((entry) => entry.severity === 'error')
      .map((entry) => `${entry.code}: ${entry.message}`)
    throw new Error(`Example story bundle is invalid:\n${messages.join('\n')}`)
  }

  const workspaceFiles = await readDirectory(sourceDirectory)
  const parsed = readLibraryBundle(workspaceFiles)
  if (!parsed.model || !parsed.manifest || !parsed.inventory) {
    throw new Error('Example story bundle could not be parsed after validation.')
  }

  const managedFiles: BundleFileMap = new Map([
    ['beta-bot.yaml', requireFile(workspaceFiles, 'beta-bot.yaml')],
    ['_beta-bot/inventory.json', requireFile(workspaceFiles, '_beta-bot/inventory.json')],
  ])
  for (const entry of parsed.inventory.entities) {
    managedFiles.set(entry.path, requireFile(workspaceFiles, entry.path))
  }
  for (const path of [
    '_beta-bot/history/chapter-revisions.jsonl',
    '_beta-bot/history/chapter-activity.jsonl',
    '_beta-bot/history/wiki-updates.jsonl',
    '_beta-bot/review-state.jsonl',
  ]) {
    const bytes = workspaceFiles.get(path)
    if (bytes) managedFiles.set(path, bytes)
  }
  for (const asset of parsed.model.assets) {
    const source = parsed.entitySources.find((entry) => entry.entityType === 'asset' && entry.id === asset.id)
    if (!source) throw new Error(`Asset ${asset.id} has no canonical source path.`)
    const binaryPath = `${dirname(source.path).split('\\').join('/')}/${asset.file_name}`
    managedFiles.set(binaryPath, requireFile(workspaceFiles, binaryPath))
  }

  const zipBytes = await createBundleZip(managedFiles)
  const provenance: ExampleStoryProvenance = {
    schemaVersion: 1,
    storyId: parsed.model.books[0]?.id ?? 'unknown',
    sourceRepository: options.sourceRepository,
    sourceCommit: options.sourceCommit,
    bundleId: parsed.manifest.bundle_id,
    bundleSha256: await sha256Hex(zipBytes),
    fileCount: managedFiles.size,
    entityCount: parsed.entitySources.length,
  }

  await mkdir(dirname(options.outputZipPath), { recursive: true })
  await mkdir(dirname(options.provenancePath), { recursive: true })
  await writeFile(options.outputZipPath, zipBytes)
  await writeFile(options.provenancePath, `${JSON.stringify(provenance, null, 2)}\n`)
  return provenance
}
