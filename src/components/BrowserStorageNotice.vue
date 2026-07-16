<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { initializeDatabase } from '@/composables/useDatabase'
import {
  getBrowserStorageSnapshot,
  type BrowserStorageSnapshot,
} from '@/lib/browserStorage'
import { isDesktopAppRuntime } from '@/utils/platform'

const snapshot = ref<BrowserStorageSnapshot | null>(null)
const dismissed = ref(false)
const isBrowserBuild = !isDesktopAppRuntime()

const message = computed(() => {
  if (!isBrowserBuild || !snapshot.value) return null
  if (snapshot.value.error) return snapshot.value.error
  const migration = snapshot.value.migrationStatus
  if (migration?.status === 'partial') {
    const count = migration.failedImageIds.length
    return `${count} legacy image${count === 1 ? '' : 's'} could not be migrated. The original data was retained.`
  }
  return null
})

onMounted(async () => {
  if (!isBrowserBuild) return
  try {
    await initializeDatabase()
  } finally {
    snapshot.value = await getBrowserStorageSnapshot()
  }
})
</script>

<template>
  <div
    v-if="message && !dismissed"
    role="alert"
    class="flex items-start justify-between gap-4 border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-100"
  >
    <p>
      {{ message }}
      <RouterLink to="/settings" class="font-medium underline">View storage details</RouterLink>
    </p>
    <button type="button" class="font-medium underline" @click="dismissed = true">Dismiss</button>
  </div>
</template>
