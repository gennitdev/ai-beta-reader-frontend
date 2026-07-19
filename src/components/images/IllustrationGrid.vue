<script setup lang="ts">
import { ArrowDownTrayIcon, PhotoIcon, TrashIcon } from '@heroicons/vue/24/outline'
import type { ImageAsset, ImageWikiTag } from '@/lib/database'

defineProps<{
  images: ImageAsset[]
  imageSources: Record<string, string>
  coverImageId?: string | null
  loading?: boolean
  settingCoverId?: string | null
  tagsByImageId?: Record<string, ImageWikiTag[]>
  canSetCover?: boolean
  canDownload?: boolean
  canDelete?: boolean
  emptyText?: string
  // 'grid' (default) is a responsive multi-column grid; 'panel' is a single
  // column for use inside a narrow side panel.
  layout?: 'grid' | 'panel'
}>()

const emit = defineEmits<{
  'open-image': [imageId: string]
  'set-cover': [imageId: string]
  'download': [imageId: string]
  'delete': [imageId: string]
}>()
</script>

<template>
  <div>
    <div
      v-if="loading"
      class="py-10 text-center text-sm text-gray-500 dark:text-gray-400"
    >
      Loading illustrations...
    </div>

    <div
      v-else-if="images.length"
      class="grid gap-3"
      :class="layout === 'panel' ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'"
    >
      <div
        v-for="image in images"
        :key="image.id"
        class="group relative overflow-hidden rounded-lg border bg-gray-50 dark:bg-navy-800"
        :class="coverImageId === image.id ? 'border-gold-500 ring-2 ring-gold-500/30' : 'border-gray-200 dark:border-gray-700'"
      >
        <div
          v-if="coverImageId === image.id"
          class="absolute left-2 top-2 z-10 rounded-full bg-gold-600 px-2 py-0.5 text-xs font-medium text-white"
        >
          Cover
        </div>

        <div class="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition group-hover:opacity-100">
          <button
            v-if="canSetCover && coverImageId !== image.id"
            type="button"
            class="rounded-full bg-gold-600/90 px-2 py-1 text-xs font-medium text-white transition hover:bg-gold-700 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="settingCoverId === image.id"
            @click.stop="emit('set-cover', image.id)"
          >
            {{ settingCoverId === image.id ? '...' : 'Set as cover' }}
          </button>
          <button
            v-if="canDownload"
            type="button"
            class="rounded-full bg-black/60 p-1.5 text-white transition hover:bg-black/80"
            title="Download"
            @click.stop="emit('download', image.id)"
          >
            <ArrowDownTrayIcon class="h-3.5 w-3.5" />
          </button>
          <button
            v-if="canDelete"
            type="button"
            class="rounded-full bg-red-600/90 p-1.5 text-white transition hover:bg-red-700"
            title="Delete"
            @click.stop="emit('delete', image.id)"
          >
            <TrashIcon class="h-3.5 w-3.5" />
          </button>
        </div>

        <button type="button" class="block w-full text-left" @click="emit('open-image', image.id)">
          <div class="aspect-[4/3] w-full overflow-hidden bg-gray-200 dark:bg-gray-700">
            <img
              v-if="imageSources[image.id]"
              :src="imageSources[image.id]"
              class="h-full w-full object-cover transition duration-200 group-hover:scale-105"
              :alt="image.file_name || 'Illustration'"
            />
            <div
              v-else
              class="flex h-full w-full items-center justify-center text-xs text-gray-500 dark:text-gray-300"
            >
              Loading...
            </div>
          </div>
          <div class="space-y-1 px-3 py-2">
            <p class="truncate text-xs text-gray-600 dark:text-gray-300">
              {{ image.file_name }}
            </p>
            <div
              v-if="tagsByImageId?.[image.id]?.length"
              class="flex flex-wrap gap-1"
            >
              <span
                v-for="tag in tagsByImageId[image.id]"
                :key="tag.wiki_page_id"
                class="max-w-full truncate rounded-full bg-gold-50 px-1.5 py-0.5 text-[11px] text-gold-700 dark:bg-gold-900/30 dark:text-gold-200"
              >
                {{ tag.page_name }}
              </span>
            </div>
          </div>
        </button>
      </div>
    </div>

    <div
      v-else
      class="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500 dark:border-gray-600 dark:bg-navy-800/60 dark:text-gray-300"
    >
      <PhotoIcon class="mx-auto mb-2 h-8 w-8 text-gray-300 dark:text-gray-600" />
      {{ emptyText || 'No illustrations yet.' }}
    </div>
  </div>
</template>
