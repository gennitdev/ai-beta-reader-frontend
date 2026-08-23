import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { hasOpenAIApiKey, saveOpenAIApiKey, removeOpenAIApiKey, isOpenAIApiKeySecurelyStored } =
  vi.hoisted(() => ({
    hasOpenAIApiKey: vi.fn(),
    saveOpenAIApiKey: vi.fn(),
    removeOpenAIApiKey: vi.fn(),
    isOpenAIApiKeySecurelyStored: vi.fn(),
  }))

vi.mock('@/lib/apiKeyStorage', () => ({
  hasOpenAIApiKey,
  saveOpenAIApiKey,
  removeOpenAIApiKey,
  isOpenAIApiKeySecurelyStored,
}))

import { useApiKey } from '@/composables/useApiKey'

beforeEach(() => {
  vi.clearAllMocks()
  hasOpenAIApiKey.mockResolvedValue(false)
  saveOpenAIApiKey.mockResolvedValue(undefined)
  removeOpenAIApiKey.mockResolvedValue(undefined)
  isOpenAIApiKeySecurelyStored.mockReturnValue(false)
  vi.stubGlobal('confirm', vi.fn(() => true))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useApiKey', () => {
  it('reflects whether secure storage backs the key', () => {
    isOpenAIApiKeySecurelyStored.mockReturnValue(true)
    expect(useApiKey().usesSecureStorage).toBe(true)
  })

  it('marks a stored key as present after loading', async () => {
    hasOpenAIApiKey.mockResolvedValue(true)
    const api = useApiKey()
    await api.loadApiKey()

    expect(api.hasStoredApiKey.value).toBe(true)
    expect(api.apiKeyMessageType.value).toBe('')
  })

  it('surfaces an error when loading the key fails', async () => {
    hasOpenAIApiKey.mockRejectedValue(new Error('storage locked'))
    const api = useApiKey()
    await api.loadApiKey()

    expect(api.hasStoredApiKey.value).toBe(false)
    expect(api.apiKeyMessage.value).toBe('storage locked')
    expect(api.apiKeyMessageType.value).toBe('error')
  })

  it('rejects an empty key without touching storage', async () => {
    const api = useApiKey()
    api.openaiApiKey.value = '   '
    await api.saveApiKey()

    expect(saveOpenAIApiKey).not.toHaveBeenCalled()
    expect(api.apiKeyMessage.value).toBe('Please enter an API key')
    expect(api.apiKeyMessageType.value).toBe('error')
  })

  it('rejects a key that is not prefixed with "sk-"', async () => {
    const api = useApiKey()
    api.openaiApiKey.value = 'nope-123'
    await api.saveApiKey()

    expect(saveOpenAIApiKey).not.toHaveBeenCalled()
    expect(api.apiKeyMessage.value).toContain('sk-')
    expect(api.apiKeyMessageType.value).toBe('error')
  })

  it('saves a valid key, then clears the form and flags it stored', async () => {
    const api = useApiKey()
    api.openaiApiKey.value = '  sk-valid-key  '
    api.showApiKey.value = true
    await api.saveApiKey()

    expect(saveOpenAIApiKey).toHaveBeenCalledWith('sk-valid-key')
    expect(api.hasStoredApiKey.value).toBe(true)
    expect(api.openaiApiKey.value).toBe('')
    expect(api.showApiKey.value).toBe(false)
    expect(api.apiKeyMessageType.value).toBe('success')
  })

  it('surfaces an error when saving the key fails', async () => {
    saveOpenAIApiKey.mockRejectedValue(new Error('could not verify'))
    const api = useApiKey()
    api.openaiApiKey.value = 'sk-boom'
    await api.saveApiKey()

    expect(api.hasStoredApiKey.value).toBe(false)
    expect(api.apiKeyMessage.value).toBe('could not verify')
    expect(api.apiKeyMessageType.value).toBe('error')
  })

  it('removes the key after confirmation', async () => {
    hasOpenAIApiKey.mockResolvedValue(true)
    const api = useApiKey()
    await api.loadApiKey()
    await api.removeApiKey()

    expect(removeOpenAIApiKey).toHaveBeenCalledOnce()
    expect(api.hasStoredApiKey.value).toBe(false)
    expect(api.apiKeyMessageType.value).toBe('success')
  })

  it('does not remove the key when the user cancels the confirmation', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false))
    const api = useApiKey()
    await api.removeApiKey()

    expect(removeOpenAIApiKey).not.toHaveBeenCalled()
  })
})
