<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  TransitionChild,
  TransitionRoot,
} from '@headlessui/vue'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  InformationCircleIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline'
import type { ImageAsset } from '@/lib/database'

const props = withDefaults(defineProps<{
  show: boolean
  image: ImageAsset | null
  imageSrc: string | null
  currentIndex?: number
  totalImages?: number
  hasPrevious?: boolean
  hasNext?: boolean
}>(), {
  currentIndex: 0,
  totalImages: 0,
  hasPrevious: false,
  hasNext: false,
})

const emit = defineEmits<{
  close: []
  previous: []
  next: []
}>()

const mobileDetailsOpen = ref(false)

const imageLabel = computed(() => props.image?.file_name || 'Illustration')
const showAlbumControls = computed(() => props.totalImages > 1)

watch(
  () => props.show,
  (show) => {
    if (!show) mobileDetailsOpen.value = false
  },
)

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

function handleKeydown(event: KeyboardEvent) {
  if (isTypingTarget(event.target)) return
  if (event.key === 'ArrowLeft' && props.hasPrevious) {
    event.preventDefault()
    emit('previous')
  } else if (event.key === 'ArrowRight' && props.hasNext) {
    event.preventDefault()
    emit('next')
  }
}
</script>

<template>
  <TransitionRoot appear :show="show" as="template">
    <Dialog class="relative z-[60]" @close="emit('close')">
      <TransitionChild
        as="template"
        enter="ease-out duration-200"
        enter-from="opacity-0"
        enter-to="opacity-100"
        leave="ease-in duration-150"
        leave-from="opacity-100"
        leave-to="opacity-0"
      >
        <div class="fixed inset-0 bg-black/90 backdrop-blur-sm" aria-hidden="true"></div>
      </TransitionChild>

      <div class="fixed inset-0 overflow-hidden p-2 sm:p-4">
        <TransitionChild
          as="template"
          enter="ease-out duration-200"
          enter-from="opacity-0 scale-95"
          enter-to="opacity-100 scale-100"
          leave="ease-in duration-150"
          leave-from="opacity-100 scale-100"
          leave-to="opacity-0 scale-95"
        >
          <DialogPanel
            class="relative mx-auto flex h-full w-full max-w-[min(100rem,100vw)] overflow-hidden rounded-xl bg-black shadow-2xl ring-1 ring-white/10"
            data-testid="image-lightbox"
            @keydown="handleKeydown"
          >
            <section class="relative flex min-w-0 flex-1 flex-col" aria-label="Image preview">
              <header class="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-4 bg-gradient-to-b from-black/80 to-transparent p-3 pb-10 sm:p-4 sm:pb-12">
                <div class="min-w-0 text-white">
                  <DialogTitle class="truncate text-sm font-medium sm:text-base">
                    {{ imageLabel }}
                  </DialogTitle>
                  <p v-if="showAlbumControls" class="mt-0.5 text-xs text-white/70" data-testid="image-counter">
                    {{ currentIndex }} of {{ totalImages }}
                  </p>
                </div>

                <div class="flex shrink-0 items-center gap-2">
                  <button
                    v-if="$slots.details"
                    type="button"
                    class="inline-flex h-10 items-center gap-2 rounded-full bg-black/55 px-3 text-sm font-medium text-white backdrop-blur transition hover:bg-black/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 lg:hidden"
                    :aria-expanded="mobileDetailsOpen"
                    aria-controls="lightbox-mobile-details"
                    @click="mobileDetailsOpen = !mobileDetailsOpen"
                  >
                    <InformationCircleIcon class="h-5 w-5" />
                    Details
                  </button>
                  <button
                    type="button"
                    class="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-black/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                    aria-label="Close image viewer"
                    @click="emit('close')"
                  >
                    <XMarkIcon class="h-6 w-6" />
                  </button>
                </div>
              </header>

              <div class="flex min-h-0 flex-1 items-center justify-center p-2 sm:p-6 lg:p-8">
                <img
                  v-if="imageSrc"
                  :src="imageSrc"
                  :alt="imageLabel"
                  class="max-h-full max-w-full select-none object-contain"
                  data-testid="lightbox-image"
                />
                <p v-else class="text-sm text-white/65">Image data is not available.</p>
              </div>

              <template v-if="showAlbumControls">
                <button
                  type="button"
                  class="absolute left-2 top-1/2 z-20 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-black/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 disabled:cursor-default disabled:opacity-25 sm:left-4 sm:h-14 sm:w-14"
                  :disabled="!hasPrevious"
                  aria-label="Previous image"
                  @click="emit('previous')"
                >
                  <ChevronLeftIcon class="h-7 w-7 sm:h-8 sm:w-8" />
                </button>
                <button
                  type="button"
                  class="absolute right-2 top-1/2 z-20 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-black/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 disabled:cursor-default disabled:opacity-25 sm:right-4 sm:h-14 sm:w-14"
                  :disabled="!hasNext"
                  aria-label="Next image"
                  @click="emit('next')"
                >
                  <ChevronRightIcon class="h-7 w-7 sm:h-8 sm:w-8" />
                </button>
              </template>

              <Transition
                v-if="$slots.details"
                enter="ease-out duration-200"
                enter-from="translate-y-full"
                enter-to="translate-y-0"
                leave="ease-in duration-150"
                leave-from="translate-y-0"
                leave-to="translate-y-full"
              >
                <aside
                  v-if="mobileDetailsOpen"
                  id="lightbox-mobile-details"
                  class="absolute inset-x-0 bottom-0 z-30 max-h-[75vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl dark:bg-navy-900 lg:hidden"
                >
                  <div class="sticky top-0 z-10 flex justify-end bg-white/95 p-2 backdrop-blur dark:bg-navy-900/95">
                    <button
                      type="button"
                      class="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-navy-800"
                      aria-label="Close image details"
                      @click="mobileDetailsOpen = false"
                    >
                      <XMarkIcon class="h-5 w-5" />
                    </button>
                  </div>
                  <slot name="details"></slot>
                </aside>
              </Transition>
            </section>

            <aside
              v-if="$slots.details"
              class="hidden h-full w-80 shrink-0 overflow-y-auto border-l border-white/10 bg-white dark:bg-navy-900 lg:block xl:w-96"
              aria-label="Image details"
            >
              <slot name="details"></slot>
            </aside>
          </DialogPanel>
        </TransitionChild>
      </div>
    </Dialog>
  </TransitionRoot>
</template>
