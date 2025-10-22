<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { SparklesIcon, ChatBubbleLeftRightIcon, DocumentTextIcon, BookOpenIcon, PencilIcon, LightBulbIcon, UserGroupIcon, CogIcon, MagnifyingGlassIcon } from '@heroicons/vue/24/outline'
import heroImage from '@/assets/art-attack-RpSTMkZGKyE-unsplash.jpg'

const router = useRouter()
// Only show the detailed steps when the user clicks.
const showDetailedSteps = ref(false)

const handleGetStarted = () => {
  router.push('/books')
}

// Simplified set of core features for mobile
const coreFeatures = [
  { icon: DocumentTextIcon, text: 'Organize manuscripts & chapters' },
  { icon: SparklesIcon, text: 'AI-Powered Contextual Reviews' },
  { icon: ChatBubbleLeftRightIcon, text: 'Character & World Building Wikis' },
]

// Concise steps for the 'How It Works' quick view
const quickSteps = [
  { step: '1', title: 'Write Chapter', description: 'Use the rich editor' },
  { step: '2', title: 'AI Summarizes', description: 'Tracks plot & characters' },
  { step: '3', title: 'Add More', description: 'Grow your manuscript' },
  { step: '4', title: 'Review!', description: 'AI knows your whole story' },
]

</script>

<template>
  <div class="min-h-[calc(100vh-4rem)] bg-white dark:bg-gray-900">
    <div class="lg:hidden">
      <div class="h-64 sm:h-80 overflow-hidden">
        <img
          :src="heroImage"
          alt="Creative writing inspiration"
          class="w-full h-full object-cover"
        />
      </div>

      <div class="px-4 sm:px-6 py-8 pb-16 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 relative">
        <div class="max-w-xl mx-auto text-center">

          <h1 class="text-4xl font-bold text-gray-900 dark:text-white mb-4 space-grotesk-logo">
            Beta-bot
          </h1>
          <p class="text-lg text-gray-700 dark:text-gray-300 mb-8">
            Your **AI Beta Reader**. Get intelligent, contextual feedback on your creative writing.
          </p>

          <div class="flex flex-col gap-3 mb-12">
            <button
              @click="handleGetStarted"
              class="w-full inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold text-lg shadow-xl shadow-blue-500/30"
            >
              Start Writing Now
            </button>
            <router-link
              to="/docs"
              class="w-full inline-flex items-center justify-center px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors font-medium shadow-md"
            >
              <BookOpenIcon class="w-5 h-5 mr-2" />
              Screenshots & Tutorial
            </router-link>
          </div>

          <div class="bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-12 shadow-inner text-left">
            <p class="text-sm text-blue-900 dark:text-blue-100 font-bold mb-1 flex items-center">
              <LightBulbIcon class="w-5 h-5 mr-2 text-blue-600" />
              Privacy-First Writing
            </p>
            <p class="text-sm text-blue-800 dark:text-blue-200">
              All your data is stored **locally** on your device. You bring your own OpenAI API key. Your work is **yours** and stays private.
            </p>
          </div>

          <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-6 text-left border-b border-gray-200 dark:border-gray-700 pb-2">
            Core Features
          </h2>

          <div class="space-y-4 mb-12 text-left">
            <div v-for="feature in coreFeatures" :key="feature.text" class="flex items-center space-x-3">
              <component :is="feature.icon" class="w-6 h-6 text-blue-600 flex-shrink-0" />
              <p class="text-base text-gray-700 dark:text-gray-300 font-medium">{{ feature.text }}</p>
            </div>
          </div>

          <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-6 text-left border-b border-gray-200 dark:border-gray-700 pb-2">
            The Contextual Advantage
          </h2>

          <div class="grid grid-cols-2 gap-3 mb-10">
              <div v-for="(step, index) in quickSteps" :key="index" :class="[
                  'rounded-lg p-3 text-left shadow-sm',
                  index === 3 ? 'bg-indigo-100 dark:bg-indigo-900/20 border border-indigo-300 dark:border-indigo-700' : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
              ]">
                <span :class="[
                    'font-bold text-lg',
                    index === 3 ? 'text-indigo-600 dark:text-indigo-400' : 'text-blue-600 dark:text-blue-400'
                ]">
                    {{ step.step }}. {{ step.title }}
                </span>
                <p class="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{{ step.description }}</p>
              </div>
          </div>

          <div class="mt-10 border-t border-gray-200 dark:border-gray-700 pt-6">
            <button
              @click="showDetailedSteps = !showDetailedSteps"
              class="flex items-center justify-between w-full text-left p-3 rounded-lg transition-colors"
              :class="showDetailedSteps ? 'bg-blue-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800'"
            >
              <h2 class="text-xl font-bold text-gray-900 dark:text-white">
                {{ showDetailedSteps ? 'Hide Technical Details' : 'Show Full 7-Step Process' }}
              </h2>
              <svg
                :class="showDetailedSteps ? 'rotate-180 text-blue-600' : 'text-gray-500'"
                class="w-5 h-5 transition-transform"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
              </svg>
            </button>

            <div v-if="showDetailedSteps" class="space-y-4 text-left pt-4">

              <div class="bg-blue-50 dark:bg-gray-800 rounded-lg p-4">
                <div class="flex items-start space-x-3">
                  <span class="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">1-4</span>
                  <div>
                    <h3 class="font-semibold text-gray-900 dark:text-white mb-1">Write & Summarize Chapters</h3>
                    <p class="text-sm text-gray-600 dark:text-gray-300">Organize your manuscript. The AI creates structured summaries (tracking characters, plot points) for each chapter as you go.</p>
                  </div>
                </div>
              </div>

              <div class="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 border border-indigo-200 dark:border-indigo-700 shadow-md">
                <div class="flex items-start space-x-3">
                  <span class="flex-shrink-0 w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center text-sm font-bold">5</span>
                  <div>
                    <h3 class="font-semibold text-gray-900 dark:text-white mb-1">✨ Get Contextual Reviews</h3>
                    <p class="text-sm text-gray-600 dark:text-gray-300">The AI uses the summaries of **all previous chapters** to provide feedback. It already knows your backstory, character arcs, and world rules!</p>
                  </div>
                </div>
              </div>

              <div class="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-700">
                <div class="flex items-start space-x-3">
                  <span class="flex-shrink-0 w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold">6+</span>
                  <div>
                    <h3 class="font-semibold text-gray-900 dark:text-white mb-1">Advanced Tools</h3>
                    <p class="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                      Includes: **Character & World Wikis**, custom AI reviewer profiles, manuscript-wide search & replace, and more.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="absolute bottom-4 right-4 text-xs text-gray-500 dark:text-gray-400">
          Illustration by <a href="https://unsplash.com/@artattackzone?utm_content=creditCopyText&utm_medium=referral&utm_source=unsplash" class="hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Art Attack</a>
        </div>
      </div>
    </div>

    <div class="hidden lg:flex min-h-[calc(100vh-4rem)]">
      <div class="w-1/3 relative overflow-hidden">
        <img
          :src="heroImage"
          alt="Creative writing inspiration"
          class="w-full h-full object-cover"
        />
        <div class="absolute inset-0 bg-gradient-to-r from-transparent to-black/10"></div>
      </div>

      <div class="w-2/3 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 relative overflow-y-auto">
        <div class="px-8 xl:px-12 py-8 lg:py-12 max-w-4xl">
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

              <div class="flex flex-wrap gap-4 mb-10">
                <button
                  @click="handleGetStarted"
                  class="inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-lg"
                >
                  Get Started
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

          <div class="absolute bottom-4 right-4 text-xs text-gray-500 dark:text-gray-400">
            Illustration by <a href="https://unsplash.com/@artattackzone?utm_content=creditCopyText&utm_medium=referral&utm_source=unsplash" class="hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Art Attack</a>
          </div>
        </div>
      </div>
    </div>

</template>

<style scoped>
/* Added an additional font for a more modern look, assuming it's imported elsewhere */
.space-grotesk-logo {
  font-family: "Space Grotesk", sans-serif;
  font-optical-sizing: auto;
  font-weight: 600;
  font-style: normal;
}
</style>
