import type { RecoveryBundleMetadata } from '@/lib/recovery/model'

export interface DesktopRecoveryBridge {
  write(payload: { metadata: RecoveryBundleMetadata; bytes: Uint8Array }): Promise<void>
  read(id: string): Promise<{ metadata: RecoveryBundleMetadata; bytes: Uint8Array } | null>
  list(): Promise<RecoveryBundleMetadata[]>
  delete(id: string): Promise<void>
}

declare global {
  interface Window {
    desktopRecovery?: DesktopRecoveryBridge
  }
}
