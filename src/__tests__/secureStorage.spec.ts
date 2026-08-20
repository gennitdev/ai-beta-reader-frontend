import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getSecureValue,
  removeSecureValue,
  setSecureValue,
  supportsSecureStorage,
} from '@/lib/secureStorage'

const state = vi.hoisted(() => ({
  platform: 'web' as 'web' | 'android' | 'ios' | 'electron',
  nativeStore: new Map<string, string>(),
  electronStore: new Map<string, string>(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => state.platform,
    isNativePlatform: () => state.platform === 'android' || state.platform === 'ios',
  },
}))

vi.mock('@aparajita/capacitor-secure-storage', () => ({
  SecureStorage: {
    getItem: async (key: string) => state.nativeStore.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      state.nativeStore.set(key, value)
    },
    removeItem: async (key: string) => {
      state.nativeStore.delete(key)
    },
  },
}))

interface ElectronBridge {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}

function installElectronBridge(): void {
  ;(globalThis as { electronSecureStorage?: ElectronBridge }).electronSecureStorage = {
    get: async (key) => state.electronStore.get(key) ?? null,
    set: async (key, value) => {
      state.electronStore.set(key, value)
    },
    remove: async (key) => {
      state.electronStore.delete(key)
    },
  }
}

beforeEach(() => {
  state.platform = 'web'
  state.nativeStore.clear()
  state.electronStore.clear()
  delete (globalThis as { electronSecureStorage?: ElectronBridge }).electronSecureStorage
})

afterEach(() => {
  delete (globalThis as { electronSecureStorage?: ElectronBridge }).electronSecureStorage
})

describe('platform secure storage', () => {
  it('reports support only for native and Electron platforms', () => {
    expect(supportsSecureStorage()).toBe(false)
    state.platform = 'android'
    expect(supportsSecureStorage()).toBe(true)
    state.platform = 'electron'
    expect(supportsSecureStorage()).toBe(true)
  })

  it('rejects secure storage operations in a browser', async () => {
    await expect(getSecureValue('secret')).rejects.toThrow(/unavailable in this browser/)
    await expect(setSecureValue('secret', 'value')).rejects.toThrow(/unavailable in this browser/)
    await expect(removeSecureValue('secret')).rejects.toThrow(/unavailable in this browser/)
  })

  it('round-trips values through native secure storage', async () => {
    state.platform = 'android'

    await setSecureValue('secret', 'native-value')
    expect(await getSecureValue('secret')).toBe('native-value')
    await removeSecureValue('secret')
    expect(await getSecureValue('secret')).toBeNull()
  })

  it('round-trips values through the Electron bridge', async () => {
    state.platform = 'electron'
    installElectronBridge()

    await setSecureValue('secret', 'desktop-value')
    expect(await getSecureValue('secret')).toBe('desktop-value')
    await removeSecureValue('secret')
    expect(await getSecureValue('secret')).toBeNull()
  })

  it('fails explicitly when the Electron bridge is missing', async () => {
    state.platform = 'electron'

    await expect(getSecureValue('secret')).rejects.toThrow(/Electron secure storage is unavailable/)
  })
})
