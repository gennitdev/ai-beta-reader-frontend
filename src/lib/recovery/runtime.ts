import { Capacitor } from '@capacitor/core'
import type { RecoveryStore } from './model'
import { IndexedDbRecoveryStore } from './adapters/indexedDb'
import { DesktopRecoveryStore } from './adapters/desktop'
import { NativeRecoveryStore } from './adapters/native'

export function createRuntimeRecoveryStore(): RecoveryStore {
  if (typeof window !== 'undefined' && window.desktopRecovery) {
    return new DesktopRecoveryStore(window.desktopRecovery)
  }
  if (Capacitor.isNativePlatform()) return new NativeRecoveryStore()
  // Construct lazily so environments without IndexedDB can still render the
  // settings screen and surface a recoverable storage error from the action.
  let browserStore: IndexedDbRecoveryStore | undefined
  const getBrowserStore = () => (browserStore ??= new IndexedDbRecoveryStore())
  return {
    write: (bundle) => getBrowserStore().write(bundle),
    read: (id) => getBrowserStore().read(id),
    list: () => getBrowserStore().list(),
    delete: (id) => getBrowserStore().delete(id),
  }
}
