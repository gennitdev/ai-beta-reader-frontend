<script setup lang="ts">
import { RouterView, RouterLink, useRoute, useRouter } from 'vue-router'
import { MagnifyingGlassIcon, PlusIcon, Bars3Icon, XMarkIcon, Cog6ToothIcon } from '@heroicons/vue/24/outline'
import { computed, watch, ref, onMounted, onUnmounted } from 'vue'
import { useDatabase } from '@/composables/useDatabase'
import SearchModal from '@/components/SearchModal.vue'
import BrowserStorageNotice from '@/components/BrowserStorageNotice.vue'
import logoHorizontal from '@/assets/logo-horizontal.png'
import logoStacked from '@/assets/logo-stacked.png'
import { primaryNavItems } from '@/config/navigation'
import type { Book, Chapter } from '@/lib/database'
import type { FindReplaceScope } from '@/lib/findReplace'

const route = useRoute()
const router = useRouter()
const {
  books,
  chapters,
  loadBooks,
  loadChapters,
  getParts,
  findReplaceMatches,
  replaceFindReplaceMatches,
  restoreFindReplaceFields,
} = useDatabase()

// Parts data for breadcrumbs
const parts = ref<Array<{ id: string; name: string }>>([])

// Search modal state
const showSearchModal = ref(false)

// Search service for the modal
const searchService = {
  findReplaceMatches,
  replaceFindReplaceMatches,
  restoreFindReplaceFields,
}

const isSideNavOpen = ref(false)
const sideNavItems = computed(() => primaryNavItems)

const toggleSideNav = () => {
  isSideNavOpen.value = !isSideNavOpen.value
}

const closeSideNav = () => {
  isSideNavOpen.value = false
}

// Books for side nav
const sortedBooks = computed(() => {
  return [...books.value].sort((a: Book, b: Book) => {
    const aDate = new Date(a.created_at ?? 0).getTime()
    const bDate = new Date(b.created_at ?? 0).getTime()
    return bDate - aDate
  })
})

const isBookActive = (bookId: string) => route.path.startsWith(`/books/${bookId}`)


// Keyboard shortcut for search
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === '/' && !showSearchModal.value && currentBookId.value) {
    // Only if not already in an input
    if (e.target instanceof HTMLElement && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
      return
    }
    e.preventDefault()
    showSearchModal.value = true
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

// Get current book ID from route
const currentBookId = computed(() => {
  const bookId = (route.params.bookId || route.params.id) as string | undefined
  return bookId || null
})
const contextualSearchScope = computed<FindReplaceScope>(() => {
  if (route.params.chapterId) return 'chapter'
  if (route.params.wikiPageId) return 'wikiPage'
  return 'book'
})
const contextualSearchTargetId = computed(() => {
  const targetId = route.params.chapterId || route.params.wikiPageId
  return typeof targetId === 'string' ? targetId : undefined
})

const goToNewChapter = () => {
  if (!currentBookId.value) return
  router.push(`/books/${currentBookId.value}/chapter-editor`)
}

// Load books on mount
loadBooks()

// Watch for route changes and load relevant data
watch(
  () => route.params,
  async (params) => {
    const bookId = (params.bookId || params.id) as string | undefined
    if (bookId) {
      await loadChapters(bookId)
      // Load parts for breadcrumb navigation
      try {
        parts.value = await getParts(bookId)
      } catch (e) {
        console.error('Failed to load parts for breadcrumbs:', e)
        parts.value = []
      }
    }
  },
  { immediate: true }
)

watch(
  () => route.path,
  () => {
    closeSideNav()
  }
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
      const book = books.value.find((b: Book) => b.id === bookId)
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
          const chapter = chapters.value.find((ch: Chapter) => ch.id === chapterId)

          // If chapter belongs to a part, add part breadcrumb first
          if (chapter?.part_id) {
            const part = parts.value.find((p) => p.id === chapter.part_id)
            if (part) {
              crumbs.push({
                label: part.name,
                to: `/books/${bookId}/parts/${chapter.part_id}`
              })
            }
          }

          const chapterLabel = chapter?.title || chapterId
          crumbs.push({ label: chapterLabel })
        } else if (path.includes('/parts/')) {
          const partId = route.params.partId as string
          // Find the part name
          const part = parts.value.find((p) => p.id === partId)
          const partLabel = part?.name || partId
          crumbs.push({ label: partLabel })
        } else if (path.includes('/wiki/')) {
          crumbs.push({ label: 'Wiki' })
        } else if (path.includes('/organize')) {
          crumbs.push({ label: 'Organize Chapters' })
        } else if (path.includes('/chapter-editor')) {
          crumbs.push({ label: 'Chapter Editor' })
        }
      }
    }
  }

  return crumbs
})

const showBreadcrumbs = computed(() => breadcrumbs.value.length > 0)
const isSettingsRoute = computed(() => route.path.startsWith('/settings'))
</script>

<template>
  <div class="h-screen overflow-hidden bg-gray-50 dark:bg-navy-900 flex">
    <div class="flex-1 flex flex-col min-w-0 min-h-0">
      <!-- Header -->
      <header class="bg-navy-900 border-b border-navy-800 shadow-sm safe-area-top">
        <div class="px-4 sm:px-6">
        <!-- Desktop layout -->
        <div
          class="hidden md:flex md:w-full md:flex-wrap md:items-start md:justify-between md:gap-y-2 md:py-3 lg:flex-nowrap lg:items-center lg:justify-between lg:h-14 lg:py-0"
        >
          <!-- Logo and Breadcrumbs / Navigation -->
          <div
            class="flex items-center gap-x-6 md:order-2 md:basis-full md:min-w-0 md:flex-wrap md:gap-y-2 lg:order-1 lg:flex-nowrap"
          >
            <button
              @click="toggleSideNav"
              :aria-expanded="isSideNavOpen"
              aria-controls="side-nav"
              class="p-2 text-gray-300 hover:text-white hover:bg-navy-800 rounded-md transition-colors"
              aria-label="Toggle navigation"
            >
              <Bars3Icon v-if="!isSideNavOpen" class="w-6 h-6" />
              <XMarkIcon v-else class="w-6 h-6" />
            </button>
            <router-link to="/" class="flex items-center flex-shrink-0">
              <img :src="logoHorizontal" alt="beta bot" class="h-8 w-auto" />
            </router-link>

            <!-- Show breadcrumbs if available, otherwise show main nav -->
            <nav v-if="showBreadcrumbs" class="flex items-center text-sm whitespace-nowrap">
              <template v-for="(crumb, index) in breadcrumbs" :key="index">
                <router-link
                  v-if="crumb.to"
                  :to="crumb.to"
                  class="text-gold-300 hover:text-gold-200 transition-colors"
                >
                  {{ crumb.label }}
                </router-link>
                <span
                  v-else
                  class="text-gray-200"
                >
                  {{ crumb.label }}
                </span>
                <span
                  v-if="index < breadcrumbs.length - 1"
                  class="mx-2 text-gray-500"
                >
                  >
                </span>
              </template>
            </nav>
            <nav v-else-if="!isSettingsRoute" class="flex items-center space-x-6 whitespace-nowrap">
              <router-link
                to="/books"
                class="text-gray-200 hover:text-gold-300 font-medium transition-colors"
                active-class="text-gold-300"
              >
                My Books
              </router-link>
            </nav>
          </div>

          <!-- Right side menu -->
          <div class="flex items-center space-x-4 md:order-1 md:w-full md:justify-end lg:order-2 lg:w-auto">
            <button
              v-if="currentBookId"
              @click="goToNewChapter"
              class="hidden md:flex items-center justify-center p-2 text-gray-300 hover:text-white hover:bg-navy-800 rounded-md transition-colors"
              title="New Chapter"
              aria-label="Create new chapter"
            >
              <PlusIcon class="w-5 h-5" />
            </button>
            <!-- Search bar (desktop) -->
            <button
              v-if="currentBookId"
              @click="showSearchModal = true"
              class="hidden md:flex items-center px-3 py-1.5 text-sm text-gray-300 bg-navy-800 hover:bg-navy-700 rounded-md border border-navy-700 transition-colors"
            >
              <MagnifyingGlassIcon class="w-4 h-4 mr-2" />
              <span class="whitespace-nowrap">
                Type
                <kbd
                  class="px-1 py-0.5 text-xs font-semibold text-gray-200 bg-navy-900 border border-navy-700 rounded"
                >
                  /
                </kbd>
                to search
              </span>
            </button>

            <!-- Search button (mobile) -->
            <button
              v-if="currentBookId"
              @click="showSearchModal = true"
              class="md:hidden text-gray-300 hover:text-white hover:bg-navy-800 rounded-md transition-colors"
              title="Search"
            >
              <MagnifyingGlassIcon class="w-5 h-5" />
            </button>
            <!-- Settings menu -->
            <router-link
              to="/settings"
              class="flex items-center space-x-2 hover:opacity-80 transition-opacity"
              title="Settings"
            >
              <div class="w-8 h-8 bg-gold-500 rounded-full flex items-center justify-center">
                <Cog6ToothIcon class="w-5 h-5 text-navy-900" />
              </div>
              <span class="text-sm font-medium text-gray-200">
                Settings
              </span>
            </router-link>

            <a
              href="https://github.com/gennitdev/ai-beta-reader-frontend"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center px-3 py-2 text-gray-300 hover:text-white transition-colors"
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
          <!-- First row: menu toggle, logo, and quick actions -->
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center space-x-3">
              <button
                @click="toggleSideNav"
                :aria-expanded="isSideNavOpen"
                aria-controls="side-nav"
                class="p-2 text-gray-300 hover:text-white hover:bg-navy-800 rounded-md transition-colors"
                aria-label="Toggle navigation"
              >
                <Bars3Icon v-if="!isSideNavOpen" class="w-6 h-6" />
                <XMarkIcon v-else class="w-6 h-6" />
              </button>
              <router-link to="/" class="flex items-center">
                <img :src="logoHorizontal" alt="beta bot" class="h-8 w-auto" />
              </router-link>
            </div>

            <div class="flex items-center space-x-2">
              <!-- Search button (mobile) -->
              <button
                v-if="currentBookId"
                @click="showSearchModal = true"
                class="p-2 text-gray-300 hover:text-white hover:bg-navy-800 rounded-md transition-colors"
                title="Search"
              >
                <MagnifyingGlassIcon class="w-5 h-5" />
              </button>
              <button
                v-if="currentBookId"
                @click="goToNewChapter"
                class="p-2 text-gray-300 hover:text-white hover:bg-navy-800 rounded-md transition-colors"
                title="New Chapter"
                aria-label="Create new chapter"
              >
                <PlusIcon class="w-5 h-5" />
              </button>

              <!-- Settings menu -->
              <router-link
                to="/settings"
                class="flex items-center hover:opacity-80 transition-opacity"
                title="Settings"
              >
                <div class="w-8 h-8 bg-gold-500 rounded-full flex items-center justify-center">
                  <Cog6ToothIcon class="w-5 h-5 text-navy-900" />
                </div>
              </router-link>

              <a
                href="https://github.com/gennitdev/ai-beta-reader-frontend"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center p-2 text-gray-300 hover:text-white transition-colors"
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
                class="text-gold-300 hover:text-gold-200 transition-colors whitespace-nowrap"
              >
                {{ crumb.label }}
              </router-link>
              <span
                v-else
                class="text-gray-200 whitespace-nowrap"
              >
                {{ crumb.label }}
              </span>
              <span
                v-if="index < breadcrumbs.length - 1"
                class="mx-2 text-gray-500 whitespace-nowrap"
              >
                >
              </span>
            </template>
          </nav>
          <nav v-else-if="!isSettingsRoute" class="flex items-center">
            <router-link
              to="/books"
              class="text-gray-200 hover:text-gold-300 font-medium transition-colors"
              active-class="text-gold-300"
            >
              My Books
            </router-link>
          </nav>
        </div>
      </div>
      </header>

      <!-- Main content -->
      <BrowserStorageNotice />
      <main class="flex-1 min-h-0 overflow-y-auto">
        <RouterView />
      </main>

      <!-- Search Modal -->
      <SearchModal
        v-if="currentBookId"
        :show="showSearchModal"
        :book-id="currentBookId"
        :search-service="searchService"
        :initial-scope="contextualSearchScope"
        :target-id="contextualSearchTargetId"
        @close="showSearchModal = false"
      />

      <Teleport to="body">
        <div v-if="isSideNavOpen" class="fixed inset-0 z-40">
          <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="closeSideNav" />
          <div
            id="side-nav"
            class="absolute inset-y-0 left-0 flex h-full w-72 max-w-[85%] flex-col bg-white px-6 py-6 shadow-xl dark:bg-navy-900"
          >
            <div class="mb-4 flex items-start justify-between">
              <router-link
                to="/"
                class="block overflow-hidden rounded-xl ring-1 ring-navy-900/10 transition-opacity hover:opacity-90"
                @click="closeSideNav"
                aria-label="beta bot home"
              >
                <img :src="logoStacked" alt="beta bot" class="h-28 w-28 object-cover" />
              </router-link>
              <button
                @click="closeSideNav"
                class="rounded-md p-1.5 text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-navy-800"
                aria-label="Close navigation"
              >
                <XMarkIcon class="h-5 w-5" />
              </button>
            </div>

            <nav class="flex-1 space-y-1 overflow-y-auto">
              <RouterLink
                v-for="item in sideNavItems"
                :key="item.to"
                :to="item.to"
                custom
                v-slot="{ href, navigate, isActive }"
              >
                <a
                  :href="href"
                  class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                  :class="isActive
                    ? 'bg-gold-100 text-gold-600 dark:bg-gold-900/40 dark:text-gold-300'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-navy-800'"
                  :aria-current="isActive ? 'page' : undefined"
                  @click.prevent="navigate(); closeSideNav()"
                >
                  <component :is="item.icon" class="h-4 w-4" />
                  <span>{{ item.label }}</span>
                </a>
              </RouterLink>

              <!-- Books section -->
              <template v-if="sortedBooks.length">
                <div class="pt-4 pb-2">
                  <h3 class="px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    My Books
                  </h3>
                </div>
                <router-link
                  v-for="book in sortedBooks"
                  :key="book.id"
                  :to="`/books/${book.id}`"
                  class="block rounded-lg px-3 py-1.5 text-sm leading-snug transition-colors"
                  :class="isBookActive(book.id)
                    ? 'bg-gold-100 text-gold-600 dark:bg-gold-900/40 dark:text-gold-300'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-navy-800'"
                  :aria-current="isBookActive(book.id) ? 'page' : undefined"
                  @click="closeSideNav"
                >
                  {{ book.title || book.id }}
                </router-link>
              </template>
            </nav>
          </div>
        </div>
      </Teleport>
    </div>
  </div>
</template>

<style>
.space-grotesk-logo {
  font-family: "Space Grotesk", sans-serif;
  font-optical-sizing: auto;
  font-weight: 600;
  font-style: normal;
}

.safe-area-top {
  padding-top: constant(safe-area-inset-top);
  padding-top: env(safe-area-inset-top);
}
</style>
