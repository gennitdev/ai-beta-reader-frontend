<script setup lang="ts">
import { PhotoIcon } from '@heroicons/vue/24/outline'
import type { ImageAsset } from '@/lib/database'

defineProps<{
  bookId: string
  canSelectImages: boolean
  bookImages: ImageAsset[]
  bookImageSources: Record<string, string>
  loadingImages: boolean
  selectedImageId?: string | null
}>()
</script>

<template>
  <div>
    <div v-if="loadingImages" class="flex justify-center items-center h-32">
      <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
    </div>

    <div v-else-if="!canSelectImages && bookImages.length === 0" class="text-center py-8">
      <PhotoIcon class="w-8 h-8 text-gray-400 mx-auto mb-3" />
      <h3 class="text-sm font-medium text-gray-900 dark:text-white mb-2">
        No images yet
      </h3>
      <p class="text-xs text-gray-600 dark:text-gray-400">
        Images added to chapters and covers will appear here.
      </p>
    </div>

    <div v-else-if="bookImages.length > 0" class="grid grid-cols-2 gap-2">
      <router-link
        v-for="image in bookImages"
        :key="image.id"
        :to="`/books/${bookId}?tab=images&imageId=${image.id}`"
        :class="[
          'relative aspect-square overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-700 cursor-pointer transition-all',
          selectedImageId === image.id
            ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-100 dark:ring-offset-gray-800'
            : 'hover:ring-2 hover:ring-blue-400'
        ]"
      >
        <img
          v-if="bookImageSources[image.id]"
          :src="bookImageSources[image.id]"
          class="h-full w-full object-cover"
          :alt="image.file_name || 'Book illustration'"
        />
        <div v-else class="h-full w-full flex items-center justify-center">
          <PhotoIcon class="w-8 h-8 text-gray-400" />
        </div>
        <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
          <p class="text-xs text-white truncate">
            {{ image.file_name || 'Untitled' }}
          </p>
        </div>
      </router-link>
    </div>

    <div v-else class="text-center py-8">
      <PhotoIcon class="w-8 h-8 text-gray-400 mx-auto mb-3" />
      <h3 class="text-sm font-medium text-gray-900 dark:text-white mb-2">
        No images yet
      </h3>
      <p class="text-xs text-gray-600 dark:text-gray-400">
        Add illustrations to your chapters to see them here.
      </p>
    </div>
  </div>
</template>
