<script setup lang="ts">
import { RouterView } from 'vue-router'
import { UserIcon } from '@heroicons/vue/24/outline'
</script>

<template>
  <div class="h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Header -->
    <header class="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
      <div class="px-4 sm:px-6">
        <div class="flex justify-between items-center h-16">
          <!-- Logo -->
          <div class="flex items-center">
            <router-link to="/" class="flex items-center">
              <h1 class="text-2xl font-bold text-gray-900 dark:text-white space-grotesk-logo">Beta-bot</h1>
            </router-link>
          </div>

          <!-- Navigation -->
          <div class="flex items-center space-x-4">
            <nav class="hidden md:flex items-center space-x-6">
              <router-link
                to="/books"
                class="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors"
                active-class="text-blue-600 dark:text-blue-400"
              >
                My Books
              </router-link>
            </nav>

            <!-- Settings menu -->
            <router-link
              to="/settings"
              class="flex items-center space-x-2 hover:opacity-80 transition-opacity"
              title="Settings"
            >
              <div class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                <UserIcon class="w-5 h-5 text-white" />
              </div>
              <span class="hidden sm:block text-sm font-medium text-gray-700 dark:text-gray-300">
                Settings
              </span>
            </router-link>

            <a
              href="https://github.com/gennitdev/ai-beta-reader-frontend"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center px-3 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
              title="View on GitHub"
            >
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
            </a>
          </div>
        </div>
      </div>
    </header>

    <!-- Main content -->
    <main class="flex-1">
      <RouterView />
    </main>
  </div>
</template>

<style>
.space-grotesk-logo {
  font-family: "Space Grotesk", sans-serif;
  font-optical-sizing: auto;
  font-weight: 600;
  font-style: normal;
}
</style>
