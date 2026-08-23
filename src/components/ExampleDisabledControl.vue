<script setup lang="ts">
import { ref } from 'vue'

withDefaults(defineProps<{ explanation: string; active?: boolean }>(), { active: true })
const showing = ref(false)
</script>

<template>
  <span
    class="relative inline-flex"
    :tabindex="active ? 0 : undefined"
    :aria-label="active ? explanation : undefined"
    @mouseenter="showing = active"
    @mouseleave="showing = false"
    @focus="showing = active"
    @blur="showing = false"
  >
    <slot />
    <span
      v-if="showing"
      role="tooltip"
      class="absolute right-0 top-full z-30 mt-2 w-64 rounded-lg bg-navy-950 px-3 py-2 text-left text-xs font-normal leading-5 text-white shadow-xl"
    >
      {{ explanation }}
    </span>
  </span>
</template>
