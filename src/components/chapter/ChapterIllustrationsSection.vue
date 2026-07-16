<script setup lang="ts">
import IllustrationGrid from '@/components/images/IllustrationGrid.vue';
import type { ImageAsset, ImageWikiTag } from '@/lib/database';

defineProps<{
  images: ImageAsset[];
  imageSources: Record<string, string>;
  imageTags?: Record<string, ImageWikiTag[]>;
  coverImageId: string | null;
  loading: boolean;
  adding: boolean;
  error: string | null;
  settingCoverId: string | null;
  canAddImages: boolean;
  layout?: 'grid' | 'panel';
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
    class="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
    :class="layout === 'panel' ? 'p-4' : 'mt-4 p-6'"
  >
    <div
      class="flex flex-col gap-4"
      :class="layout === 'panel' ? '' : 'sm:flex-row sm:items-center sm:justify-between'"
    >
      <div>
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
          Chapter Illustrations
        </h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          {{ canAddImages ? "Images are stored locally on this device." : "Restored images are available for viewing." }}
        </p>
      </div>
      <button
        v-if="canAddImages"
        type="button"
        class="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        :class="layout === 'panel' ? 'w-full' : ''"
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

    <IllustrationGrid
      class="mt-4"
      :images="images"
      :image-sources="imageSources"
      :tags-by-image-id="imageTags"
      :cover-image-id="coverImageId"
      :loading="loading"
      :setting-cover-id="settingCoverId"
      :can-set-cover="true"
      :can-download="true"
      :can-delete="true"
      :layout="layout"
      empty-text="No illustrations yet."
      @open-image="emit('open-image', $event)"
      @set-cover="emit('set-cover', $event)"
      @download="emit('download', $event)"
      @delete="emit('delete', $event)"
    />
  </section>
</template>
