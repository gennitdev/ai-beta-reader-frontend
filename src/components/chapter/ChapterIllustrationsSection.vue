<script setup lang="ts">
import type { ImageAsset } from '@/lib/database';

defineProps<{
  images: ImageAsset[];
  imageSources: Record<string, string>;
  coverImageId: string | null;
  loading: boolean;
  adding: boolean;
  error: string | null;
  settingCoverId: string | null;
}>();

const emit = defineEmits<{
  'add-images': [];
  'open-image': [imageId: string];
  'set-cover': [imageId: string];
  'download': [imageId: string];
  'delete': [imageId: string];
}>();
</script>

<template>
  <section
    class="mt-4 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900"
  >
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
          Chapter Illustrations
        </h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Images live locally inside the desktop app.
        </p>
      </div>
      <button
        type="button"
        class="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="adding"
        @click="emit('add-images')"
      >
        <span
          v-if="adding"
          class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
        ></span>
        {{ adding ? "Adding..." : "Add images" }}
      </button>
    </div>

    <p v-if="error" class="mt-4 text-sm text-red-600 dark:text-red-400">
      {{ error }}
    </p>

    <div
      v-if="loading"
      class="py-10 text-center text-sm text-gray-500 dark:text-gray-400"
    >
      Loading illustrations...
    </div>

    <div v-else>
      <div
        v-if="images.length"
        class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      >
        <div
          v-for="image in images"
          :key="image.id"
          class="group relative overflow-hidden rounded-lg border bg-gray-50 dark:bg-gray-800"
          :class="coverImageId === image.id ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-gray-200 dark:border-gray-700'"
        >
          <!-- Cover badge -->
          <div
            v-if="coverImageId === image.id"
            class="absolute left-2 top-2 z-10 rounded-full bg-blue-600 px-2 py-0.5 text-xs font-medium text-white"
          >
            Cover
          </div>
          <!-- Action buttons overlay -->
          <div class="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition group-hover:opacity-100">
            <button
              v-if="coverImageId !== image.id"
              type="button"
              class="rounded-full bg-blue-600/90 px-2 py-1 text-xs font-medium text-white transition hover:bg-blue-700"
              :disabled="settingCoverId === image.id"
              @click.stop="emit('set-cover', image.id)"
            >
              {{ settingCoverId === image.id ? '...' : 'Set as cover' }}
            </button>
            <button
              type="button"
              class="rounded-full bg-black/60 p-1.5 text-white transition hover:bg-black/80"
              title="Download"
              @click.stop="emit('download', image.id)"
            >
              <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
            <button
              type="button"
              class="rounded-full bg-red-600/90 p-1.5 text-white transition hover:bg-red-700"
              title="Delete"
              @click.stop="emit('delete', image.id)"
            >
              <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
          <button
            type="button"
            class="block w-full"
            @click="emit('open-image', image.id)"
          >
            <div class="aspect-[4/3] w-full overflow-hidden bg-gray-200 dark:bg-gray-700">
              <img
                v-if="imageSources[image.id]"
                :src="imageSources[image.id]"
                class="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                :alt="image.file_name || 'Chapter illustration'"
              />
              <div
                v-else
                class="flex h-full w-full items-center justify-center text-xs text-gray-500 dark:text-gray-300"
              >
                Loading...
              </div>
            </div>
          </button>
          <p class="truncate px-3 py-2 text-xs text-gray-600 dark:text-gray-300">
            {{ image.file_name }}
          </p>
        </div>
      </div>
      <div
        v-else
        class="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-800/60 dark:text-gray-300"
      >
        No illustrations yet.
      </div>
    </div>
  </section>
</template>
