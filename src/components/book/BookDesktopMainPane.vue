<script setup lang="ts">
import { DocumentTextIcon, PhotoIcon } from '@heroicons/vue/24/outline'
import IllustrationDetail from '@/components/images/IllustrationDetail.vue'
import type { ImageAsset, ImageWikiTag } from '@/lib/database'
import type { BookWikiPage } from '@/types/bookView'

defineProps<{
  currentTab: 'chapters' | 'wiki' | 'images'
  selectedImageId?: string | null
  selectedImageSrc?: string | null
  selectedImage?: ImageAsset | null
  selectedImageTags?: ImageWikiTag[]
  wikiPages?: BookWikiPage[]
  savingSelectedImageNotes?: boolean
  savingSelectedImageTags?: boolean
  saveSelectedImageNotes?: (notes: string) => void | Promise<void>
  saveSelectedImageTags?: (wikiPageIds: string[]) => void | Promise<void>
  downloadSelectedImage?: (imageId: string) => void
  isOnBookOnly: boolean
  routerViewKey: number
  wikiPagePinChanged: (payload: { id: string; isPinned: boolean; updatedAt: string }) => void
}>()
</script>

<template>
  <div class="flex-1 bg-gray-50 dark:bg-gray-900 overflow-y-auto">
    <div v-if="currentTab === 'images' && selectedImageId && selectedImageSrc" class="h-full flex flex-col">
      <IllustrationDetail
        :image="selectedImage || null"
        :image-src="selectedImageSrc"
        :tags="selectedImageTags || []"
        :wiki-pages="wikiPages || []"
        :saving-notes="savingSelectedImageNotes"
        :saving-tags="savingSelectedImageTags"
        :can-edit-notes="Boolean(saveSelectedImageNotes)"
        :can-edit-tags="Boolean(saveSelectedImageTags)"
        :can-download="Boolean(downloadSelectedImage)"
        @save-notes="saveSelectedImageNotes?.($event)"
        @save-tags="saveSelectedImageTags?.($event)"
        @download="downloadSelectedImage?.($event)"
      />
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
