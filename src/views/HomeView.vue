<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { SparklesIcon, ChatBubbleLeftRightIcon, DocumentTextIcon, BookOpenIcon, LightBulbIcon } from '@heroicons/vue/24/outline'
import logoStacked from '@/assets/logo-stacked.png'
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

// Render simple **bold** markdown in the static step descriptions below.
const renderBold = (text: string) =>
  text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

// Simplified set of core features for mobile
const coreFeatures = [
  { icon: DocumentTextIcon, text: 'Organize manuscripts & chapters' },
  { icon: SparklesIcon, text: 'AI-Powered Contextual Reviews' },
  { icon: ChatBubbleLeftRightIcon, text: 'Auto-Updating Character & World Wikis' },
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
    wrapperClass: 'bg-[#faf3e4] dark:bg-navy-800',
    badgeClass: 'bg-gold-500 text-navy-900',
  },
  {
    number: '2',
    title: '✨ Get Contextual Reviews',
    description:
      'The AI uses the summaries of **all previous chapters** to provide feedback. It already knows your backstory, character arcs, and world rules!',
    wrapperClass:
      'bg-[#f5ecd6] dark:bg-navy-800 border border-[#e7d29a] dark:border-navy-700 shadow-md',
    badgeClass: 'bg-navy-900 text-cream',
  },
  {
    number: '3',
    title: 'Advanced Tools',
    description:
      'The AI **automatically updates your Character & World wiki pages** as your story grows. Plus custom AI reviewer profiles, manuscript-wide search & replace, and more.',
    wrapperClass: 'bg-[#eef1e6] dark:bg-navy-800/60 border border-[#d5dabb] dark:border-navy-700',
    badgeClass: 'bg-[#6f7052] text-white',
  },
]

</script>

<template>
  <div class="min-h-[calc(100vh-4rem)] bg-white dark:bg-navy-900">
    <!-- Loading state while checking for books -->
    <div v-if="isLoading" class="flex items-center justify-center min-h-[calc(100vh-4rem)]">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gold-500"></div>
    </div>
    <!-- Landing page - only shown when user has no books -->
    <div v-else>
      <div class="px-4 sm:px-6 pt-8 py-8 pb-16 bg-gradient-to-br from-[#fbf5ea] to-[#f3e7cf] dark:from-navy-900 dark:to-navy-950 relative">
        <div class="max-w-xl mx-auto text-center">

          <div class="max-w-xs mx-auto overflow-hidden rounded-2xl shadow-lg mb-8 ring-1 ring-navy-900/10">
            <img
              :src="logoStacked"
              alt="beta bot"
              class="w-full h-full object-cover"
            />
          </div>

          <p class="text-lg text-gray-700 dark:text-gray-300 mb-8">
            Your <strong>AI-powered beta reader</strong>. Get intelligent, contextual feedback on your creative writing.
          </p>

          <div class="flex flex-col gap-3 mb-12">
            <button
              @click="handleGetStarted"
              class="w-full inline-flex items-center justify-center px-6 py-3 bg-gold-500 text-navy-900 rounded-xl hover:bg-gold-400 transition-colors font-semibold text-lg shadow-xl shadow-gold-500/30"
            >
              Start Writing Now
            </button>
            <router-link
              to="/docs"
              class="w-full inline-flex items-center justify-center px-6 py-3 bg-navy-900 text-cream rounded-xl hover:bg-navy-800 transition-colors font-medium shadow-md"
            >
              <BookOpenIcon class="w-5 h-5 mr-2" />
              Screenshots & Tutorial
            </router-link>
          </div>

          <div class="bg-[#faf3e4] dark:bg-navy-800/60 border border-[#e7d29a] dark:border-navy-700 rounded-xl p-4 mb-12 shadow-inner text-left">
            <p class="text-sm text-navy-900 dark:text-gold-200 font-bold mb-1 flex items-center">
              <LightBulbIcon class="w-5 h-5 mr-2 text-gold-600 dark:text-gold-400" />
              Privacy-First Writing
            </p>
            <p class="text-sm text-gray-700 dark:text-gray-300">
              All your data is stored <strong>locally</strong> on your device. You bring your own OpenAI API key. Your work is <strong>yours</strong> and stays private.
            </p>
          </div>

          <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-6 text-left border-b border-gray-200 dark:border-navy-700 pb-2">
            Core Features
          </h2>

          <div class="space-y-4 mb-12 text-left">
            <div v-for="feature in coreFeatures" :key="feature.text" class="flex items-center space-x-3">
              <component :is="feature.icon" class="w-6 h-6 text-gold-600 dark:text-gold-400 flex-shrink-0" />
              <p class="text-base text-gray-700 dark:text-gray-300 font-medium">{{ feature.text }}</p>
            </div>
          </div>

          <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-6 text-left border-b border-gray-200 dark:border-navy-700 pb-2">
            The Contextual Advantage
          </h2>

          <div class="grid grid-cols-2 gap-3 mb-10">
              <div
                v-for="step in quickSteps"
                :key="step.step"
                :class="[
                  'rounded-lg p-3 text-left shadow-sm',
                  step.highlight
                    ? 'bg-[#f5ecd6] dark:bg-navy-800 border border-[#e7d29a] dark:border-navy-700'
                    : 'bg-white/80 dark:bg-navy-800/70 border border-[#ecdec0] dark:border-navy-700'
                ]"
              >
                <span
                  :class="[
                    'font-bold text-lg',
                    step.highlight ? 'text-gold-700 dark:text-gold-300' : 'text-navy-700 dark:text-gray-200'
                  ]"
                >
                  {{ step.step }}. {{ step.title }}
                </span>
                <p class="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{{ step.description }}</p>
              </div>
          </div>

          <div class="mt-10 border-t border-gray-200 dark:border-navy-700 pt-6">
            <button
              @click="showDetailedSteps = !showDetailedSteps"
              class="flex items-center justify-between w-full text-left p-3 rounded-lg transition-colors"
              :class="showDetailedSteps ? 'bg-[#f5ecd6] dark:bg-navy-800' : 'hover:bg-[#faf3e4] dark:hover:bg-navy-800'"
            >
              <h2 class="text-xl font-bold text-gray-900 dark:text-white">
                {{ showDetailedSteps ? 'Hide Technical Details' : 'Show How It Works' }}
              </h2>
              <svg
                :class="showDetailedSteps ? 'rotate-180 text-gold-600' : 'text-gray-500'"
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
                      'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold',
                      detail.badgeClass
                    ]"
                  >
                    {{ detail.number }}
                  </span>
                  <div>
                    <h3 class="font-semibold text-gray-900 dark:text-white mb-1">{{ detail.title }}</h3>
                    <p class="text-sm text-gray-600 dark:text-gray-300" v-html="renderBold(detail.description)"></p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>

</template>
