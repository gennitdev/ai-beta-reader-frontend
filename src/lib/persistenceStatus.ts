import { ref } from 'vue'

export const persistenceError = ref<string | null>(null)
export const isRetryingPersistence = ref(false)

export function reportPersistenceFailure(): void {
  persistenceError.value = 'Your latest changes could not be saved to this device. Keep the app open and retry.'
}

export function reportPersistenceSuccess(): void {
  persistenceError.value = null
}
