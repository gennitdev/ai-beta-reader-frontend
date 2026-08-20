import { ref } from 'vue'
import {
  hasOpenAIApiKey,
  isOpenAIApiKeySecurelyStored,
  removeOpenAIApiKey,
  saveOpenAIApiKey,
} from '@/lib/apiKeyStorage'

/**
 * Manages the user's OpenAI API key without keeping the stored plaintext in
 * the Settings form. Desktop/native builds use OS-backed secure storage.
 */
export function useApiKey() {
  const openaiApiKey = ref('')
  const showApiKey = ref(false)
  const apiKeyMessage = ref('')
  const apiKeyMessageType = ref<'success' | 'error' | ''>('')
  const hasStoredApiKey = ref(false)
  const usesSecureStorage = isOpenAIApiKeySecurelyStored()

  const flashMessage = (message: string, type: 'success' | 'error') => {
    apiKeyMessage.value = message
    apiKeyMessageType.value = type
    if (type === 'success') {
      setTimeout(() => {
        apiKeyMessage.value = ''
        apiKeyMessageType.value = ''
      }, 3000)
    }
  }

  const loadApiKey = async () => {
    try {
      hasStoredApiKey.value = await hasOpenAIApiKey()
    } catch (error) {
      flashMessage(error instanceof Error ? error.message : 'Failed to load API key', 'error')
    }
  }

  const saveApiKey = async () => {
    const apiKey = openaiApiKey.value.trim()
    if (!apiKey) {
      flashMessage('Please enter an API key', 'error')
      return
    }

    if (!apiKey.startsWith('sk-')) {
      flashMessage('API key should start with "sk-"', 'error')
      return
    }

    try {
      await saveOpenAIApiKey(apiKey)
      hasStoredApiKey.value = true
      openaiApiKey.value = ''
      showApiKey.value = false
      flashMessage('API key saved successfully!', 'success')
    } catch (error) {
      flashMessage(error instanceof Error ? error.message : 'Failed to save API key', 'error')
    }
  }

  const removeApiKey = async () => {
    if (!confirm('Are you sure you want to remove your OpenAI API key?')) return

    try {
      await removeOpenAIApiKey()
      hasStoredApiKey.value = false
      openaiApiKey.value = ''
      flashMessage('API key removed', 'success')
    } catch (error) {
      flashMessage(error instanceof Error ? error.message : 'Failed to remove API key', 'error')
    }
  }

  return {
    openaiApiKey,
    showApiKey,
    apiKeyMessage,
    apiKeyMessageType,
    hasStoredApiKey,
    usesSecureStorage,
    loadApiKey,
    saveApiKey,
    removeApiKey,
  }
}
