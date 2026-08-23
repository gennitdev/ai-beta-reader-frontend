import type { ImageAsset } from '@/lib/database'
import {
  deleteIndexedDbValue,
  IMAGE_BLOBS_STORE,
  listIndexedDbKeys,
  readIndexedDbValue,
  writeIndexedDbValue,
} from '@/lib/indexedDbStorage'
import type { DesktopImagesBridge } from '@/shims/desktop-images'
import { Directory, Filesystem } from '@capacitor/filesystem'

export interface ImageContentStore {
  read(asset: ImageAsset): Promise<Blob | null>
  write(asset: ImageAsset, blob: Blob): Promise<void>
  delete(asset: ImageAsset): Promise<void>
  exists(asset: ImageAsset): Promise<boolean>
  listStoredIds?(): Promise<string[]>
  deleteStoredId?(imageId: string): Promise<void>
}

interface IndexedDbImageRecord {
  blob: Blob
  byteSize: number
  updatedAt: string
}

const NATIVE_IMAGE_DIRECTORY = 'images'

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
}

function assertNativeImageId(imageId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(imageId)) {
    throw new Error('The image ID is not safe for native storage.')
  }
}

function nativeImagePath(imageId: string): string {
  assertNativeImageId(imageId)
  return `${NATIVE_IMAGE_DIRECTORY}/${imageId}`
}

export async function getNativeImageUri(imageId: string): Promise<string> {
  const result = await Filesystem.getUri({
    path: nativeImagePath(imageId),
    directory: Directory.Data,
  })
  return result.uri
}

function isMissingNativeFile(error: unknown): boolean {
  const message = String(error).toLowerCase()
  return message.includes('not found') || message.includes('does not exist')
}

export function nativeImageStorageError(error: unknown, action: string): Error {
  const message = String(error).toLowerCase()
  if (message.includes('no space') || message.includes('enospc') || message.includes('quota')) {
    return new Error(
      `Device storage is full, so the image could not be ${action}. Free device space or remove images, then try again.`,
    )
  }
  if (message.includes('permission') || message.includes('denied')) {
    return new Error(
      `Android could not access app image storage, so the image could not be ${action}. Restart the app and try again.`,
    )
  }
  const detail = error instanceof Error ? ` ${error.message}` : ''
  return new Error(`The image could not be ${action} in Android app storage.${detail}`)
}

export interface ImageContentReconciliation {
  missingImageIds: string[]
  orphanedImageIds: string[]
}

export interface ImageContentCleanup extends ImageContentReconciliation {
  deletedOrphanIds: string[]
  failedOrphanIds: string[]
}

export interface CrossStoreImageDeletion {
  metadataDeleted: true
  contentDeleted: boolean
  orphanedContent: boolean
  contentError?: unknown
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const match = dataUrl.match(/^data:([^;,]+)?;base64,(.+)$/)
  if (!match) throw new Error('Invalid image data URL.')

  const binary = atob(match[2])
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: match[1] || 'application/octet-stream' })
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const chunkSize = 0x8000
  let binary = ''

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  const mimeType = blob.type || 'application/octet-stream'
  return `data:${mimeType};base64,${btoa(binary)}`
}

export class IndexedDbImageContentStore implements ImageContentStore {
  constructor(private readonly factory?: IDBFactory) {}

  async read(asset: ImageAsset): Promise<Blob | null> {
    const record = await readIndexedDbValue<IndexedDbImageRecord | Blob>(
      IMAGE_BLOBS_STORE,
      asset.id,
      this.factory,
    )
    if (!record) return null
    if (record instanceof Blob) return record
    if (!(record.blob instanceof Blob)) {
      throw new Error(`Stored image ${asset.id} is not a valid Blob.`)
    }
    if (record.byteSize !== record.blob.size) {
      throw new Error(`Stored image ${asset.id} failed its size check.`)
    }
    return record.blob
  }

  async write(asset: ImageAsset, blob: Blob): Promise<void> {
    const record: IndexedDbImageRecord = {
      blob,
      byteSize: blob.size,
      updatedAt: new Date().toISOString(),
    }
    await writeIndexedDbValue(IMAGE_BLOBS_STORE, asset.id, record, this.factory)
  }

  async delete(asset: ImageAsset): Promise<void> {
    await deleteIndexedDbValue(IMAGE_BLOBS_STORE, asset.id, this.factory)
  }

  async exists(asset: ImageAsset): Promise<boolean> {
    return (await this.read(asset)) !== null
  }

  async listStoredIds(): Promise<string[]> {
    const keys = await listIndexedDbKeys(IMAGE_BLOBS_STORE, this.factory)
    return keys.filter((key): key is string => typeof key === 'string')
  }

  async deleteStoredId(imageId: string): Promise<void> {
    await deleteIndexedDbValue(IMAGE_BLOBS_STORE, imageId, this.factory)
  }
}

export class ElectronImageContentStore implements ImageContentStore {
  constructor(private readonly bridge: DesktopImagesBridge) {}

  async read(asset: ImageAsset): Promise<Blob | null> {
    if (!asset.file_path) return null
    const result = await this.bridge.readImageData({
      relativePath: asset.file_path,
      mimeType: asset.mime_type,
    })
    return new Blob([result.bytes.slice().buffer], { type: result.mimeType })
  }

  async write(asset: ImageAsset, blob: Blob): Promise<void> {
    if (!asset.file_path) throw new Error('Image path is required for Electron storage.')
    await this.bridge.writeImageData({
      relativePath: asset.file_path,
      bytes: new Uint8Array(await blob.arrayBuffer()),
      mimeType: blob.type || asset.mime_type || 'application/octet-stream',
    })
  }

  async delete(asset: ImageAsset): Promise<void> {
    if (!asset.file_path) return
    await this.bridge.deleteImageFile({ relativePath: asset.file_path })
  }

  async exists(asset: ImageAsset): Promise<boolean> {
    try {
      return (await this.read(asset)) !== null
    } catch {
      return false
    }
  }
}

/** Stores Android image bytes in the app-private data directory, outside SQLite. */
export class CapacitorImageContentStore implements ImageContentStore {
  private async ensureDirectory(): Promise<void> {
    await Filesystem.mkdir({
      path: NATIVE_IMAGE_DIRECTORY,
      directory: Directory.Data,
      recursive: true,
    }).catch((error) => {
      if (!String(error).toLowerCase().includes('exist')) throw error
    })
  }

  async read(asset: ImageAsset): Promise<Blob | null> {
    try {
      const result = await Filesystem.readFile({
        path: nativeImagePath(asset.id),
        directory: Directory.Data,
      })
      if (typeof result.data !== 'string') {
        throw new Error(`Stored image ${asset.id} did not contain native file data.`)
      }
      return new Blob([base64ToBytes(result.data)], {
        type: asset.mime_type || 'application/octet-stream',
      })
    } catch (error) {
      if (isMissingNativeFile(error)) return null
      throw error
    }
  }

  async write(asset: ImageAsset, blob: Blob): Promise<void> {
    await this.ensureDirectory()
    await Filesystem.writeFile({
      path: nativeImagePath(asset.id),
      directory: Directory.Data,
      data: bytesToBase64(new Uint8Array(await blob.arrayBuffer())),
      recursive: true,
    })
  }

  async delete(asset: ImageAsset): Promise<void> {
    await this.deleteStoredId(asset.id)
  }

  async exists(asset: ImageAsset): Promise<boolean> {
    return (await this.read(asset)) !== null
  }

  async listStoredIds(): Promise<string[]> {
    await this.ensureDirectory()
    const result = await Filesystem.readdir({
      path: NATIVE_IMAGE_DIRECTORY,
      directory: Directory.Data,
    })
    return result.files.filter((entry) => entry.type !== 'directory').map((entry) => entry.name)
  }

  async deleteStoredId(imageId: string): Promise<void> {
    try {
      await Filesystem.deleteFile({
        path: nativeImagePath(imageId),
        directory: Directory.Data,
      })
    } catch (error) {
      if (!isMissingNativeFile(error)) throw error
    }
  }
}

export async function inspectImageContent(
  store: ImageContentStore,
  assets: ImageAsset[],
): Promise<ImageContentReconciliation> {
  const missingImageIds: string[] = []
  for (const asset of assets) {
    if (!(await store.exists(asset)) && !asset.image_data) {
      missingImageIds.push(asset.id)
    }
  }

  const referencedIds = new Set(assets.map((asset) => asset.id))
  const storedIds = store.listStoredIds ? await store.listStoredIds() : []
  const orphanedImageIds = storedIds.filter((id) => !referencedIds.has(id))

  return { missingImageIds, orphanedImageIds }
}

/**
 * Delete metadata before content so a cross-store failure can only leave an
 * unreferenced blob, never a live database record pointing at missing bytes.
 */
export async function deleteImageMetadataThenContent(
  asset: ImageAsset,
  deleteMetadata: (imageId: string) => Promise<void>,
  store: ImageContentStore,
  afterMetadataDelete: (imageId: string) => void = () => undefined,
): Promise<CrossStoreImageDeletion> {
  await deleteMetadata(asset.id)
  afterMetadataDelete(asset.id)

  try {
    await store.delete(asset)
    return { metadataDeleted: true, contentDeleted: true, orphanedContent: false }
  } catch (contentError) {
    return {
      metadataDeleted: true,
      contentDeleted: false,
      orphanedContent: true,
      contentError,
    }
  }
}

/** Remove content-store records that no longer have database metadata. */
export async function cleanupOrphanedImageContent(
  store: ImageContentStore,
  assets: ImageAsset[],
): Promise<ImageContentCleanup> {
  const reconciliation = await inspectImageContent(store, assets)
  const deletedOrphanIds: string[] = []
  const failedOrphanIds: string[] = []

  if (!store.deleteStoredId) {
    return { ...reconciliation, deletedOrphanIds, failedOrphanIds: [...reconciliation.orphanedImageIds] }
  }

  for (const imageId of reconciliation.orphanedImageIds) {
    try {
      await store.deleteStoredId(imageId)
      deletedOrphanIds.push(imageId)
    } catch {
      failedOrphanIds.push(imageId)
    }
  }

  return { ...reconciliation, deletedOrphanIds, failedOrphanIds }
}
