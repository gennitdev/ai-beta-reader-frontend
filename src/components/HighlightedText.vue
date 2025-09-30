<template>
  <span v-for="(part, i) in parts" :key="i" :class="classes">
    <mark v-if="match(part, searchInput)" class="bg-yellow-200 dark:bg-yellow-800 text-gray-900 dark:text-gray-100 px-1 rounded">
      {{ part }}
    </mark>
    <span v-else>{{ part }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  classes?: string | string[]
  text: string
  searchInput: string
}

const props = withDefaults(defineProps<Props>(), {
  classes: '',
  text: '',
  searchInput: ''
})

const parts = computed(() => {
  let p = [props.text]
  if (props.searchInput) {
    p = props.text.split(new RegExp(`(${escapeRegExp(props.searchInput)})`, 'gi'))
  }
  return p
})

function match(part: string, searchInput: string): boolean {
  if (!part) {
    return false
  }
  return part.toLowerCase() === searchInput.toLowerCase()
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
</script>