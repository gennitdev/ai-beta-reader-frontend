import type { CanonicalLibraryModel } from './model'
import { LIBRARY_BUNDLE_FORMAT_VERSION } from './schemas'

/**
 * Bundle migrations are intentionally separate from database migrations. Version 1 is
 * the first public canonical format, so the registry currently contains only its
 * identity migration and rejects unknown older or newer versions.
 */
export function migrateLibraryBundleModel(
  version: number,
  model: CanonicalLibraryModel,
): CanonicalLibraryModel {
  if (version !== LIBRARY_BUNDLE_FORMAT_VERSION) {
    throw new Error(`Unsupported bundle format version ${version}; this app supports version ${LIBRARY_BUNDLE_FORMAT_VERSION}.`)
  }
  return model
}
