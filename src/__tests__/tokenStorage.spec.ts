import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveTokens, loadTokens, clearTokens, type StoredTokenSet } from '@/lib/tokenStorage'

const STORAGE_KEY = 'googleOAuthTokens'

const { store } = vi.hoisted(() => ({ store: new Map<string, string>() }))

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    set: async ({ key, value }: { key: string; value: string }) => {
      store.set(key, value)
    },
    get: async ({ key }: { key: string }) => ({
      value: store.has(key) ? store.get(key)! : null,
    }),
    remove: async ({ key }: { key: string }) => {
      store.delete(key)
    },
  },
}))

beforeEach(() => {
  store.clear()
})

function tokens(): StoredTokenSet {
  return {
    accessToken: 'access-123',
    refreshToken: 'refresh-456',
    expiresAt: 1_800_000_000_000,
  }
}

describe('tokenStorage', () => {
  it('round-trips tokens through save and load', async () => {
    await saveTokens(tokens())
    expect(await loadTokens()).toEqual(tokens())
  })

  it('returns null when no tokens are stored', async () => {
    expect(await loadTokens()).toBeNull()
  })

  it('returns null when the stored value is not valid JSON', async () => {
    store.set(STORAGE_KEY, 'not-json{')
    expect(await loadTokens()).toBeNull()
  })

  it('returns null when the stored token is missing an access token', async () => {
    store.set(STORAGE_KEY, JSON.stringify({ expiresAt: 1_800_000_000_000 }))
    expect(await loadTokens()).toBeNull()
  })

  it('returns null when expiresAt is not a number', async () => {
    store.set(STORAGE_KEY, JSON.stringify({ accessToken: 'a', expiresAt: 'soon' }))
    expect(await loadTokens()).toBeNull()
  })

  it('clears stored tokens', async () => {
    await saveTokens(tokens())
    await clearTokens()
    expect(await loadTokens()).toBeNull()
  })
})
