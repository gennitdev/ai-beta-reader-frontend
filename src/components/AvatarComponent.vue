<script setup lang="ts">
import { computed } from 'vue'
import Identicon from 'identicon.js'
import sha256 from 'crypto-js/sha256'

const props = defineProps<{
  text: string
  size?: 'small' | 'medium' | 'large'
  shape?: 'circle' | 'square'
}>()

// Generate Identicon based on text
const identiconData = computed(() => {
  // Hash the text
  const hash = sha256(props.text).toString()

  // Generate the identicon and get the data for the img src
  const data = new Identicon(hash, {
    background: [255, 255, 255, 0], // Transparent background
    margin: 0.2,
    size: 420,
    format: 'svg',
  }).toString()

  // Return the data as a base64 SVG for the src of the img
  return 'data:image/svg+xml;base64,' + data
})

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'small':
      return 'h-8 w-8'
    case 'large':
      return 'h-16 w-16'
    case 'medium':
    default:
      return 'h-10 w-10'
  }
})

const shapeClasses = computed(() => {
  return props.shape === 'square' ? 'rounded-lg' : 'rounded-full'
})
</script>

<template>
  <img
    :src="identiconData"
    :alt="text"
    :class="[
      sizeClasses,
      shapeClasses,
      'ring-2 ring-gray-200 dark:ring-gray-700'
    ]"
  />
</template>