import {
  getSecureValue,
  removeSecureValue,
  setSecureValue,
  supportsSecureStorage,
} from '@/lib/secureStorage'

export const OPENAI_API_KEY_STORAGE_KEY = 'openai_api_key'

/**
 * Loads the user's key. Native and desktop builds migrate the legacy plaintext
 * localStorage value only after verifying that the secure copy can be read.
 */
export async function loadOpenAIApiKey(): Promise<string | null> {
  if (!supportsSecureStorage()) {
    return localStorage.getItem(OPENAI_API_KEY_STORAGE_KEY)
  }

  const secured = await getSecureValue(OPENAI_API_KEY_STORAGE_KEY)
  if (secured) {
    localStorage.removeItem(OPENAI_API_KEY_STORAGE_KEY)
    return secured
  }

  const legacy = localStorage.getItem(OPENAI_API_KEY_STORAGE_KEY)
  if (!legacy) return null

  await setSecureValue(OPENAI_API_KEY_STORAGE_KEY, legacy)
  const verified = await getSecureValue(OPENAI_API_KEY_STORAGE_KEY)
  if (verified !== legacy) {
    throw new Error('The OpenAI API key could not be verified in secure storage.')
  }

  localStorage.removeItem(OPENAI_API_KEY_STORAGE_KEY)
  return verified
}

export async function saveOpenAIApiKey(apiKey: string): Promise<void> {
  if (!supportsSecureStorage()) {
    localStorage.setItem(OPENAI_API_KEY_STORAGE_KEY, apiKey)
    return
  }

  await setSecureValue(OPENAI_API_KEY_STORAGE_KEY, apiKey)
  const verified = await getSecureValue(OPENAI_API_KEY_STORAGE_KEY)
  if (verified !== apiKey) {
    throw new Error('The OpenAI API key could not be verified in secure storage.')
  }
  localStorage.removeItem(OPENAI_API_KEY_STORAGE_KEY)
}

export async function removeOpenAIApiKey(): Promise<void> {
  if (supportsSecureStorage()) {
    await removeSecureValue(OPENAI_API_KEY_STORAGE_KEY)
  }
  localStorage.removeItem(OPENAI_API_KEY_STORAGE_KEY)
}

export async function hasOpenAIApiKey(): Promise<boolean> {
  return Boolean(await loadOpenAIApiKey())
}

export function isOpenAIApiKeySecurelyStored(): boolean {
  return supportsSecureStorage()
}
