import { ref } from 'vue'

const STORAGE_KEY = 'openai_api_key'

/**
 * Manages the user's OpenAI API key: loading from and persisting to
 * localStorage, with basic validation and transient status messaging.
 */
export function useApiKey() {
  const openaiApiKey = ref('')
  const showApiKey = ref(false)
  const apiKeyMessage = ref('')
  const apiKeyMessageType = ref<'success' | 'error' | ''>('')

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

  const loadApiKey = () => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      openaiApiKey.value = stored
    }
  }

  const saveApiKey = () => {
    if (!openaiApiKey.value.trim()) {
      flashMessage('Please enter an API key', 'error')
      return
    }

    if (!openaiApiKey.value.startsWith('sk-')) {
      flashMessage('API key should start with "sk-"', 'error')
      return
    }

    localStorage.setItem(STORAGE_KEY, openaiApiKey.value)
    flashMessage('API key saved successfully!', 'success')
  }

  const removeApiKey = () => {
    if (!confirm('Are you sure you want to remove your OpenAI API key?')) return

    localStorage.removeItem(STORAGE_KEY)
    openaiApiKey.value = ''
    flashMessage('API key removed', 'success')
  }

  return {
    openaiApiKey,
    showApiKey,
    apiKeyMessage,
    apiKeyMessageType,
    loadApiKey,
    saveApiKey,
    removeApiKey,
  }
}
