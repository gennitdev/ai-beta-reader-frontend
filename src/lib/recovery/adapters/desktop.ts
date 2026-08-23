import { assertRecoveryId, parseRecoveryMetadata, type RecoveryStore, type StoredRecoveryBundle } from '../model'
import type { DesktopRecoveryBridge } from '@/shims/desktop-recovery'

export class DesktopRecoveryStore implements RecoveryStore {
  constructor(private readonly bridge: DesktopRecoveryBridge) {}

  async write(bundle: StoredRecoveryBundle): Promise<void> {
    assertRecoveryId(bundle.metadata.id)
    await this.bridge.write({ metadata: bundle.metadata, bytes: bundle.bytes })
  }

  async read(id: string): Promise<StoredRecoveryBundle | null> {
    assertRecoveryId(id)
    const result = await this.bridge.read(id)
    if (!result) return null
    const metadata = parseRecoveryMetadata(result.metadata)
    if (metadata.id !== id) throw new Error('Recovery metadata ID does not match its requested ID.')
    return { metadata, bytes: result.bytes }
  }

  async list() {
    return (await this.bridge.list()).map(parseRecoveryMetadata)
  }

  async delete(id: string): Promise<void> {
    assertRecoveryId(id)
    await this.bridge.delete(id)
  }
}
