<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { SparklesIcon, ChatBubbleLeftRightIcon, DocumentTextIcon, BookOpenIcon, LightBulbIcon } from '@heroicons/vue/24/outline'
import heroImage from '@/assets/art-attack-RpSTMkZGKyE-unsplash.jpg'
import { useDatabase } from '@/composables/useDatabase'

const router = useRouter()
const { books, loadBooks } = useDatabase()

// Only show the detailed steps when the user clicks.
const showDetailedSteps = ref(false)
const isLoading = ref(true)

onMounted(async () => {
  await loadBooks()
  // Redirect to books page if user already has books
  if (books.value.length > 0) {
    router.replace('/books')
    // Keep showing loading spinner during navigation
  } else {
    // Only show landing page if user has no books
    isLoading.value = false
  }
})

const handleGetStarted = () => {
  router.push('/books')
}

// Simplified set of core features for mobile
const coreFeatures = [
  { icon: DocumentTextIcon, text: 'Organize manuscripts & chapters' },
  { icon: SparklesIcon, text: 'AI-Powered Contextual Reviews' },
  { icon: ChatBubbleLeftRightIcon, text: 'Character & World Building Wikis' },
]

const quickSteps = [
  { step: '1', title: 'Write Chapter', description: 'Use the rich editor', highlight: false },
  { step: '2', title: 'AI Summarizes', description: 'Tracks plot & characters', highlight: false },
  { step: '3', title: 'Add More', description: 'Grow your manuscript', highlight: false },
  { step: '4', title: 'Review!', description: 'AI knows your whole story', highlight: true },
]

const detailedSteps = [
  {
    number: '1',
    title: 'Write & Summarize Chapters',
    description:
      'Organize your manuscript. The AI creates structured summaries (tracking characters, plot points) for each chapter as you go.',
    wrapperClass: 'bg-blue-50 dark:bg-gray-800',
    badgeClass: 'bg-blue-600',
  },
  {
    number: '2',
    title: '✨ Get Contextual Reviews',
    description:
      'The AI uses the summaries of **all previous chapters** to provide feedback. It already knows your backstory, character arcs, and world rules!',
    wrapperClass:
      'bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 shadow-md',
    badgeClass: 'bg-indigo-600',
  },
  {
    number: '3',
    title: 'Advanced Tools',
    description:
      'Includes: **Character & World Wikis**, custom AI reviewer profiles, manuscript-wide search & replace, and more.',
    wrapperClass: 'bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700',
    badgeClass: 'bg-purple-600',
  },
]

</script>

<template>
  <div class="min-h-[calc(100vh-4rem)] bg-white dark:bg-gray-900">
    <!-- Loading state while checking for books -->
    <div v-if="isLoading" class="flex items-center justify-center min-h-[calc(100vh-4rem)]">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
    <!-- Landing page - only shown when user has no books -->
    <div v-else>
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
              <div
                v-for="step in quickSteps"
                :key="step.step"
                :class="[
                  'rounded-lg p-3 text-left shadow-sm',
                  step.highlight
                    ? 'bg-indigo-100 dark:bg-indigo-900/20 border border-indigo-300 dark:border-indigo-700'
                    : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
                ]"
              >
                <span
                  :class="[
                    'font-bold text-lg',
                    step.highlight ? 'text-indigo-600 dark:text-indigo-400' : 'text-blue-600 dark:text-blue-400'
                  ]"
                >
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
              <div
                v-for="detail in detailedSteps"
                :key="detail.number"
                :class="['rounded-lg p-4', detail.wrapperClass]"
              >
                <div class="flex items-start space-x-3">
                  <span
                    :class="[
                      'flex-shrink-0 w-6 h-6 text-white rounded-full flex items-center justify-center text-sm font-bold',
                      detail.badgeClass
                    ]"
                  >
                    {{ detail.number }}
                  </span>
                  <div>
                    <h3 class="font-semibold text-gray-900 dark:text-white mb-1">{{ detail.title }}</h3>
                    <p class="text-sm text-gray-600 dark:text-gray-300">{{ detail.description }}</p>
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
