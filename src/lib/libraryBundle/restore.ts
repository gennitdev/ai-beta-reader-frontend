import type { ImageAsset } from '@/lib/database'
import type { ImageContentStore } from '@/lib/imageContentStore'
import { IMAGE_CONTENT_HASH_ALGORITHM, verifyImageContent } from '@/lib/imageContentHash'
import { canonicalModelToDatabaseImport } from './apply'
import type { BundleAsset, CanonicalLibraryModel } from './model'

export interface CanonicalLibraryImporter {
  imageStore: ImageContentStore | null
  importDatabaseBackup: (bytes: Uint8Array) => Promise<void>
  assetIdsToWrite?: ReadonlySet<string>
}

function safePathSegment(value: string, fallback: string): string {
  const sanitized = value.normalize('NFC').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 180)
  return sanitized && sanitized !== '.' && sanitized !== '..' ? sanitized : fallback
}

export function canonicalAssetFilePath(asset: BundleAsset): string {
  const id = safePathSegment(asset.id, 'image')
  const fileName = safePathSegment(asset.file_name, 'image')
  return `images/library/${id}/${fileName}`
}

export function canonicalAssetImageMetadata(asset: BundleAsset): ImageAsset {
  return {
    id: asset.id,
    book_id: asset.book_id,
    chapter_id: asset.chapter_id,
    asset_type: asset.asset_type,
    file_name: asset.file_name,
    file_path: canonicalAssetFilePath(asset),
    mime_type: asset.mime_type,
    image_data: null,
    content_hash: asset.sha256,
    content_hash_algorithm: IMAGE_CONTENT_HASH_ALGORITHM,
    content_byte_length: asset.byte_length,
    notes: asset.notes,
    created_at: asset.created_at,
    updated_at: asset.updated_at,
  }
}

async function writeAsset(store: ImageContentStore, asset: BundleAsset): Promise<void> {
  if (!asset.bytes) throw new Error(`Image ${asset.file_name} (${asset.id}) is missing required bytes.`)
  const metadata = canonicalAssetImageMetadata(asset)
  const blob = new Blob([asset.bytes.slice().buffer], {
    type: asset.mime_type ?? 'application/octet-stream',
  })
  await verifyImageContent(blob, {
    content_hash: asset.sha256,
    content_hash_algorithm: IMAGE_CONTENT_HASH_ALGORITHM,
    content_byte_length: asset.byte_length,
  })
  await store.write(metadata, blob)
  const stored = await store.read(metadata)
  if (!stored) throw new Error(`Image ${asset.file_name} (${asset.id}) was not stored.`)
  await verifyImageContent(stored, {
    content_hash: asset.sha256,
    content_hash_algorithm: IMAGE_CONTENT_HASH_ALGORITHM,
    content_byte_length: asset.byte_length,
  })
}

/** Restore binary assets in bounded units, then import metadata-only database JSON. */
export async function importCanonicalLibraryModel(
  model: CanonicalLibraryModel,
  importer: CanonicalLibraryImporter,
): Promise<void> {
  if (model.assets.length > 0 && !importer.imageStore) {
    throw new Error('This device cannot store the images contained in the library backup.')
  }
  if (importer.imageStore) {
    const assetsToWrite = importer.assetIdsToWrite
      ? model.assets.filter((asset) => importer.assetIdsToWrite?.has(asset.id))
      : model.assets
    for (const asset of assetsToWrite) await writeAsset(importer.imageStore, asset)
  }

  const databaseData = canonicalModelToDatabaseImport(model, {
    embedAssetBytes: false,
    assetFilePath: canonicalAssetFilePath,
  })
  await importer.importDatabaseBackup(new TextEncoder().encode(JSON.stringify(databaseData)))
}

/** Remove files introduced by a failed replacement but absent from its rollback model. */
export async function removeCanonicalAssetsAbsentFromModel(
  store: ImageContentStore | null,
  candidates: CanonicalLibraryModel['assets'],
  retainedModel: CanonicalLibraryModel,
): Promise<void> {
  if (!store) return
  const retainedIds = new Set(retainedModel.assets.map((asset) => asset.id))
  for (const asset of candidates) {
    if (!retainedIds.has(asset.id)) await store.delete(canonicalAssetImageMetadata(asset))
  }
}
