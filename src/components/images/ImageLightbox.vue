<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/vue/24/outline'

const props = defineProps<{
  open: boolean
  imageSrc: string | null
  caption?: string
  hasNext?: boolean
  hasPrev?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'next'): void
  (e: 'prev'): void
}>()

const handleBackdropClick = () => {
  emit('close')
}

const handleKeydown = (event: KeyboardEvent) => {
  if (!props.open) return

  switch (event.key) {
    case 'ArrowRight':
      if (props.hasNext) {
        event.preventDefault()
        emit('next')
      }
      break
    case 'ArrowLeft':
      if (props.hasPrev) {
        event.preventDefault()
        emit('prev')
      }
      break
    case 'Escape':
      event.preventDefault()
      emit('close')
      break
  }
}

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    window.addEventListener('keydown', handleKeydown)
  } else {
    window.removeEventListener('keydown', handleKeydown)
  }
})

onMounted(() => {
  if (props.open) {
    window.addEventListener('keydown', handleKeydown)
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
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

      <!-- Previous button -->
      <button
        v-if="hasPrev"
        type="button"
        class="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white transition hover:bg-black/80 sm:left-4 sm:p-3"
        title="Previous image (Left arrow)"
        @click="emit('prev')"
      >
        <ChevronLeftIcon class="h-6 w-6 sm:h-8 sm:w-8" />
      </button>

      <!-- Next button -->
      <button
        v-if="hasNext"
        type="button"
        class="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white transition hover:bg-black/80 sm:right-4 sm:p-3"
        title="Next image (Right arrow)"
        @click="emit('next')"
      >
        <ChevronRightIcon class="h-6 w-6 sm:h-8 sm:w-8" />
      </button>

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
