<script setup lang="ts">
import { DocumentTextIcon, PhotoIcon } from '@heroicons/vue/24/outline'
import type { ImageAsset } from '@/lib/database'

defineProps<{
  currentTab: 'chapters' | 'wiki' | 'images'
  selectedImageId?: string | null
  selectedImageSrc?: string | null
  selectedImage?: ImageAsset | null
  isOnBookOnly: boolean
  routerViewKey: number
  wikiPagePinChanged: (payload: { id: string; isPinned: boolean; updatedAt: string }) => void
}>()
</script>

<template>
  <div class="flex-1 bg-gray-50 dark:bg-gray-900 overflow-y-auto">
    <div v-if="currentTab === 'images' && selectedImageId && selectedImageSrc" class="h-full flex flex-col">
      <div class="flex-1 flex items-center justify-center p-4 bg-gray-100 dark:bg-gray-800">
        <img
          :src="selectedImageSrc"
          class="max-h-full max-w-full object-contain rounded-lg shadow-lg"
          :alt="selectedImage?.file_name || 'Book illustration'"
        />
      </div>
      <div class="p-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
        <h2 class="text-lg font-medium text-gray-900 dark:text-white">
          {{ selectedImage?.file_name || 'Untitled' }}
        </h2>
        <p v-if="selectedImage?.asset_type" class="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Type: {{ selectedImage.asset_type }}
        </p>
      </div>
    </div>

    <div v-else-if="currentTab === 'images' && !selectedImageId" class="flex items-center justify-center h-full">
      <div class="text-center">
        <PhotoIcon class="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 class="text-xl font-medium text-gray-900 dark:text-white mb-2">
          Please select an image
        </h3>
        <p class="text-gray-600 dark:text-gray-400 max-w-md">
          Choose an image from the sidebar to view it at full size.
        </p>
      </div>
    </div>

    <div v-else-if="isOnBookOnly" class="flex items-center justify-center h-full">
      <div class="text-center">
        <DocumentTextIcon class="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 class="text-xl font-medium text-gray-900 dark:text-white mb-2">
          Please select a chapter
        </h3>
        <p class="text-gray-600 dark:text-gray-400 max-w-md">
          Choose a chapter from the sidebar to view and edit its content, or create a new
          chapter to get started.
        </p>
      </div>
    </div>

    <router-view
      v-else
      :key="routerViewKey"
      @wiki-page-pin-changed="wikiPagePinChanged"
    />
  </div>
</template>
