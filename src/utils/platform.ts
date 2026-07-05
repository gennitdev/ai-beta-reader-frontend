import { Capacitor } from '@capacitor/core'

export function isNativeMobileRuntime(): boolean {
  try {
    const platform = Capacitor.getPlatform()
    return platform === 'ios' || platform === 'android'
  } catch {
    return false
  }
}

export function isDesktopAppRuntime(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  if (window.desktopImages) {
    return true
  }

  try {
    return Capacitor.getPlatform() === 'electron'
  } catch {
    return false
  }
}
