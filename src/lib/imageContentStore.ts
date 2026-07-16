import type { ImageAsset } from '@/lib/database'
import {
  deleteIndexedDbValue,
  IMAGE_BLOBS_STORE,
  listIndexedDbKeys,
  readIndexedDbValue,
  writeIndexedDbValue,
} from '@/lib/indexedDbStorage'
import type { DesktopImagesBridge } from '@/shims/desktop-images'

export interface ImageContentStore {
  read(asset: ImageAsset): Promise<Blob | null>
  write(asset: ImageAsset, blob: Blob): Promise<void>
  delete(asset: ImageAsset): Promise<void>
  exists(asset: ImageAsset): Promise<boolean>
  listStoredIds?(): Promise<string[]>
}

interface IndexedDbImageRecord {
  blob: Blob
  byteSize: number
  updatedAt: string
}

export interface ImageContentReconciliation {
  missingImageIds: string[]
  orphanedImageIds: string[]
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
}

export class ElectronImageContentStore implements ImageContentStore {
  constructor(private readonly bridge: DesktopImagesBridge) {}

  async read(asset: ImageAsset): Promise<Blob | null> {
    if (!asset.file_path) return null
    const result = await this.bridge.readImageData({
      relativePath: asset.file_path,
      mimeType: asset.mime_type,
    })
    return dataUrlToBlob(result.dataUrl)
  }

  async write(asset: ImageAsset, blob: Blob): Promise<void> {
    if (!asset.file_path) throw new Error('Image path is required for Electron storage.')
    await this.bridge.writeImageData({
      relativePath: asset.file_path,
      dataUrl: await blobToDataUrl(blob),
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
