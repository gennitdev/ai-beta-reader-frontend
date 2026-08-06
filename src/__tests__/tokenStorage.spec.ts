import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveTokens, loadTokens, clearTokens, type StoredTokenSet } from '@/lib/tokenStorage'

const STORAGE_KEY = 'googleOAuthTokens'

const { prefsStore, secureStore, platform } = vi.hoisted(() => ({
  prefsStore: new Map<string, string>(),
  secureStore: new Map<string, string>(),
  platform: { value: 'ios' as 'ios' | 'android' | 'web' | 'electron' },
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => platform.value,
    isNativePlatform: () => platform.value === 'ios' || platform.value === 'android',
  },
}))

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    set: async ({ key, value }: { key: string; value: string }) => {
      prefsStore.set(key, value)
    },
    get: async ({ key }: { key: string }) => ({
      value: prefsStore.has(key) ? prefsStore.get(key)! : null,
    }),
    remove: async ({ key }: { key: string }) => {
      prefsStore.delete(key)
    },
  },
}))

vi.mock('@aparajita/capacitor-secure-storage', () => ({
  SecureStorage: {
    getItem: async (key: string) => (secureStore.has(key) ? secureStore.get(key)! : null),
    setItem: async (key: string, value: string) => {
      secureStore.set(key, value)
    },
    removeItem: async (key: string) => {
      secureStore.delete(key)
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
    get: async (key) => (secureStore.has(key) ? secureStore.get(key)! : null),
    set: async (key, value) => {
      secureStore.set(key, value)
    },
    remove: async (key) => {
      secureStore.delete(key)
    },
  }
}

function removeElectronBridge(): void {
  delete (globalThis as { electronSecureStorage?: ElectronBridge }).electronSecureStorage
}

beforeEach(() => {
  prefsStore.clear()
  secureStore.clear()
  platform.value = 'ios'
  removeElectronBridge()
})

afterEach(() => {
  removeElectronBridge()
})

function tokens(): StoredTokenSet {
  return {
    accessToken: 'access-123',
    refreshToken: 'refresh-456',
    expiresAt: 1_800_000_000_000,
  }
}

describe('tokenStorage', () => {
  it('returns null when no tokens are stored', async () => {
    expect(await loadTokens()).toBeNull()
  })

  describe('on a native platform', () => {
    it('round-trips tokens (including the refresh token) through secure storage', async () => {
      await saveTokens(tokens())
      // Persisted to the secure store, not plaintext Preferences.
      expect(secureStore.get(STORAGE_KEY)).toBeTruthy()
      expect(prefsStore.has(STORAGE_KEY)).toBe(false)
      expect(await loadTokens()).toEqual(tokens())
    })

    it('clears stored tokens', async () => {
      await saveTokens(tokens())
      await clearTokens()
      expect(await loadTokens()).toBeNull()
      expect(secureStore.has(STORAGE_KEY)).toBe(false)
    })

    it('migrates a legacy plaintext Preferences token into secure storage', async () => {
      // Simulate an older build that stored the token in plaintext Preferences.
      prefsStore.set(STORAGE_KEY, JSON.stringify(tokens()))

      const loaded = await loadTokens()
      expect(loaded).toEqual(tokens())
      // Moved into secure storage and the plaintext copy deleted.
      expect(secureStore.get(STORAGE_KEY)).toBeTruthy()
      expect(prefsStore.has(STORAGE_KEY)).toBe(false)
    })

    it('returns null when the secure value is not valid JSON', async () => {
      secureStore.set(STORAGE_KEY, 'not-json{')
      expect(await loadTokens()).toBeNull()
    })

    it('returns null when the stored token is missing an access token', async () => {
      secureStore.set(STORAGE_KEY, JSON.stringify({ expiresAt: 1_800_000_000_000 }))
      expect(await loadTokens()).toBeNull()
    })
  })

  describe('on Electron', () => {
    beforeEach(() => {
      platform.value = 'electron'
      installElectronBridge()
    })

    it('round-trips tokens through the safeStorage bridge', async () => {
      await saveTokens(tokens())
      expect(secureStore.get(STORAGE_KEY)).toBeTruthy()
      expect(prefsStore.has(STORAGE_KEY)).toBe(false)
      expect(await loadTokens()).toEqual(tokens())
    })

    it('migrates a legacy plaintext token into the secure bridge', async () => {
      prefsStore.set(STORAGE_KEY, JSON.stringify(tokens()))
      const loaded = await loadTokens()
      expect(loaded).toEqual(tokens())
      expect(secureStore.get(STORAGE_KEY)).toBeTruthy()
      expect(prefsStore.has(STORAGE_KEY)).toBe(false)
    })
  })

  describe('on the web platform', () => {
    beforeEach(() => {
      platform.value = 'web'
    })

    it('never persists a refresh token when saving', async () => {
      await saveTokens(tokens())
      const raw = JSON.parse(prefsStore.get(STORAGE_KEY)!)
      expect(raw.refreshToken).toBeNull()
      expect(raw.accessToken).toBe('access-123')
      // The secure backend is never touched on web.
      expect(secureStore.size).toBe(0)
    })

    it('drops a refresh token that an earlier build persisted', async () => {
      prefsStore.set(STORAGE_KEY, JSON.stringify(tokens()))
      const loaded = await loadTokens()
      expect(loaded?.refreshToken).toBeNull()
      expect(loaded?.accessToken).toBe('access-123')
    })

    it('returns null when the stored value is not valid JSON', async () => {
      prefsStore.set(STORAGE_KEY, 'not-json{')
      expect(await loadTokens()).toBeNull()
    })

    it('clears stored tokens', async () => {
      await saveTokens(tokens())
      await clearTokens()
      expect(await loadTokens()).toBeNull()
    })
  })
})
