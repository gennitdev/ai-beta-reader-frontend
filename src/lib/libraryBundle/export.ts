import { parseDatabaseImportData } from '@/lib/databaseImportExport'
import type { AssetByteReader } from './snapshot'
import { createCanonicalLibrarySnapshot } from './snapshot'
import { writeLibraryBundle, type BundleWriteOptions } from './write'
import { createBundleZip } from './adapters/zip'

export interface FullLibraryBundleExportOptions extends BundleWriteOptions {
  readAssetBytes?: AssetByteReader
}

export async function createFullLibraryBundleExport(
  databaseBackup: Uint8Array,
  options: FullLibraryBundleExportOptions,
) {
  const raw: unknown = JSON.parse(new TextDecoder().decode(databaseBackup))
  const database = parseDatabaseImportData(raw)
  const model = await createCanonicalLibrarySnapshot(database, {
    readAssetBytes: options.readAssetBytes,
  })
  const written = await writeLibraryBundle(model, options)
  const zipBytes = await createBundleZip(written.files)
  return { ...written, model, zipBytes }
}

/** Create a Git-friendly workspace without recovery data or image binaries. */
export async function createTextOnlyLibraryBundleExport(
  databaseBackup: Uint8Array,
  options: FullLibraryBundleExportOptions,
) {
  const raw: unknown = JSON.parse(new TextDecoder().decode(databaseBackup))
  const database = parseDatabaseImportData(raw)
  const model = await createCanonicalLibrarySnapshot(database, {
    contentMode: 'text-only',
    readAssetBytes: options.readAssetBytes,
  })
  const written = await writeLibraryBundle(model, options)
  const zipBytes = await createBundleZip(written.files)
  return { ...written, model, zipBytes }
}
