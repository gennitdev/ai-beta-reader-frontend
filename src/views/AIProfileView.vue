<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createAIProfileService } from '@/services/api'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import AvatarComponent from '@/components/AvatarComponent.vue'
import {
  ArrowLeftIcon,
  ClockIcon,
  SparklesIcon,
  ChatBubbleLeftRightIcon,
  UserCircleIcon,
  CodeBracketIcon
} from '@heroicons/vue/24/outline'

interface AIProfile {
  id: number
  name: string
  tone_key: string
  system_prompt: string
  created_at: string
  is_system: boolean
  is_default: boolean
}

interface ProfileReview {
  id: string
  review_text: string
  created_at: string
  updated_at: string
  chapter_id: string
  chapter_title: string
  book_id: string
  book_title: string
}

interface ProfileData {
  profile: AIProfile
  reviews: ProfileReview[]
}

const route = useRoute()
const router = useRouter()

// Computed route parameters
const profileId = computed(() => route.params.id as string)

// Create service (no auth needed for local-first)
const getToken = async () => {
  try {
    return undefined
  } catch (error) {
    console.warn('Failed to get access token:', error)
    return undefined
  }
}

const aiProfileService = createAIProfileService(getToken)

const profileData = ref<ProfileData | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const showFullPrompt = ref(false)

// Mobile detection
const isMobileRoute = computed(() => route.meta?.mobile === true)

// Computed properties for display
const formattedCreatedDate = computed(() => {
  if (!profileData.value?.profile.created_at) return 'Unknown'
  return new Date(profileData.value.profile.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
})

const promptPreview = computed(() => {
  if (!profileData.value?.profile.system_prompt) return ''
  const prompt = profileData.value.profile.system_prompt
  if (prompt.length <= 200) return prompt
  return prompt.substring(0, 200).split(' ').slice(0, -1).join(' ') + '...'
})

const loadProfile = async () => {
  loading.value = true
  error.value = null
  try {
    console.log('Loading AI profile with ID:', profileId.value)
    const data = await aiProfileService.getAIProfile(profileId.value)
    console.log('Received AI profile data:', data)
    profileData.value = data
  } catch (err: any) {
    console.error('Failed to load AI profile:', err)
    error.value = err.response?.data?.error || err.message || 'Failed to load AI profile'
  } finally {
    loading.value = false
  }
}

const goBack = () => {
  router.back()
}

const navigateToChapter = (review: ProfileReview) => {
  router.push(`/books/${review.book_id}/chapters/${review.chapter_id}`)
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

onMounted(() => {
  loadProfile()
})
</script>

<template>
  <div class="max-w-6xl mx-auto p-6">
    <!-- Loading state -->
    <div v-if="loading" class="flex justify-center items-center h-64">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="space-y-6">
      <div class="flex items-center space-x-4 mb-6">
        <button
          @click="goBack"
          class="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <ArrowLeftIcon class="w-5 h-5" />
        </button>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">AI Profile</h1>
      </div>

      <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <svg class="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.728-.833-2.598 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
            </svg>
          </div>
          <div class="ml-3">
            <h3 class="text-lg font-medium text-red-800 dark:text-red-200">
              Failed to Load AI Profile
            </h3>
            <div class="mt-2 text-sm text-red-700 dark:text-red-300">
              <p>{{ error }}</p>
              <p class="mt-2">Profile ID: {{ profileId }}</p>
            </div>
            <div class="mt-4">
              <button
                @click="loadProfile"
                class="bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-200 px-3 py-2 rounded-md text-sm font-medium hover:bg-red-200 dark:hover:bg-red-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="profileData" class="space-y-8">
      <!-- Header -->
      <div class="mb-8">
        <div class="flex items-center space-x-4 mb-6">
          <button
            @click="goBack"
            class="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <ArrowLeftIcon class="w-5 h-5" />
          </button>

          <div class="flex items-center space-x-4">
            <AvatarComponent
              :text="profileData.profile.name"
              size="large"
            />
            <div>
              <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
                {{ profileData.profile.name }}
              </h1>
              <div class="flex items-center space-x-3 mt-2">
                <span v-if="profileData.profile.is_system" class="px-3 py-1 text-sm bg-purple-100 text-purple-800 rounded-full flex items-center">
                  <SparklesIcon class="w-4 h-4 mr-1" />
                  System Profile
                </span>
                <span v-if="profileData.profile.is_default" class="px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded-full">
                  Default
                </span>
                <span class="text-sm text-gray-500 dark:text-gray-400">
                  Tone: {{ profileData.profile.tone_key }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <!-- Main content -->
        <div class="lg:col-span-2 space-y-6">
          <!-- AI Prompt -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
            <div class="p-6">
              <div class="flex justify-between items-center mb-4">
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white flex items-center">
                  <CodeBracketIcon class="w-6 h-6 mr-2" />
                  AI Prompt
                </h2>
                <button
                  v-if="profileData.profile.system_prompt.length > 200"
                  @click="showFullPrompt = !showFullPrompt"
                  class="px-3 py-1 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium transition-colors"
                >
                  {{ showFullPrompt ? 'Show less' : 'Show full prompt' }}
                </button>
              </div>

              <div class="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 font-mono text-sm">
                <pre class="whitespace-pre-wrap text-gray-800 dark:text-gray-200">{{ showFullPrompt ? profileData.profile.system_prompt : promptPreview }}</pre>
              </div>
            </div>
          </div>

          <!-- Comment History -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
            <div class="p-6">
              <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-6 flex items-center">
                <ChatBubbleLeftRightIcon class="w-6 h-6 mr-2" />
                Comment History ({{ profileData.reviews.length }})
              </h2>

              <div v-if="profileData.reviews.length > 0" class="space-y-6">
                <div
                  v-for="review in profileData.reviews"
                  :key="review.id"
                  class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-gray-300 dark:hover:border-gray-600 transition-colors cursor-pointer"
                  @click="navigateToChapter(review)"
                >
                  <!-- Review Header -->
                  <div class="flex items-start justify-between mb-3">
                    <div class="flex-1">
                      <h3 class="font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                        {{ review.book_title }}
                        <span v-if="review.chapter_title" class="text-gray-500"> → {{ review.chapter_title }}</span>
                        <span v-else class="text-gray-500"> → Chapter {{ review.chapter_id }}</span>
                      </h3>
                      <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {{ formatDate(review.created_at) }}
                      </p>
                    </div>
                    <div class="text-xs text-blue-600 dark:text-blue-400 font-medium">
                      View in context →
                    </div>
                  </div>

                  <!-- Review Content Preview -->
                  <div class="prose prose-sm prose-gray dark:prose-invert max-w-none">
                    <MarkdownRenderer :text="review.review_text.length > 300 ? review.review_text.substring(0, 300) + '...' : review.review_text" />
                  </div>
                </div>
              </div>

              <div v-else class="text-center py-12 text-gray-500 dark:text-gray-400">
                <ChatBubbleLeftRightIcon class="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>No comments yet from this AI profile.</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Sidebar -->
        <div class="space-y-6">
          <!-- Profile Info -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
            <div class="p-6">
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                <UserCircleIcon class="w-5 h-5 mr-2" />
                Profile Info
              </h3>

              <div class="space-y-3 text-sm">
                <div>
                  <span class="font-medium text-gray-700 dark:text-gray-300">Created:</span>
                  <span class="ml-2 text-gray-600 dark:text-gray-400">{{ formattedCreatedDate }}</span>
                </div>

                <div>
                  <span class="font-medium text-gray-700 dark:text-gray-300">Type:</span>
                  <span class="ml-2 text-gray-600 dark:text-gray-400">
                    {{ profileData.profile.is_system ? 'System Profile' : 'User Profile' }}
                  </span>
                </div>

                <div v-if="profileData.profile.is_default">
                  <span class="font-medium text-gray-700 dark:text-gray-300">Status:</span>
                  <span class="ml-2 text-green-600 dark:text-green-400">Default Profile</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Activity Stats -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
            <div class="p-6">
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                <ClockIcon class="w-5 h-5 mr-2" />
                Activity
              </h3>

              <div class="space-y-3 text-sm">
                <div class="flex justify-between">
                  <span class="text-gray-700 dark:text-gray-300">Total Reviews:</span>
                  <span class="font-medium text-gray-900 dark:text-white">{{ profileData.reviews.length }}</span>
                </div>

                <div v-if="profileData.reviews.length > 0" class="flex justify-between">
                  <span class="text-gray-700 dark:text-gray-300">Latest Review:</span>
                  <span class="text-gray-600 dark:text-gray-400">
                    {{ formatDate(profileData.reviews[0].created_at).split(',')[0] }}
                  </span>
                </div>

                <div class="flex justify-between">
                  <span class="text-gray-700 dark:text-gray-300">Books Reviewed:</span>
                  <span class="font-medium text-gray-900 dark:text-white">
                    {{ new Set(profileData.reviews.map(r => r.book_id)).size }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
