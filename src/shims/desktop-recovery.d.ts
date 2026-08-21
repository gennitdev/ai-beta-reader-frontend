import type { RecoveryBundleMetadata } from '@/lib/recovery/model'

export interface DesktopRecoveryBridge {
  write(payload: { metadata: RecoveryBundleMetadata; bytesBase64: string }): Promise<void>
  read(id: string): Promise<{ metadata: RecoveryBundleMetadata; bytesBase64: string } | null>
  list(): Promise<RecoveryBundleMetadata[]>
  delete(id: string): Promise<void>
}

declare global {
  interface Window {
    desktopRecovery?: DesktopRecoveryBridge
  }
}
