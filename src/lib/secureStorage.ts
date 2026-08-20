import { Capacitor } from '@capacitor/core'
import { SecureStorage } from '@aparajita/capacitor-secure-storage'

interface ElectronSecureStorage {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}

function electronBridge(): ElectronSecureStorage | null {
  return (globalThis as { electronSecureStorage?: ElectronSecureStorage }).electronSecureStorage ?? null
}

export function supportsSecureStorage(): boolean {
  return Capacitor.getPlatform() === 'electron' || Capacitor.isNativePlatform()
}

function requireElectronBridge(): ElectronSecureStorage {
  const bridge = electronBridge()
  if (!bridge) {
    throw new Error('Electron secure storage is unavailable.')
  }
  return bridge
}

export async function getSecureValue(key: string): Promise<string | null> {
  if (Capacitor.getPlatform() === 'electron') {
    return requireElectronBridge().get(key)
  }
  if (Capacitor.isNativePlatform()) {
    return SecureStorage.getItem(key)
  }
  throw new Error('Secure storage is unavailable in this browser.')
}

export async function setSecureValue(key: string, value: string): Promise<void> {
  if (Capacitor.getPlatform() === 'electron') {
    await requireElectronBridge().set(key, value)
    return
  }
  if (Capacitor.isNativePlatform()) {
    await SecureStorage.setItem(key, value)
    return
  }
  throw new Error('Secure storage is unavailable in this browser.')
}

export async function removeSecureValue(key: string): Promise<void> {
  if (Capacitor.getPlatform() === 'electron') {
    await requireElectronBridge().remove(key)
    return
  }
  if (Capacitor.isNativePlatform()) {
    await SecureStorage.removeItem(key)
    return
  }
  throw new Error('Secure storage is unavailable in this browser.')
}
