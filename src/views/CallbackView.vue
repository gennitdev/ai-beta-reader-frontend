<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuth0 } from '@auth0/auth0-vue'
import { useRouter } from 'vue-router'

const { handleRedirectCallback, isLoading } = useAuth0()
const router = useRouter()

onMounted(async () => {
  try {
    const result = await handleRedirectCallback()
    const targetUrl = result?.appState?.target || '/books'
    router.push(targetUrl)
  } catch (error) {
    console.error('Auth callback error:', error)
    router.push('/books')
  }
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center">
    <div class="text-center">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
      <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">Completing login...</h2>
      <p class="text-gray-600 dark:text-gray-400">Please wait while we redirect you.</p>
    </div>
  </div>
</template>