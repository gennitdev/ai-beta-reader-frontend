<script setup lang="ts">
import { useAuth0 } from '@auth0/auth0-vue'
import { useRouter } from 'vue-router'
import { BookOpenIcon, SparklesIcon, ChatBubbleLeftRightIcon, DocumentTextIcon } from '@heroicons/vue/24/outline'

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
  <div class="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <!-- Hero Section -->
      <div class="text-center">
        <BookOpenIcon class="w-20 h-20 text-blue-600 mx-auto mb-8" />
        <h1 class="text-5xl font-bold text-gray-900 dark:text-white mb-6">
          AI Beta Reader
        </h1>
        <p class="text-xl text-gray-600 dark:text-gray-300 mb-12 max-w-3xl mx-auto">
          Get intelligent feedback on your creative writing. Organize your manuscripts, track your progress, and receive AI-powered reviews that understand your story's context.
        </p>

        <!-- CTA Buttons -->
        <div class="flex flex-col sm:flex-row gap-4 justify-center mb-16">
          <button
            @click="handleSignUp"
            class="inline-flex items-center px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-lg shadow-lg"
          >
            Get Started Free
          </button>
          <button
            @click="handleLogin"
            class="inline-flex items-center px-8 py-4 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium text-lg"
          >
            Sign In
          </button>
        </div>
      </div>

      <!-- Features Grid -->
      <div class="grid md:grid-cols-3 gap-8 mt-20">
        <div class="text-center p-6 bg-white dark:bg-gray-800 rounded-xl shadow-md">
          <DocumentTextIcon class="w-12 h-12 text-blue-600 mx-auto mb-4" />
          <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">
            Organize Your Writing
          </h3>
          <p class="text-gray-600 dark:text-gray-300">
            Keep your books and chapters organized. Track word counts, manage drafts, and structure your manuscripts with ease.
          </p>
        </div>

        <div class="text-center p-6 bg-white dark:bg-gray-800 rounded-xl shadow-md">
          <SparklesIcon class="w-12 h-12 text-blue-600 mx-auto mb-4" />
          <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">
            AI-Powered Reviews
          </h3>
          <p class="text-gray-600 dark:text-gray-300">
            Get contextual feedback that considers your entire story. Choose from different review styles to match your needs.
          </p>
        </div>

        <div class="text-center p-6 bg-white dark:bg-gray-800 rounded-xl shadow-md">
          <ChatBubbleLeftRightIcon class="w-12 h-12 text-blue-600 mx-auto mb-4" />
          <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">
            Character & World Building
          </h3>
          <p class="text-gray-600 dark:text-gray-300">
            Build comprehensive wikis for your characters, locations, and concepts. Keep track of your story's universe.
          </p>
        </div>
      </div>

      <!-- Footer CTA -->
      <div class="text-center mt-20">
        <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Ready to improve your writing?
        </h2>
        <p class="text-lg text-gray-600 dark:text-gray-300 mb-8">
          Join writers who are using AI to take their storytelling to the next level.
        </p>
        <button
          @click="handleSignUp"
          class="inline-flex items-center px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-lg shadow-lg"
        >
          Start Writing Better Today
        </button>
      </div>
    </div>
  </div>
</template>
