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
                <div class="flex items-center space-x-2">
                  <div class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                    <UserIcon class="w-5 h-5 text-white" />
                  </div>
                  <span class="hidden sm:block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {{ user?.name || user?.email }}
                  </span>
                </div>

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
