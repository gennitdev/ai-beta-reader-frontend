<template>
  <div v-if="show" @click="$emit('close')" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div @click.stop class="bg-white dark:bg-gray-800 rounded-lg w-full max-h-[90vh] overflow-hidden" :class="maxWidthClass">
      <div class="p-6 border-b border-gray-200 dark:border-gray-700">
        <div class="flex justify-between items-center">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">{{ title }}</h2>
          <button
            @click="$emit('close')"
            class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-md"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
      </div>

      <div class="max-h-[calc(90vh-8rem)] overflow-y-auto">
        <slot />
      </div>

      <div v-if="$slots.footer" class="p-6 border-t border-gray-200 dark:border-gray-700">
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  show: boolean
  title: string
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl'
}

const props = withDefaults(defineProps<Props>(), {
  maxWidth: '4xl'
})

defineEmits<{
  close: []
}>()

const maxWidthClass = computed(() => {
  const classes = {
    'sm': 'max-w-sm',
    'md': 'max-w-md',
    'lg': 'max-w-lg',
    'xl': 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl'
  }
  return classes[props.maxWidth]
})
</script>