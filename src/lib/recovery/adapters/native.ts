import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { assertRecoveryId, parseRecoveryMetadata, type RecoveryBundleMetadata, type RecoveryStore, type StoredRecoveryBundle } from '../model'

const RECOVERY_DIRECTORY = 'recovery'

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
}

export class NativeRecoveryStore implements RecoveryStore {
  private async ensureDirectory(): Promise<void> {
    await Filesystem.mkdir({ path: RECOVERY_DIRECTORY, directory: Directory.Data, recursive: true }).catch((error) => {
      if (!String(error).toLowerCase().includes('exist')) throw error
    })
  }

  async write(bundle: StoredRecoveryBundle): Promise<void> {
    assertRecoveryId(bundle.metadata.id)
    await this.ensureDirectory()
    await Filesystem.writeFile({
      path: `${RECOVERY_DIRECTORY}/${bundle.metadata.id}.zip`, directory: Directory.Data,
      data: bytesToBase64(bundle.bytes), recursive: true,
    })
    await Filesystem.writeFile({
      path: `${RECOVERY_DIRECTORY}/${bundle.metadata.id}.json`, directory: Directory.Data,
      data: JSON.stringify(bundle.metadata), encoding: Encoding.UTF8, recursive: true,
    })
  }

  async read(id: string): Promise<StoredRecoveryBundle | null> {
    assertRecoveryId(id)
    try {
      const [metadata, bytes] = await Promise.all([
        Filesystem.readFile({ path: `${RECOVERY_DIRECTORY}/${id}.json`, directory: Directory.Data, encoding: Encoding.UTF8 }),
        Filesystem.readFile({ path: `${RECOVERY_DIRECTORY}/${id}.zip`, directory: Directory.Data }),
      ])
      const parsedMetadata = parseRecoveryMetadata(JSON.parse(String(metadata.data)))
      if (parsedMetadata.id !== id) throw new Error('Recovery metadata ID does not match its requested ID.')
      return {
        metadata: parsedMetadata,
        bytes: base64ToBytes(String(bytes.data)),
      }
    } catch (error) {
      if (String(error).toLowerCase().includes('not found')) return null
      throw error
    }
  }

  async list(): Promise<RecoveryBundleMetadata[]> {
    await this.ensureDirectory()
    const directory = await Filesystem.readdir({ path: RECOVERY_DIRECTORY, directory: Directory.Data })
    const metadataFiles = directory.files.map((file) => file.name).filter((name) => name.endsWith('.json'))
    const values = await Promise.all(metadataFiles.map(async (name) => {
      const result = await Filesystem.readFile({ path: `${RECOVERY_DIRECTORY}/${name}`, directory: Directory.Data, encoding: Encoding.UTF8 })
      const metadata = parseRecoveryMetadata(JSON.parse(String(result.data)))
      if (`${metadata.id}.json` !== name) throw new Error('Recovery metadata ID does not match its filename.')
      return metadata
    }))
    return values
  }

  async delete(id: string): Promise<void> {
    assertRecoveryId(id)
    await Promise.all(['zip', 'json'].map((extension) => Filesystem.deleteFile({
      path: `${RECOVERY_DIRECTORY}/${id}.${extension}`, directory: Directory.Data,
    }).catch((error) => {
      if (!String(error).toLowerCase().includes('not found')) throw error
    })))
  }
}
