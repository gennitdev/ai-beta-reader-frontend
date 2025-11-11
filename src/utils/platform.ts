import { Capacitor } from '@capacitor/core'

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
