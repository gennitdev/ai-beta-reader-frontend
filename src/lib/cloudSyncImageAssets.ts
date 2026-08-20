import type { ImageAsset, ImageAssetType } from '@/lib/database'
import { normalizeImageAssetImportRows, type ImportRow } from '@/lib/databaseImportExport'
import {
  blobToDataUrl,
  dataUrlToBlob,
  type ImageContentStore,
} from '@/lib/imageContentStore'

export interface BackupImageProcessingResult {
  rows: Record<string, unknown>[]
  assets: ImageAsset[]
  missingImageIds: string[]
}

export interface ImageContentSnapshot {
  asset: ImageAsset
  blob: Blob | null
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function toImageAsset(row: Record<string, unknown>): ImageAsset {
  const id = toNullableString(row.id)
  const bookId = toNullableString(row.book_id)
  const fileName = toNullableString(row.file_name)
  const filePath = toNullableString(row.file_path)
  if (!id || !bookId || !fileName || !filePath) {
    throw new Error('Backup contains an image row with missing required metadata.')
  }

  return {
    id,
    book_id: bookId,
    chapter_id: toNullableString(row.chapter_id),
    asset_type: String(row.asset_type ?? 'chapter') as ImageAssetType,
    file_name: fileName,
    file_path: filePath,
    mime_type: toNullableString(row.mime_type),
    image_data: toNullableString(row.image_data),
    notes: String(row.notes ?? ''),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

function normalizeRows(rows: ImportRow[]): Record<string, unknown>[] {
  return normalizeImageAssetImportRows(rows).map((row) => row as Record<string, unknown>)
}

export async function enrichImageRowsForBackup(
  rows: ImportRow[],
  store: ImageContentStore,
): Promise<BackupImageProcessingResult> {
  const normalizedRows = normalizeRows(rows)
  const assets = normalizedRows.map(toImageAsset)
  const missingImageIds: string[] = []

  for (let index = 0; index < normalizedRows.length; index += 1) {
    const row = normalizedRows[index]
    const asset = assets[index]
    if (asset.image_data) continue

    const blob = await store.read(asset)
    if (!blob) {
      missingImageIds.push(asset.id)
      continue
    }
    row.image_data = await blobToDataUrl(blob)
  }

  return { rows: normalizedRows, assets, missingImageIds }
}

export async function restoreImageRows(
  rows: ImportRow[],
  store: ImageContentStore,
): Promise<BackupImageProcessingResult> {
  const normalizedRows = normalizeRows(rows)
  const assets = normalizedRows.map(toImageAsset)
  const missingImageIds: string[] = []

  for (let index = 0; index < normalizedRows.length; index += 1) {
    const row = normalizedRows[index]
    const asset = assets[index]
    if (!asset.image_data) {
      missingImageIds.push(asset.id)
      row.image_data = null
      continue
    }

    try {
      const blob = dataUrlToBlob(asset.image_data)
      await store.write(asset, blob)
      const verifiedBlob = await store.read(asset)
      if (!verifiedBlob || verifiedBlob.size !== blob.size) {
        throw new Error('the stored image failed verification')
      }
      row.image_data = null
      asset.image_data = null
    } catch (error) {
      throw new Error(
        `Failed to restore image ${asset.file_name} (${asset.id}): ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  return { rows: normalizedRows, assets, missingImageIds }
}

/** Capture content that a restore may overwrite so a later database failure can undo it. */
export async function captureImageContentSnapshot(
  rows: ImportRow[],
  store: ImageContentStore,
): Promise<ImageContentSnapshot[]> {
  const assets = normalizeRows(rows).map(toImageAsset)
  return Promise.all(assets.map(async (asset) => ({
    asset,
    blob: await store.read(asset),
  })))
}

/** Best-effort all entries before reporting rollback failures to the caller. */
export async function restoreImageContentSnapshot(
  snapshot: ImageContentSnapshot[],
  store: ImageContentStore,
): Promise<void> {
  const failures: string[] = []
  for (const { asset, blob } of snapshot) {
    try {
      if (blob) await store.write(asset, blob)
      else await store.delete(asset)
    } catch (error) {
      failures.push(`${asset.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (failures.length > 0) {
    throw new Error(`Failed to roll back restored image content (${failures.join('; ')})`)
  }
}

export function stripImageDataFromRows(rows: ImportRow[]): BackupImageProcessingResult {
  const normalizedRows = normalizeRows(rows)
  const assets = normalizedRows.map(toImageAsset)
  const missingImageIds: string[] = []

  normalizedRows.forEach((row, index) => {
    if (!assets[index].image_data) missingImageIds.push(assets[index].id)
    row.image_data = null
    assets[index].image_data = null
  })

  return { rows: normalizedRows, assets, missingImageIds }
}
