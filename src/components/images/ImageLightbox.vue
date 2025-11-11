<script setup lang="ts">
const props = defineProps<{
  open: boolean
  imageSrc: string | null
  caption?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const handleBackdropClick = () => {
  emit('close')
}
</script>

<template>
  <teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 sm:p-8"
    >
      <button
        type="button"
        class="absolute inset-0 cursor-default"
        aria-hidden="true"
        @click="handleBackdropClick"
      ></button>
      <div
        class="relative z-10 max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-gray-900/90 p-4 shadow-2xl backdrop-blur"
      >
        <button
          type="button"
          class="absolute right-4 top-4 rounded-full bg-black/60 px-3 py-1 text-sm font-medium text-white transition hover:bg-black/80"
          @click="handleBackdropClick"
        >
          Close
        </button>
        <div class="flex items-center justify-center">
          <img
            v-if="imageSrc"
            :src="imageSrc"
            class="max-h-[70vh] w-auto rounded-lg object-contain"
            alt=""
          />
        </div>
        <p v-if="caption" class="mt-4 text-center text-sm text-gray-200">
          {{ caption }}
        </p>
      </div>
    </div>
  </teleport>
</template>
