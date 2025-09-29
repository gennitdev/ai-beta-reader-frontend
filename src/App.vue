<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useAuth0 } from '@auth0/auth0-vue'
import { useAuthWithProfile } from '@/composables/useAuth'
import { UserIcon, ArrowRightOnRectangleIcon } from '@heroicons/vue/24/outline'

const { isLoading, isAuthenticated, user, loginWithRedirect, logout } = useAuth0()

// Automatically initialize user profile when authenticated
const { profileInitialized, profileError } = useAuthWithProfile()

const handleLogin = () => {
  loginWithRedirect()
}

const handleLogout = () => {
  logout({ logoutParams: { returnTo: window.location.origin } })
}
</script>

<template>
  <div class="h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Header -->
    <header class="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
      <div class="px-4 sm:px-6">
        <div class="flex justify-between items-center h-16">
          <!-- Logo -->
          <div class="flex items-center">
            <router-link :to="isAuthenticated ? '/books' : '/'" class="flex items-center">
              <h1 class="text-2xl font-bold text-gray-900 dark:text-white space-grotesk-logo">Beta Bot</h1>
            </router-link>
          </div>

          <!-- Navigation & Auth -->
          <div class="flex items-center space-x-4">
            <template v-if="isLoading">
              <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </template>

            <template v-else-if="isAuthenticated">
              <nav class="hidden md:flex items-center space-x-6">
                <router-link
                  to="/books"
                  class="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors"
                  active-class="text-blue-600 dark:text-blue-400"
                >
                  My Books
                </router-link>
              </nav>

              <!-- User menu -->
              <div class="flex items-center space-x-3">
                <router-link
                  to="/settings"
                  class="flex items-center space-x-2 hover:opacity-80 transition-opacity"
                  title="User Settings"
                >
                  <div class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                    <UserIcon class="w-5 h-5 text-white" />
                  </div>
                  <span class="hidden sm:block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {{ user?.name || user?.email }}
                  </span>
                </router-link>

                <button
                  @click="handleLogout"
                  class="inline-flex items-center px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                  title="Logout"
                >
                  <ArrowRightOnRectangleIcon class="w-5 h-5" />
                  <span class="hidden sm:block ml-2">Logout</span>
                </button>
              </div>
            </template>

            <template v-else>
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
              <button
                @click="handleLogin"
                class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Login
              </button>
            </template>
          </div>
        </div>
      </div>
    </header>

    <!-- Main content -->
    <main class="flex-1">
      <div v-if="isLoading" class="flex items-center justify-center h-64">
        <div class="text-center">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p class="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>

      <RouterView v-else-if="!isAuthenticated" />

      <div v-else-if="profileError" class="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <div class="text-center max-w-md mx-auto px-6">
          <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg class="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.728-.833-2.598 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
            </svg>
          </div>
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Profile Setup Failed
          </h2>
          <p class="text-gray-600 dark:text-gray-400 mb-6">
            {{ profileError }}
          </p>
          <button
            @click="handleLogout"
            class="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Sign Out and Try Again
          </button>
        </div>
      </div>

      <div v-else-if="!profileInitialized" class="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <div class="text-center">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p class="text-gray-600 dark:text-gray-400">Setting up your profile...</p>
        </div>
      </div>

      <RouterView v-else />
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
