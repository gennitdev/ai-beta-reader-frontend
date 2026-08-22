import type { ImageAsset } from '@/lib/database'
import { dataUrlToBlob, type ImageContentStore } from '@/lib/imageContentStore'
import {
  hashImageContent,
  verifyImageContent,
  type ImageContentIntegrity,
} from '@/lib/imageContentHash'

export const IMAGE_BLOB_MIGRATION_VERSION = 2
export const IMAGE_BLOB_MIGRATION_STATUS_KEY = 'imageBlobMigrationStatus'

export interface ImageDataMigrationStatus {
  version: number
  status: 'complete' | 'partial'
  migratedCount: number
  failedImageIds: string[]
  updatedAt: string
}

export interface ImageDataMigrationRepository {
  listPendingImageIds(): Promise<string[]>
  loadImages(imageIds: string[]): Promise<ImageAsset[]>
  finalizeImages(images: Array<{ id: string; integrity: ImageContentIntegrity }>): Promise<void>
  saveStatus(status: ImageDataMigrationStatus): Promise<void>
}

export interface ImageDataMigrationOptions {
  repository: ImageDataMigrationRepository
  store: ImageContentStore
  batchSize?: number
  now?: () => string
}

export async function migrateLegacyImageData({
  repository,
  store,
  batchSize = 5,
  now = () => new Date().toISOString(),
}: ImageDataMigrationOptions): Promise<ImageDataMigrationStatus> {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error('Image data migration batch size must be a positive integer')
  }

  const pendingImageIds = await repository.listPendingImageIds()
  const failedImageIds: string[] = []
  let migratedCount = 0

  for (let offset = 0; offset < pendingImageIds.length; offset += batchSize) {
    const batchIds = pendingImageIds.slice(offset, offset + batchSize)
    const assets = await repository.loadImages(batchIds)
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]))
    const migratedBatch: Array<{ id: string; integrity: ImageContentIntegrity }> = []

    for (const imageId of batchIds) {
      const asset = assetsById.get(imageId)
      if (!asset?.image_data) {
        failedImageIds.push(imageId)
        continue
      }

      try {
        const sourceBlob = dataUrlToBlob(asset.image_data)
        if (asset.content_hash) {
          if (!asset.content_hash_algorithm || asset.content_byte_length == null) {
            throw new Error('existing image integrity metadata is incomplete')
          }
          await verifyImageContent(sourceBlob, {
            content_hash: asset.content_hash,
            content_hash_algorithm: asset.content_hash_algorithm,
            content_byte_length: asset.content_byte_length,
          })
        }
        await store.write(asset, sourceBlob)
        const verifiedBlob = await store.read(asset)
        if (
          !verifiedBlob
          || verifiedBlob.size !== sourceBlob.size
          || verifiedBlob.type !== sourceBlob.type
        ) {
          throw new Error('stored Blob failed size or MIME verification')
        }
        const integrity = await hashImageContent(sourceBlob)
        await verifyImageContent(verifiedBlob, integrity)
        migratedBatch.push({ id: imageId, integrity })
      } catch (error) {
        console.warn(`[ImageDataMigration] Failed to migrate image ${imageId}:`, error)
        failedImageIds.push(imageId)
      }
    }

    if (migratedBatch.length > 0) {
      await repository.finalizeImages(migratedBatch)
      migratedCount += migratedBatch.length
    }
  }

  const status: ImageDataMigrationStatus = {
    version: IMAGE_BLOB_MIGRATION_VERSION,
    status: failedImageIds.length === 0 ? 'complete' : 'partial',
    migratedCount,
    failedImageIds,
    updatedAt: now(),
  }
  await repository.saveStatus(status)
  return status
}
