<script setup lang="ts">
import IllustrationGrid from '@/components/images/IllustrationGrid.vue';
import type { ImageAsset, ImageWikiTag } from '@/lib/database';

defineProps<{
  images: ImageAsset[];
  imageSources: Record<string, string>;
  imageTags?: Record<string, ImageWikiTag[]>;
  coverImageId: string | null;
  loading: boolean;
  error: string | null;
  settingCoverId: string | null;
}>();

const emit = defineEmits<{
  'open-image': [imageId: string];
  'set-cover': [imageId: string];
  'download': [imageId: string];
}>();
</script>

<template>
  <section
    class="mt-4 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900"
  >
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
          Illustrations
        </h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Images tagged with this wiki page.
        </p>
      </div>
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
      :can-delete="false"
      empty-text="No tagged illustrations yet."
      @open-image="emit('open-image', $event)"
      @set-cover="emit('set-cover', $event)"
      @download="emit('download', $event)"
    />
  </section>
</template>
