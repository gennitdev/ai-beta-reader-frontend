import { assertRecoveryId, parseRecoveryMetadata, type RecoveryStore, type StoredRecoveryBundle } from '../model'
import type { DesktopRecoveryBridge } from '@/shims/desktop-recovery'

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

export class DesktopRecoveryStore implements RecoveryStore {
  constructor(private readonly bridge: DesktopRecoveryBridge) {}

  async write(bundle: StoredRecoveryBundle): Promise<void> {
    assertRecoveryId(bundle.metadata.id)
    await this.bridge.write({ metadata: bundle.metadata, bytesBase64: bytesToBase64(bundle.bytes) })
  }

  async read(id: string): Promise<StoredRecoveryBundle | null> {
    assertRecoveryId(id)
    const result = await this.bridge.read(id)
    if (!result) return null
    const metadata = parseRecoveryMetadata(result.metadata)
    if (metadata.id !== id) throw new Error('Recovery metadata ID does not match its requested ID.')
    return { metadata, bytes: base64ToBytes(result.bytesBase64) }
  }

  async list() {
    return (await this.bridge.list()).map(parseRecoveryMetadata)
  }

  async delete(id: string): Promise<void> {
    assertRecoveryId(id)
    await this.bridge.delete(id)
  }
}
