<script setup lang="ts">
import { useAuth0 } from '@auth0/auth0-vue'
import { useRouter } from 'vue-router'
import { SparklesIcon, ChatBubbleLeftRightIcon, DocumentTextIcon } from '@heroicons/vue/24/outline'

const { isAuthenticated, loginWithRedirect } = useAuth0()
const router = useRouter()

const handleLogin = () => {
  loginWithRedirect()
}

const handleSignUp = () => {
  loginWithRedirect({
    authorizationParams: {
      screen_hint: 'signup'
    }
  })
}

// If already authenticated, redirect to books
if (isAuthenticated.value) {
  router.push('/books')
}
</script>

<template>
  <div class="min-h-[calc(100vh-4rem)] bg-white dark:bg-gray-900">
    <!-- Mobile Layout -->
    <div class="lg:hidden">
      <!-- Hero Image at top on mobile -->
      <div class="h-64 sm:h-80 overflow-hidden">
        <img
          src="/art-attack-RpSTMkZGKyE-unsplash.jpg"
          alt="Creative writing inspiration"
          class="w-full h-full object-cover"
        />
      </div>

      <!-- Content below image on mobile -->
      <div class="px-4 sm:px-6 py-12 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 relative">
        <div class="max-w-xl mx-auto text-center">
          <h1 class="text-4xl font-bold text-gray-900 dark:text-white mb-6 space-grotesk-logo">
            Beta Bot
          </h1>
          <p class="text-lg text-gray-600 dark:text-gray-300 mb-8">
            Your AI Beta Reader. Get intelligent feedback on your creative writing. Organize your manuscripts and receive AI-powered reviews.
          </p>

          <!-- CTA Buttons -->
          <div class="flex flex-col gap-3 mb-12">
            <button
              @click="handleSignUp"
              class="w-full inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-lg shadow-lg"
            >
              Get Started Free
            </button>
            <button
              @click="handleLogin"
              class="w-full inline-flex items-center justify-center px-6 py-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
            >
              Sign In
            </button>
          </div>

          <!-- Mobile Features -->
          <div class="space-y-6">
            <div class="flex items-center space-x-4 text-left">
              <DocumentTextIcon class="w-8 h-8 text-blue-600 flex-shrink-0" />
              <div>
                <h3 class="font-semibold text-gray-900 dark:text-white">Organize Your Writing</h3>
                <p class="text-sm text-gray-600 dark:text-gray-300">Keep your books and chapters organized with ease.</p>
              </div>
            </div>
            <div class="flex items-center space-x-4 text-left">
              <SparklesIcon class="w-8 h-8 text-blue-600 flex-shrink-0" />
              <div>
                <h3 class="font-semibold text-gray-900 dark:text-white">AI-Powered Reviews</h3>
                <p class="text-sm text-gray-600 dark:text-gray-300">Get contextual feedback that considers your entire story.</p>
              </div>
            </div>
            <div class="flex items-center space-x-4 text-left">
              <ChatBubbleLeftRightIcon class="w-8 h-8 text-blue-600 flex-shrink-0" />
              <div>
                <h3 class="font-semibold text-gray-900 dark:text-white">Character & World Building</h3>
                <p class="text-sm text-gray-600 dark:text-gray-300">Build comprehensive wikis for your story's universe.</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Attribution Footer for Mobile -->
        <div class="absolute bottom-4 right-4 text-xs text-gray-500 dark:text-gray-400">
          Illustration by <a href="https://unsplash.com/@artattackzone?utm_content=creditCopyText&utm_medium=referral&utm_source=unsplash" class="hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Art Attack</a> on <a href="https://unsplash.com/illustrations/a-cup-of-coffee-and-a-book-on-a-table-RpSTMkZGKyE?utm_content=creditCopyText&utm_medium=referral&utm_source=unsplash" class="hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Unsplash</a>
        </div>
      </div>
    </div>

    <!-- Desktop Layout -->
    <div class="hidden lg:flex min-h-[calc(100vh-4rem)]">
      <!-- Left Half - Image -->
      <div class="w-1/2 relative overflow-hidden">
        <img
          src="/art-attack-RpSTMkZGKyE-unsplash.jpg"
          alt="Creative writing inspiration"
          class="w-full h-full object-cover"
        />
        <div class="absolute inset-0 bg-gradient-to-r from-transparent to-black/20"></div>
      </div>

      <!-- Right Half - Content -->
      <div class="w-1/2 flex flex-col justify-center px-12 xl:px-16 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 relative">
        <div class="max-w-lg">
          <h1 class="text-5xl xl:text-6xl font-bold text-gray-900 dark:text-white mb-8 leading-tight space-grotesk-logo">
            Beta Bot
          </h1>
          <p class="text-xl text-gray-600 dark:text-gray-300 mb-10 leading-relaxed">
            Your AI Beta Reader. Get intelligent feedback on your creative writing. Organize your manuscripts, track your progress, and receive AI-powered reviews that understand your story's context.
          </p>

          <!-- CTA Buttons -->
          <div class="flex flex-col gap-4 mb-12">
            <button
              @click="handleSignUp"
              class="inline-flex items-center justify-center px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-lg shadow-lg"
            >
              Get Started Free
            </button>
            <button
              @click="handleLogin"
              class="inline-flex items-center justify-center px-8 py-4 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium text-lg"
            >
              Sign In
            </button>
          </div>

          <!-- Features List -->
          <div class="space-y-6">
            <div class="flex items-start space-x-4">
              <DocumentTextIcon class="w-6 h-6 text-blue-600 mt-1 flex-shrink-0" />
              <div>
                <h3 class="font-semibold text-gray-900 dark:text-white mb-1">Organize Your Writing</h3>
                <p class="text-gray-600 dark:text-gray-300">Keep your books and chapters organized. Track word counts and manage drafts.</p>
              </div>
            </div>
            <div class="flex items-start space-x-4">
              <SparklesIcon class="w-6 h-6 text-blue-600 mt-1 flex-shrink-0" />
              <div>
                <h3 class="font-semibold text-gray-900 dark:text-white mb-1">AI-Powered Reviews</h3>
                <p class="text-gray-600 dark:text-gray-300">Get contextual feedback that considers your entire story and characters.</p>
              </div>
            </div>
            <div class="flex items-start space-x-4">
              <ChatBubbleLeftRightIcon class="w-6 h-6 text-blue-600 mt-1 flex-shrink-0" />
              <div>
                <h3 class="font-semibold text-gray-900 dark:text-white mb-1">Character & World Building</h3>
                <p class="text-gray-600 dark:text-gray-300">Build comprehensive wikis for your characters, locations, and concepts.</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Attribution Footer -->
        <div class="absolute bottom-4 right-4 text-xs text-gray-500 dark:text-gray-400">
          Illustration by <a href="https://unsplash.com/@artattackzone?utm_content=creditCopyText&utm_medium=referral&utm_source=unsplash" class="hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Art Attack</a> on <a href="https://unsplash.com/illustrations/a-cup-of-coffee-and-a-book-on-a-table-RpSTMkZGKyE?utm_content=creditCopyText&utm_medium=referral&utm_source=unsplash" class="hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Unsplash</a>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.space-grotesk-logo {
  font-family: "Space Grotesk", sans-serif;
  font-optical-sizing: auto;
  font-weight: 600;
  font-style: normal;
}
</style>
