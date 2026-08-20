// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  loadOpenAIApiKey,
  OPENAI_API_KEY_STORAGE_KEY,
  removeOpenAIApiKey,
  saveOpenAIApiKey,
} from '@/lib/apiKeyStorage'

const storage = vi.hoisted(() => ({
  secure: new Map<string, string>(),
  supported: false,
  failWrite: false,
  mismatchRead: false,
}))

vi.mock('@/lib/secureStorage', () => ({
  supportsSecureStorage: () => storage.supported,
  getSecureValue: async (key: string) => {
    if (storage.mismatchRead && storage.secure.has(key)) return 'different-value'
    return storage.secure.get(key) ?? null
  },
  setSecureValue: async (key: string, value: string) => {
    if (storage.failWrite) throw new Error('Secure storage failed')
    storage.secure.set(key, value)
  },
  removeSecureValue: async (key: string) => {
    storage.secure.delete(key)
  },
}))

beforeEach(() => {
  localStorage.clear()
  storage.secure.clear()
  storage.supported = false
  storage.failWrite = false
  storage.mismatchRead = false
})

describe('OpenAI API key storage', () => {
  it('uses browser storage when secure storage is unavailable', async () => {
    await saveOpenAIApiKey('sk-browser')

    expect(localStorage.getItem(OPENAI_API_KEY_STORAGE_KEY)).toBe('sk-browser')
    expect(await loadOpenAIApiKey()).toBe('sk-browser')
    expect(storage.secure.size).toBe(0)
  })

  it('stores and loads a key from secure storage', async () => {
    storage.supported = true

    await saveOpenAIApiKey('sk-secure')

    expect(storage.secure.get(OPENAI_API_KEY_STORAGE_KEY)).toBe('sk-secure')
    expect(localStorage.getItem(OPENAI_API_KEY_STORAGE_KEY)).toBeNull()
    expect(await loadOpenAIApiKey()).toBe('sk-secure')
  })

  it('migrates a legacy plaintext key after verifying the secure copy', async () => {
    storage.supported = true
    localStorage.setItem(OPENAI_API_KEY_STORAGE_KEY, 'sk-legacy')

    expect(await loadOpenAIApiKey()).toBe('sk-legacy')
    expect(storage.secure.get(OPENAI_API_KEY_STORAGE_KEY)).toBe('sk-legacy')
    expect(localStorage.getItem(OPENAI_API_KEY_STORAGE_KEY)).toBeNull()
  })

  it('removes a stale plaintext copy when a secure key already exists', async () => {
    storage.supported = true
    storage.secure.set(OPENAI_API_KEY_STORAGE_KEY, 'sk-secure')
    localStorage.setItem(OPENAI_API_KEY_STORAGE_KEY, 'sk-stale')

    expect(await loadOpenAIApiKey()).toBe('sk-secure')
    expect(localStorage.getItem(OPENAI_API_KEY_STORAGE_KEY)).toBeNull()
  })

  it('preserves the legacy key when a secure write fails', async () => {
    storage.supported = true
    storage.failWrite = true
    localStorage.setItem(OPENAI_API_KEY_STORAGE_KEY, 'sk-legacy')

    await expect(loadOpenAIApiKey()).rejects.toThrow('Secure storage failed')
    expect(localStorage.getItem(OPENAI_API_KEY_STORAGE_KEY)).toBe('sk-legacy')
  })

  it('preserves the legacy key when secure read-back verification fails', async () => {
    storage.supported = true
    storage.mismatchRead = true
    localStorage.setItem(OPENAI_API_KEY_STORAGE_KEY, 'sk-legacy')

    await expect(loadOpenAIApiKey()).rejects.toThrow(/could not be verified/)
    expect(localStorage.getItem(OPENAI_API_KEY_STORAGE_KEY)).toBe('sk-legacy')
  })

  it('removes secure and legacy copies', async () => {
    storage.supported = true
    storage.secure.set(OPENAI_API_KEY_STORAGE_KEY, 'sk-secure')
    localStorage.setItem(OPENAI_API_KEY_STORAGE_KEY, 'sk-legacy')

    await removeOpenAIApiKey()

    expect(storage.secure.has(OPENAI_API_KEY_STORAGE_KEY)).toBe(false)
    expect(localStorage.getItem(OPENAI_API_KEY_STORAGE_KEY)).toBeNull()
  })
})
