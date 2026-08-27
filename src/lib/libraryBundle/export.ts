import { parseDatabaseImportData } from '@/lib/databaseImportExport'
import type { AssetByteReader } from './snapshot'
import { createCanonicalLibrarySnapshot } from './snapshot'
import { writeLibraryBundle, type BundleWriteOptions } from './write'
import { createBundleZip } from './adapters/zip'

export interface FullLibraryBundleExportOptions extends BundleWriteOptions {
  readAssetBytes?: AssetByteReader
}

export type SelectedBooksBundleExportOptions = FullLibraryBundleExportOptions

async function createCanonicalBundleExport(
  databaseBackup: Uint8Array,
  options: FullLibraryBundleExportOptions,
  bookIds?: readonly string[],
  contentMode: 'full' | 'text-only' = 'full',
) {
  const raw: unknown = JSON.parse(new TextDecoder().decode(databaseBackup))
  const database = parseDatabaseImportData(raw)
  const model = await createCanonicalLibrarySnapshot(database, {
    readAssetBytes: options.readAssetBytes,
    bookIds,
    contentMode,
  })
  const written = await writeLibraryBundle(model, options)
  const zipBytes = await createBundleZip(written.files)
  return { ...written, model, zipBytes }
}

export async function createFullLibraryBundleExport(
  databaseBackup: Uint8Array,
  options: FullLibraryBundleExportOptions,
) {
  return createCanonicalBundleExport(databaseBackup, options)
}

/** Export an exact non-empty book selection through the canonical library writer. */
export async function createSelectedBooksBundleExport(
  databaseBackup: Uint8Array,
  bookIds: readonly string[],
  options: SelectedBooksBundleExportOptions,
) {
  return createCanonicalBundleExport(databaseBackup, options, bookIds)
}

/** Create a Git-friendly workspace without recovery data or image binaries. */
export async function createTextOnlyLibraryBundleExport(
  databaseBackup: Uint8Array,
  options: FullLibraryBundleExportOptions,
  bookIds?: readonly string[],
) {
  return createCanonicalBundleExport(databaseBackup, options, bookIds, 'text-only')
}
