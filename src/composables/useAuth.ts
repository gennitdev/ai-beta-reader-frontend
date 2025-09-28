import { ref, watch } from 'vue'
import { useAuth0 } from '@auth0/auth0-vue'
import { createAuthService } from '@/services/api'

export function useAuthWithProfile() {
  const { isAuthenticated, isLoading, getAccessTokenSilently } = useAuth0()
  const profileInitialized = ref(false)
  const profileError = ref<string | null>(null)

  // Create auth service
  const authService = createAuthService(async () => {
    try {
      return await getAccessTokenSilently()
    } catch (error) {
      console.warn('Failed to get access token:', error)
      return undefined
    }
  })

  // Watch for authentication changes and initialize profile
  watch([isAuthenticated, isLoading], async ([authenticated, loading]) => {
    if (!loading && authenticated && !profileInitialized.value) {
      try {
        console.log('User authenticated, checking/creating profile...')

        // Try to get existing profile first
        try {
          await authService.getProfile()
          console.log('User profile already exists')
        } catch (error: any) {
          // If profile doesn't exist (404), create it
          if (error.response?.status === 404) {
            console.log('Creating user profile...')
            await authService.createProfile()
            console.log('User profile created successfully')
          } else {
            throw error
          }
        }

        profileInitialized.value = true
        profileError.value = null
      } catch (error: any) {
        console.error('Failed to initialize user profile:', error)
        profileError.value = error.response?.data?.error || error.message || 'Failed to initialize profile'
      }
    }
  }, { immediate: true })

  return {
    profileInitialized,
    profileError
  }
}