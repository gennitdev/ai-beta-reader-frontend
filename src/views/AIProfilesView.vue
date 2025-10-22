<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { SparklesIcon, ArrowTopRightOnSquareIcon } from '@heroicons/vue/24/outline'
import CustomProfilesPanel from '@/components/CustomProfilesPanel.vue'
import { BUILT_IN_PROFILES } from '@/lib/openai'

const builtInProfiles = computed(() => Object.values(BUILT_IN_PROFILES))
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <div class="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <header class="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div class="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/40 px-3 py-1 text-sm text-blue-700 dark:text-blue-300 font-medium">
            <SparklesIcon class="w-4 h-4 mr-2" />
            AI Profiles
          </div>
          <h1 class="mt-3 text-3xl font-bold text-gray-900 dark:text-white">
            Personalize Your AI Reviewers
          </h1>
          <p class="mt-2 max-w-2xl text-gray-600 dark:text-gray-400">
            Choose from our built-in reviewer personalities or craft your own custom profiles to shape how feedback is delivered.
          </p>
        </div>
        <RouterLink
          to="/books"
          class="inline-flex items-center px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-300 hover:text-blue-700 dark:hover:text-blue-200 transition-colors"
        >
          Browse Books
          <ArrowTopRightOnSquareIcon class="w-4 h-4 ml-2" />
        </RouterLink>
      </header>

      <section>
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Built-in Profiles
        </h2>
        <div class="grid gap-4 md:grid-cols-2">
          <article
            v-for="profile in builtInProfiles"
            :key="profile.id"
            class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 flex flex-col justify-between shadow-sm hover:shadow transition-shadow"
          >
            <div>
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                {{ profile.name }}
              </h3>
              <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
                {{ profile.description }}
              </p>
            </div>
            <RouterLink
              :to="`/ai-profiles/${profile.id}`"
              class="mt-6 inline-flex items-center text-sm font-medium text-blue-600 dark:text-blue-300 hover:text-blue-700 dark:hover:text-blue-200 transition-colors"
            >
              View profile details
              <ArrowTopRightOnSquareIcon class="w-4 h-4 ml-2" />
            </RouterLink>
          </article>
        </div>
      </section>

      <section>
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Your Custom Profiles
        </h2>
        <CustomProfilesPanel />
      </section>
    </div>
  </div>
</template>
