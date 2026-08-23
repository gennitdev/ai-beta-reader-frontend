<script setup lang="ts">
import { RouterView } from 'vue-router'
import { createExampleDatabase, READ_ONLY_MESSAGE } from '@/demo/exampleDatabase'
import { provideDatabase, useLocalDatabase } from '@/composables/useDatabase'
import { provideLibraryContext } from '@/composables/useLibraryContext'

const example = createExampleDatabase(useLocalDatabase())
provideDatabase(example.api)
provideLibraryContext({
  readOnly: true,
  readOnlyReason: READ_ONLY_MESSAGE,
  booksPath: '/example-books',
})
</script>

<template>
  <div>
    <div class="mx-auto mt-4 max-w-7xl px-4 sm:px-6">
      <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold-200 bg-gold-50 px-4 py-3 dark:border-gold-800 dark:bg-gold-950/30">
        <div>
          <p class="font-semibold text-navy-900 dark:text-gold-100">Exploring read-only example books</p>
          <p class="text-sm text-gray-600 dark:text-gray-300">These controls show how Beta Bot works, but your own library will not be changed.</p>
        </div>
        <RouterLink to="/books" class="text-sm font-semibold text-gold-700 hover:underline dark:text-gold-300">Create or import your own book →</RouterLink>
      </div>
    </div>
    <RouterView />
  </div>
</template>
