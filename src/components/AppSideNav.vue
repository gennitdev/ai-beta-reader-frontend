<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { primaryNavItems } from '@/config/navigation'

const route = useRoute()

const navItems = computed(() => primaryNavItems)
const currentPath = computed(() => route.path)
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
        v-for="item in navItems"
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
