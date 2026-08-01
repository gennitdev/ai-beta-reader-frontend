<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { primaryNavItems } from '@/config/navigation'
import { useDatabase } from '@/composables/useDatabase'
import type { Book } from '@/lib/database'

const route = useRoute()

const navItems = computed(() => primaryNavItems)
const currentPath = computed(() => route.path)

const firstNavItem = computed(() => navItems.value[0] ?? null)
const trailingNavItems = computed(() => navItems.value.slice(1).filter((item) => !item.featured))
const featuredNavItems = computed(() => navItems.value.filter((item) => item.featured))

const { books, loadBooks } = useDatabase()

onMounted(async () => {
  if (!books.value.length) {
    try {
      await loadBooks()
    } catch (error) {
      console.error('Failed to load books for sidenav:', error)
    }
  }
})

const sortedBooks = computed(() => {
  return [...books.value].sort((a: Book, b: Book) => {
    const aDate = new Date(a.created_at ?? 0).getTime()
    const bDate = new Date(b.created_at ?? 0).getTime()
    return bDate - aDate
  })
})

const isBookActive = (bookId: string) => currentPath.value.startsWith(`/books/${bookId}`)
</script>

<template>
  <aside
    class="hidden md:flex h-full w-36 flex-col bg-white dark:bg-navy-900 border-r border-gray-200 dark:border-gray-800 py-4 px-2 space-y-4"
    aria-label="Primary navigation"
  >
    <router-link
      to="/"
      class="flex items-center justify-center w-8 h-8 rounded-lg bg-gold-600 text-white font-semibold text-xs hover:bg-gold-500 transition-colors mx-auto"
      aria-label="Go to dashboard"
    >
      B
    </router-link>

    <nav class="flex flex-col space-y-2">
      <router-link
        v-if="firstNavItem"
        :to="firstNavItem.to"
        :aria-label="firstNavItem.label"
        :aria-current="firstNavItem.isActive(currentPath) ? 'page' : undefined"
        class="group flex items-center justify-center w-8 h-8 rounded-lg transition-all mx-auto"
        :class="firstNavItem.isActive(currentPath)
          ? 'bg-gold-100 text-gold-600 dark:bg-gold-900/40 dark:text-gold-300 shadow-sm'
          : 'text-gray-500 hover:text-gold-600 hover:bg-gold-50 dark:text-gray-400 dark:hover:text-gold-300 dark:hover:bg-navy-800'"
      >
        <component :is="firstNavItem.icon" class="w-4 h-4" />
        <span class="sr-only">{{ firstNavItem.label }}</span>
      </router-link>

      <template v-if="sortedBooks.length">
        <div class="h-px w-full bg-gray-200 dark:bg-navy-800" aria-hidden="true"></div>
        <router-link
          v-for="book in sortedBooks"
          :key="book.id"
          :to="`/books/${book.id}`"
          class="block px-2 py-1 rounded-md text-xs leading-tight transition-all"
          :class="isBookActive(book.id)
            ? 'bg-gold-100 text-gold-700 dark:bg-gold-900/40 dark:text-gold-200'
            : 'text-gray-600 hover:text-gold-600 hover:bg-gold-50 dark:text-gray-400 dark:hover:text-gold-300 dark:hover:bg-navy-800'"
          :aria-current="isBookActive(book.id) ? 'page' : undefined"
        >
          {{ book.title || book.id }}
        </router-link>
        <div class="h-px w-full bg-gray-200 dark:bg-navy-800" aria-hidden="true"></div>
      </template>

      <router-link
        v-for="item in trailingNavItems"
        :key="item.to"
        :to="item.to"
        :aria-label="item.label"
        :aria-current="item.isActive(currentPath) ? 'page' : undefined"
        class="group flex items-center justify-center w-8 h-8 rounded-lg transition-all mx-auto"
        :class="item.isActive(currentPath)
          ? 'bg-gold-100 text-gold-600 dark:bg-gold-900/40 dark:text-gold-300 shadow-sm'
          : 'text-gray-500 hover:text-gold-600 hover:bg-gold-50 dark:text-gray-400 dark:hover:text-gold-300 dark:hover:bg-navy-800'"
      >
        <component :is="item.icon" class="w-4 h-4" />
        <span class="sr-only">{{ item.label }}</span>
      </router-link>

      <div v-if="featuredNavItems.length" class="mx-auto mt-3 w-12 border-y border-amber-200 py-3 dark:border-amber-700/30">
        <router-link
          v-for="item in featuredNavItems"
          :key="item.to"
          :to="item.to"
          :aria-label="item.label"
          :aria-current="item.isActive(currentPath) ? 'page' : undefined"
          class="group mx-auto flex h-10 w-10 translate-x-1 items-center justify-center rounded-xl border shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          :class="item.isActive(currentPath)
            ? 'border-amber-400 bg-emerald-900 text-amber-200 ring-1 ring-amber-300'
            : 'border-amber-300 bg-gradient-to-br from-amber-100 to-emerald-100 text-emerald-900 hover:border-amber-400 dark:border-amber-700/50 dark:from-amber-950 dark:to-emerald-950 dark:text-amber-200'"
        >
          <component :is="item.icon" class="h-5 w-5" />
          <span class="sr-only">{{ item.label }}</span>
        </router-link>
      </div>
    </nav>
  </aside>
</template>
