<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useAuth0 } from '@auth0/auth0-vue'
import { UserIcon, BookOpenIcon, ArrowRightOnRectangleIcon } from '@heroicons/vue/24/outline'

const { isLoading, isAuthenticated, user, loginWithRedirect, logout } = useAuth0()

const handleLogin = () => {
  loginWithRedirect()
}

const handleLogout = () => {
  logout({ logoutParams: { returnTo: window.location.origin } })
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Header -->
    <header class="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center h-16">
          <!-- Logo -->
          <div class="flex items-center">
            <router-link to="/books" class="flex items-center">
              <BookOpenIcon class="w-8 h-8 text-blue-600 mr-3" />
              <h1 class="text-xl font-bold text-gray-900 dark:text-white">AI Beta Reader</h1>
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

      <div v-else-if="!isAuthenticated" class="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <div class="text-center max-w-md mx-auto px-6">
          <BookOpenIcon class="w-16 h-16 text-blue-600 mx-auto mb-6" />
          <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Welcome to AI Beta Reader
          </h2>
          <p class="text-gray-600 dark:text-gray-400 mb-8">
            Get AI-powered feedback on your creative writing. Track your books, organize chapters, and receive intelligent reviews that consider your story's context.
          </p>
          <button
            @click="handleLogin"
            class="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-lg"
          >
            Get Started
          </button>
        </div>
      </div>

      <RouterView v-else />
    </main>
  </div>
</template>

<style>
/* Remove the default styles */
</style>