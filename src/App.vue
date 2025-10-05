<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router'
import { UserIcon } from '@heroicons/vue/24/outline'
import { computed, watch } from 'vue'
import { useDatabase } from '@/composables/useDatabase'

const route = useRoute()
const { books, chapters, loadBooks, loadChapters, getWikiPage } = useDatabase()

// Load books on mount
loadBooks()

// Watch for route changes and load relevant data
watch(
  () => route.params,
  async (params) => {
    const bookId = (params.bookId || params.id) as string | undefined
    if (bookId) {
      await loadChapters(bookId)
    }
  },
  { immediate: true }
)

// Breadcrumb computation
const breadcrumbs = computed(() => {
  const path = route.path
  const crumbs: Array<{ label: string; to?: string }> = []

  // Check if we're on a book-related page
  if (path.includes('/books/')) {
    // Always add Books as first breadcrumb
    crumbs.push({ label: 'Books', to: '/books' })

    // Extract bookId from various route formats
    const bookId = (route.params.bookId || route.params.id) as string | undefined

    if (bookId) {
      // Find the book title
      const book = books.value.find((b: any) => b.id === bookId)
      const bookTitle = book?.title || bookId

      // Add book breadcrumb if we're deeper than just /books/:id
      const isBookDetailPage = path === `/books/${bookId}` && !path.includes('/chapters/') && !path.includes('/wiki/')

      if (isBookDetailPage) {
        // Just on the book page - show as current (no link)
        crumbs.push({ label: bookTitle })
      } else {
        // We're on a sub-page (chapter/wiki) - make book clickable
        crumbs.push({ label: bookTitle, to: `/books/${bookId}` })

        // Add chapter or wiki page breadcrumb
        if (path.includes('/chapters/')) {
          const chapterId = route.params.chapterId as string
          // Try to find the chapter title
          const chapter = chapters.value.find((ch: any) => ch.id === chapterId)
          const chapterLabel = chapter?.title || chapterId
          crumbs.push({ label: chapterLabel })
        } else if (path.includes('/wiki/')) {
          const wikiPageId = route.params.wikiPageId as string
          crumbs.push({ label: 'Wiki' })
        } else if (path.includes('/chapter-editor')) {
          crumbs.push({ label: 'Chapter Editor' })
        }
      }
    }
  }

  return crumbs
})

const showBreadcrumbs = computed(() => breadcrumbs.value.length > 0)
</script>

<template>
  <div class="h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Header -->
    <header class="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
      <div class="px-4 sm:px-6">
        <!-- Desktop layout: single row -->
        <div class="hidden md:flex justify-between items-center h-16">
          <!-- Logo and Breadcrumbs / Navigation -->
          <div class="flex items-center space-x-6">
            <router-link to="/" class="flex items-center">
              <h1 class="text-2xl font-bold text-gray-900 dark:text-white space-grotesk-logo">Beta-bot</h1>
            </router-link>

            <!-- Show breadcrumbs if available, otherwise show main nav -->
            <nav v-if="showBreadcrumbs" class="flex items-center text-sm">
              <template v-for="(crumb, index) in breadcrumbs" :key="index">
                <router-link
                  v-if="crumb.to"
                  :to="crumb.to"
                  class="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                >
                  {{ crumb.label }}
                </router-link>
                <span
                  v-else
                  class="text-gray-700 dark:text-gray-300"
                >
                  {{ crumb.label }}
                </span>
                <span
                  v-if="index < breadcrumbs.length - 1"
                  class="mx-2 text-gray-400 dark:text-gray-500"
                >
                  >
                </span>
              </template>
            </nav>
            <nav v-else class="flex items-center space-x-6">
              <router-link
                to="/books"
                class="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors"
                active-class="text-blue-600 dark:text-blue-400"
              >
                My Books
              </router-link>
            </nav>
          </div>

          <!-- Right side menu -->
          <div class="flex items-center space-x-4">
            <!-- Settings menu -->
            <router-link
              to="/settings"
              class="flex items-center space-x-2 hover:opacity-80 transition-opacity"
              title="Settings"
            >
              <div class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                <UserIcon class="w-5 h-5 text-white" />
              </div>
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
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

        <!-- Mobile layout: two rows -->
        <div class="md:hidden py-3">
          <!-- First row: Logo and right menu -->
          <div class="flex justify-between items-center mb-2">
            <router-link to="/" class="flex items-center">
              <h1 class="text-2xl font-bold text-gray-900 dark:text-white space-grotesk-logo">Beta-bot</h1>
            </router-link>

            <div class="flex items-center space-x-2">
              <!-- Settings menu -->
              <router-link
                to="/settings"
                class="flex items-center hover:opacity-80 transition-opacity"
                title="Settings"
              >
                <div class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                  <UserIcon class="w-5 h-5 text-white" />
                </div>
              </router-link>

              <a
                href="https://github.com/gennitdev/ai-beta-reader-frontend"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center p-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                title="View on GitHub"
              >
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                </svg>
              </a>
            </div>
          </div>

          <!-- Second row: Breadcrumbs or Nav (wraps as a single unit) -->
          <nav v-if="showBreadcrumbs" class="flex flex-wrap items-center text-sm">
            <template v-for="(crumb, index) in breadcrumbs" :key="index">
              <router-link
                v-if="crumb.to"
                :to="crumb.to"
                class="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors whitespace-nowrap"
              >
                {{ crumb.label }}
              </router-link>
              <span
                v-else
                class="text-gray-700 dark:text-gray-300 whitespace-nowrap"
              >
                {{ crumb.label }}
              </span>
              <span
                v-if="index < breadcrumbs.length - 1"
                class="mx-2 text-gray-400 dark:text-gray-500 whitespace-nowrap"
              >
                >
              </span>
            </template>
          </nav>
          <nav v-else class="flex items-center">
            <router-link
              to="/books"
              class="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors"
              active-class="text-blue-600 dark:text-blue-400"
            >
              My Books
            </router-link>
          </nav>
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
