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
const trailingNavItems = computed(() => navItems.value.slice(1))

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

const getBookInitials = (title: string | null | undefined) => {
  if (!title) return '??'
  const normalized = title.trim()
  if (!normalized) return '??'
  const words = normalized.split(/\s+/)
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase()
  }
  return (words[0][0] + (words[1]?.[0] ?? '')).toUpperCase()
}
</script>

<template>
  <aside
    class="hidden md:flex h-full w-20 flex-col items-center bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 py-6 space-y-6"
    aria-label="Primary navigation"
  >
    <router-link
      to="/"
      class="flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600 text-white font-semibold text-lg hover:bg-blue-500 transition-colors"
      aria-label="Go to dashboard"
    >
      B
    </router-link>

    <nav class="flex flex-col items-center space-y-4">
      <router-link
        v-if="firstNavItem"
        :to="firstNavItem.to"
        :aria-label="firstNavItem.label"
        :aria-current="firstNavItem.isActive(currentPath) ? 'page' : undefined"
        class="group flex items-center justify-center w-12 h-12 rounded-xl transition-all"
        :class="firstNavItem.isActive(currentPath)
          ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300 shadow-sm'
          : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:text-gray-400 dark:hover:text-blue-300 dark:hover:bg-gray-800'"
      >
        <component :is="firstNavItem.icon" class="w-6 h-6" />
        <span class="sr-only">{{ firstNavItem.label }}</span>
      </router-link>

      <template v-if="sortedBooks.length">
        <div class="h-px w-8 bg-gray-200 dark:bg-gray-800" aria-hidden="true"></div>
        <router-link
          v-for="book in sortedBooks"
          :key="book.id"
          :to="`/books/${book.id}`"
          :title="book.title || book.id"
          class="group flex items-center justify-center w-12 h-12 rounded-xl border transition-all"
          :class="isBookActive(book.id)
            ? 'border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-700/60 dark:bg-blue-900/40 dark:text-blue-200 shadow-sm'
            : 'border-transparent text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:text-gray-400 dark:hover:text-blue-300 dark:hover:bg-gray-800'"
          :aria-current="isBookActive(book.id) ? 'page' : undefined"
        >
          <span class="text-sm font-semibold uppercase">
            {{ getBookInitials(book.title) }}
          </span>
          <span class="sr-only">{{ book.title || book.id }}</span>
        </router-link>
        <div class="h-px w-8 bg-gray-200 dark:bg-gray-800" aria-hidden="true"></div>
      </template>

      <router-link
        v-for="item in trailingNavItems"
        :key="item.to"
        :to="item.to"
        :aria-label="item.label"
        :aria-current="item.isActive(currentPath) ? 'page' : undefined"
        class="group flex items-center justify-center w-12 h-12 rounded-xl transition-all"
        :class="item.isActive(currentPath)
          ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300 shadow-sm'
          : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:text-gray-400 dark:hover:text-blue-300 dark:hover:bg-gray-800'"
      >
        <component :is="item.icon" class="w-6 h-6" />
        <span class="sr-only">{{ item.label }}</span>
      </router-link>
    </nav>
  </aside>
</template>
