<script setup lang="ts">
import { ref } from 'vue'
import { useAuth0 } from '@auth0/auth0-vue'
import { useRouter } from 'vue-router'
import { SparklesIcon, ChatBubbleLeftRightIcon, DocumentTextIcon, BookOpenIcon, PencilIcon, LightBulbIcon, UserGroupIcon, CogIcon, MagnifyingGlassIcon } from '@heroicons/vue/24/outline'
import heroImage from '@/assets/art-attack-RpSTMkZGKyE-unsplash.jpg'

const { isAuthenticated, loginWithRedirect } = useAuth0()
const router = useRouter()

const showHowItWorks = ref(false)

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
          :src="heroImage"
          alt="Creative writing inspiration"
          class="w-full h-full object-cover"
        />
      </div>

      <!-- Content below image on mobile -->
      <div class="px-4 sm:px-6 py-12 pb-20 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 relative">
        <div class="max-w-xl mx-auto text-center">
          <h1 class="text-4xl font-bold text-gray-900 dark:text-white mb-6 space-grotesk-logo">
            Beta-bot
          </h1>
          <p class="text-lg text-gray-600 dark:text-gray-300 mb-4">
            Your AI Beta Reader. Get intelligent feedback on your creative writing. Organize your manuscripts and receive AI-powered reviews.
          </p>
          <div class="bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-8">
            <p class="text-sm text-blue-900 dark:text-blue-100 font-medium mb-2">
              🔒 Privacy-First Local Storage
            </p>
            <p class="text-sm text-blue-800 dark:text-blue-200">
              All your data stays on your device. Optional encrypted backups to your own Google Drive. You provide your own OpenAI API key for AI features.
            </p>
          </div>

          <!-- CTA Buttons -->
          <div class="flex flex-col gap-3 mb-12">
            <button
              @click="handleSignUp"
              class="w-full inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-lg shadow-lg"
            >
              Get Started
            </button>
            <button
              @click="handleLogin"
              class="w-full inline-flex items-center justify-center px-6 py-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
            >
              Sign In
            </button>
            <router-link
              to="/docs"
              class="w-full inline-flex items-center justify-center px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
            >
              <BookOpenIcon class="w-5 h-5 mr-2" />
              See Screenshots & Tutorial
            </router-link>
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

          <!-- How It Works Section - Mobile -->
          <div class="mt-12 border-t border-gray-200 dark:border-gray-700 pt-8">
            <button
              @click="showHowItWorks = !showHowItWorks"
              class="flex items-center justify-between w-full text-left mb-4"
            >
              <h2 class="text-2xl font-bold text-gray-900 dark:text-white">How It Works</h2>
              <svg
                :class="showHowItWorks ? 'rotate-180' : ''"
                class="w-5 h-5 text-gray-500 transition-transform"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
              </svg>
            </button>

            <div v-if="showHowItWorks" class="space-y-4 text-left">
              <div class="bg-blue-50 dark:bg-gray-800 rounded-lg p-4">
                <div class="flex items-start space-x-3">
                  <span class="flex-shrink-0 w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">1</span>
                  <div>
                    <h3 class="font-semibold text-gray-900 dark:text-white mb-1">Create Your Book</h3>
                    <p class="text-sm text-gray-600 dark:text-gray-300">Start a new project and give it a memorable title</p>
                  </div>
                </div>
              </div>

              <div class="bg-blue-50 dark:bg-gray-800 rounded-lg p-4">
                <div class="flex items-start space-x-3">
                  <span class="flex-shrink-0 w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">2</span>
                  <div>
                    <h3 class="font-semibold text-gray-900 dark:text-white mb-1">Write Your First Chapter</h3>
                    <p class="text-sm text-gray-600 dark:text-gray-300">Add content using our rich markdown editor with live preview</p>
                  </div>
                </div>
              </div>

              <div class="bg-blue-50 dark:bg-gray-800 rounded-lg p-4">
                <div class="flex items-start space-x-3">
                  <span class="flex-shrink-0 w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">3</span>
                  <div>
                    <h3 class="font-semibold text-gray-900 dark:text-white mb-1">Generate AI Summary</h3>
                    <p class="text-sm text-gray-600 dark:text-gray-300">ChatGPT creates a structured overview tracking characters, plot points, and key events</p>
                  </div>
                </div>
              </div>

              <div class="bg-blue-50 dark:bg-gray-800 rounded-lg p-4">
                <div class="flex items-start space-x-3">
                  <span class="flex-shrink-0 w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">4</span>
                  <div>
                    <h3 class="font-semibold text-gray-900 dark:text-white mb-1">Add More Chapters</h3>
                    <p class="text-sm text-gray-600 dark:text-gray-300">Continue building your story, one chapter at a time</p>
                  </div>
                </div>
              </div>

              <div class="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 border border-indigo-200 dark:border-indigo-700">
                <div class="flex items-start space-x-3">
                  <span class="flex-shrink-0 w-7 h-7 bg-indigo-600 text-white rounded-full flex items-center justify-center text-sm font-bold">5</span>
                  <div>
                    <h3 class="font-semibold text-gray-900 dark:text-white mb-1">✨ Get Contextual Reviews</h3>
                    <p class="text-sm text-gray-600 dark:text-gray-300">The magic happens here! When you generate a review, the AI automatically knows your entire story through the chapter summaries. No need to explain backstory - it already understands everything!</p>
                  </div>
                </div>
              </div>

              <div class="bg-blue-50 dark:bg-gray-800 rounded-lg p-4">
                <div class="flex items-start space-x-3">
                  <span class="flex-shrink-0 w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">6</span>
                  <div>
                    <h3 class="font-semibold text-gray-900 dark:text-white mb-1">Maintain Continuity Effortlessly</h3>
                    <p class="text-sm text-gray-600 dark:text-gray-300">As your manuscript grows, the system efficiently manages context using summaries, keeping the AI aware of your story without hitting token limits</p>
                  </div>
                </div>
              </div>

              <div class="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                <div class="flex items-start space-x-3">
                  <span class="flex-shrink-0 w-7 h-7 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold">7</span>
                  <div>
                    <h3 class="font-semibold text-gray-900 dark:text-white mb-1">Advanced Features</h3>
                    <p class="text-sm text-gray-600 dark:text-gray-300 mb-2">Take your writing to the next level:</p>
                    <ul class="text-sm text-gray-600 dark:text-gray-300 space-y-1 ml-4">
                      <li class="flex items-start">
                        <CogIcon class="w-4 h-4 mr-2 text-purple-600 flex-shrink-0 mt-0.5" />
                        <span>Create custom AI reviewer profiles with tailored prompts</span>
                      </li>
                      <li class="flex items-start">
                        <BookOpenIcon class="w-4 h-4 mr-2 text-purple-600 flex-shrink-0 mt-0.5" />
                        <span>Build interactive wikis for characters and world-building</span>
                      </li>
                      <li class="flex items-start">
                        <MagnifyingGlassIcon class="w-4 h-4 mr-2 text-purple-600 flex-shrink-0 mt-0.5" />
                        <span>Search and replace across all chapters for consistency</span>
                      </li>
                    </ul>
                  </div>
                </div>
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
      <!-- Left Image - 1/3 width -->
      <div class="w-1/3 relative overflow-hidden">
        <img
          :src="heroImage"
          alt="Creative writing inspiration"
          class="w-full h-full object-cover"
        />
        <div class="absolute inset-0 bg-gradient-to-r from-transparent to-black/10"></div>
      </div>

      <!-- Right Content - 2/3 width -->
      <div class="w-2/3 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 relative overflow-y-auto">
        <div class="px-8 xl:px-12 py-8 lg:py-12 max-w-4xl">
            <!-- Hero Section -->
            <div class="mb-8">
              <h1 class="text-4xl lg:text-5xl xl:text-6xl font-bold text-gray-900 dark:text-white mb-6 leading-tight space-grotesk-logo">
                Beta-bot
              </h1>
              <p class="text-lg lg:text-xl text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
                Your AI Beta Reader. Get intelligent feedback on your creative writing. Organize your manuscripts, track your progress, and receive AI-powered reviews that understand your story's context.
              </p>
              <div class="bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-8">
                <p class="text-sm text-blue-900 dark:text-blue-100 font-semibold mb-2">
                  🔒 Privacy-First Local Storage
                </p>
                <p class="text-sm text-blue-800 dark:text-blue-200">
                  All your data stays on your device. Optional encrypted backups to your own Google Drive. You provide your own OpenAI API key for AI features - no third-party servers see your work.
                </p>
              </div>

              <!-- CTA Buttons - Horizontal on desktop -->
              <div class="flex flex-wrap gap-4 mb-10">
                <button
                  @click="handleSignUp"
                  class="inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-lg"
                >
                  Get Started
                </button>
                <button
                  @click="handleLogin"
                  class="inline-flex items-center justify-center px-6 py-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
                >
                  Sign In
                </button>
                <router-link
                  to="/docs"
                  class="inline-flex items-center justify-center px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                >
                  <BookOpenIcon class="w-5 h-5 mr-2" />
                  See How It Works
                </router-link>
              </div>
            </div>

            <!-- Features Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
              <div class="flex items-start space-x-2 bg-white dark:bg-gray-800 p-3 rounded-lg">
                <DocumentTextIcon class="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 class="font-semibold text-gray-900 dark:text-white text-xs mb-1">Local Storage</h3>
                  <p class="text-gray-600 dark:text-gray-300 text-xs">Works offline. Your data never leaves your device</p>
                </div>
              </div>
              <div class="flex items-start space-x-2 bg-white dark:bg-gray-800 p-3 rounded-lg">
                <SparklesIcon class="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 class="font-semibold text-gray-900 dark:text-white text-xs mb-1">Your OpenAI Key</h3>
                  <p class="text-gray-600 dark:text-gray-300 text-xs">Use your own API key. Full control over costs</p>
                </div>
              </div>
              <div class="flex items-start space-x-2 bg-white dark:bg-gray-800 p-3 rounded-lg">
                <ChatBubbleLeftRightIcon class="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 class="font-semibold text-gray-900 dark:text-white text-xs mb-1">Encrypted Backups</h3>
                  <p class="text-gray-600 dark:text-gray-300 text-xs">Optional sync to your Google Drive, encrypted</p>
                </div>
              </div>
              <div class="flex items-start space-x-2 bg-white dark:bg-gray-800 p-3 rounded-lg">
                <CogIcon class="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 class="font-semibold text-gray-900 dark:text-white text-xs mb-1">Full Privacy</h3>
                  <p class="text-gray-600 dark:text-gray-300 text-xs">No servers storing your creative work</p>
                </div>
              </div>
            </div>

            <!-- How It Works Section -->
            <div class="border-t border-gray-200 dark:border-gray-700 pt-8">
              <div class="flex items-center justify-between mb-6">
                <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Quick Overview</h2>
                <router-link
                  to="/docs"
                  class="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium text-sm flex items-center"
                >
                  View Full Tutorial with Screenshots
                  <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                  </svg>
                </router-link>
              </div>

              <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div class="bg-blue-50 dark:bg-gray-800 rounded-lg p-3">
                  <div class="flex items-start space-x-2">
                    <span class="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
                    <div>
                      <h3 class="font-semibold text-sm text-gray-900 dark:text-white">Create Book</h3>
                      <p class="text-xs text-gray-600 dark:text-gray-300">Start your project</p>
                    </div>
                  </div>
                </div>

                <div class="bg-blue-50 dark:bg-gray-800 rounded-lg p-3">
                  <div class="flex items-start space-x-2">
                    <span class="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                    <div>
                      <h3 class="font-semibold text-sm text-gray-900 dark:text-white">Write</h3>
                      <p class="text-xs text-gray-600 dark:text-gray-300">Add chapters</p>
                    </div>
                  </div>
                </div>

                <div class="bg-blue-50 dark:bg-gray-800 rounded-lg p-3">
                  <div class="flex items-start space-x-2">
                    <span class="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
                    <div>
                      <h3 class="font-semibold text-sm text-gray-900 dark:text-white">Summarize</h3>
                      <p class="text-xs text-gray-600 dark:text-gray-300">AI tracks story</p>
                    </div>
                  </div>
                </div>

                <div class="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 border border-indigo-200 dark:border-indigo-700">
                  <div class="flex items-start space-x-2">
                    <span class="flex-shrink-0 w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xs font-bold">4</span>
                    <div>
                      <h3 class="font-semibold text-sm text-gray-900 dark:text-white">✨ Review</h3>
                      <p class="text-xs text-gray-600 dark:text-gray-300">Get feedback</p>
                    </div>
                  </div>
                </div>
              </div>

              <p class="text-sm text-gray-600 dark:text-gray-300 mb-4">
                The AI automatically understands your entire story through chapter summaries - no need to explain backstory!
                <router-link to="/docs" class="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 ml-1">See it in action →</router-link>
              </p>

              <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p class="font-semibold text-gray-900 dark:text-white mb-2">Core Features:</p>
                  <ul class="text-gray-600 dark:text-gray-300 space-y-1">
                    <li class="flex items-center"><span class="mr-2">•</span>Rich markdown editor</li>
                    <li class="flex items-center"><span class="mr-2">•</span>Multiple review styles</li>
                    <li class="flex items-center"><span class="mr-2">•</span>Chapter organization</li>
                  </ul>
                </div>
                <div>
                  <p class="font-semibold text-gray-900 dark:text-white mb-2">Advanced Tools:</p>
                  <ul class="text-gray-600 dark:text-gray-300 space-y-1">
                    <li class="flex items-center"><span class="mr-2">•</span>Custom AI profiles</li>
                    <li class="flex items-center"><span class="mr-2">•</span>Character wikis</li>
                    <li class="flex items-center"><span class="mr-2">•</span>Search & replace</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <!-- Attribution Footer -->
          <div class="absolute bottom-4 right-4 text-xs text-gray-500 dark:text-gray-400">
            Illustration by <a href="https://unsplash.com/@artattackzone?utm_content=creditCopyText&utm_medium=referral&utm_source=unsplash" class="hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Art Attack</a>
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
