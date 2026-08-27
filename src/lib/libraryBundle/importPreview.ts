import { parseDatabaseImportData } from '@/lib/databaseImportExport'
import type { AssetByteReader } from './snapshot'
import { createCanonicalLibrarySnapshot } from './snapshot'
import { readBundleZip } from './adapters/zip'
import {
  readBundleDirectoryFiles,
  readPreparedBundleDirectoryFiles,
  type SelectedDirectoryBundleFile,
} from './adapters/directory'
import type { ReadonlyBundleFileMap } from './fileMap'
import type { BundleDiagnostic } from './diagnostics'
import { readLibraryBundle } from './read'
import { validateLibraryBundle } from './validate'
import { createLibraryImportPlan, type LibraryImportIntent, type LibraryImportPlan } from './plan'
import { sha256Hex } from './semanticHash'

export interface PreviewBundleImportOptions {
  readLocalAssetBytes?: AssetByteReader
  intent?: LibraryImportIntent
  retainLocalAssetBytes?: boolean
  onProgress?: (stage: LibraryBundlePreviewStage) => void
}

export type LibraryBundlePreviewStage = 'reading' | 'validating' | 'planning'

export interface PreviewedBundleImport {
  plan: LibraryImportPlan
  localModel: Awaited<ReturnType<typeof createCanonicalLibrarySnapshot>>
  incomingModel: Awaited<ReturnType<typeof createCanonicalLibrarySnapshot>>
  databaseGeneration: string
  exportedAt: string | null
}

export async function previewBundleZipImport(
  zipBytes: Uint8Array,
  currentDatabaseBackup: Uint8Array,
  options: PreviewBundleImportOptions = {},
): Promise<PreviewedBundleImport> {
  options.onProgress?.('reading')
  const transport = await readBundleZip(zipBytes)
  if (!transport.files) throw new Error(transport.diagnostics.map((value) => value.message).join('\n'))
  return previewBundleFileMapImport(transport.files, currentDatabaseBackup, transport.diagnostics, options)
}

export async function previewBundleDirectoryImport(
  selectedFiles: readonly File[],
  currentDatabaseBackup: Uint8Array,
  options: PreviewBundleImportOptions = {},
): Promise<PreviewedBundleImport> {
  options.onProgress?.('reading')
  const transport = await readBundleDirectoryFiles(selectedFiles)
  if (!transport.files) throw new Error(transport.diagnostics.map((value) => value.message).join('\n'))
  return previewBundleFileMapImport(transport.files, currentDatabaseBackup, transport.diagnostics, options)
}

export async function previewPreparedBundleDirectoryImport(
  selectedFiles: readonly SelectedDirectoryBundleFile[],
  currentDatabaseBackup: Uint8Array,
  options: PreviewBundleImportOptions = {},
): Promise<PreviewedBundleImport> {
  options.onProgress?.('reading')
  const transport = await readPreparedBundleDirectoryFiles(selectedFiles)
  if (!transport.files) throw new Error(transport.diagnostics.map((value) => value.message).join('\n'))
  return previewBundleFileMapImport(transport.files, currentDatabaseBackup, transport.diagnostics, options)
}

export async function previewBundleFileMapImport(
  files: ReadonlyBundleFileMap,
  currentDatabaseBackup: Uint8Array,
  transportDiagnostics: readonly BundleDiagnostic[] = [],
  options: PreviewBundleImportOptions = {},
): Promise<PreviewedBundleImport> {
  options.onProgress?.('validating')
  const parsed = readLibraryBundle(files)
  const validated = await validateLibraryBundle({
    ...parsed,
    diagnostics: [...transportDiagnostics, ...parsed.diagnostics],
  }, files)
  const current = parseDatabaseImportData(JSON.parse(new TextDecoder().decode(currentDatabaseBackup)))
  options.onProgress?.('planning')
  const localModel = await createCanonicalLibrarySnapshot(current, {
    readAssetBytes: options.readLocalAssetBytes,
    retainAssetBytes: options.retainLocalAssetBytes,
  })
  const databaseGeneration = await sha256Hex(currentDatabaseBackup)
  return {
    plan: await createLibraryImportPlan(validated, localModel, databaseGeneration, {
      intent: options.intent,
    }),
    localModel,
    incomingModel: validated.model ?? localModel,
    databaseGeneration,
    exportedAt: validated.manifest?.exported_at ?? null,
  }
}
