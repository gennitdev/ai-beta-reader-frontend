import type { ImageAsset } from '@/lib/database'
import { dataUrlToBlob, type ImageContentStore } from '@/lib/imageContentStore'

export const IMAGE_BLOB_MIGRATION_VERSION = 1
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
  clearImageData(imageIds: string[]): Promise<void>
  flush(): Promise<void>
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
    const migratedBatchIds: string[] = []

    for (const imageId of batchIds) {
      const asset = assetsById.get(imageId)
      if (!asset?.image_data) {
        failedImageIds.push(imageId)
        continue
      }

      try {
        const sourceBlob = dataUrlToBlob(asset.image_data)
        await store.write(asset, sourceBlob)
        const verifiedBlob = await store.read(asset)
        if (
          !verifiedBlob
          || verifiedBlob.size !== sourceBlob.size
          || verifiedBlob.type !== sourceBlob.type
        ) {
          throw new Error('stored Blob failed size or MIME verification')
        }
        migratedBatchIds.push(imageId)
      } catch (error) {
        console.warn(`[ImageDataMigration] Failed to migrate image ${imageId}:`, error)
        failedImageIds.push(imageId)
      }
    }

    if (migratedBatchIds.length > 0) {
      await repository.clearImageData(migratedBatchIds)
      await repository.flush()
      migratedCount += migratedBatchIds.length
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
