<script setup lang="ts">
withDefaults(defineProps<{
  src: string;
  alt: string;
  testIdPrefix?: string;
}>(), {
  testIdPrefix: 'cover',
});

const emit = defineEmits<{
  activate: [];
}>();
</script>

<template>
  <div
    class="relative h-48 w-full cursor-pointer overflow-hidden bg-navy-900 sm:h-64 md:h-80 lg:h-96"
    @click="emit('activate')"
  >
    <!-- Carry the cover's colors into any space beside the contained image. -->
    <img
      :src="src"
      class="absolute inset-0 h-full w-full scale-110 object-cover opacity-55 blur-2xl"
      alt=""
      aria-hidden="true"
      :data-testid="`${testIdPrefix}-hero-backdrop`"
    />
    <div class="absolute inset-0 bg-black/25"></div>

    <img
      :src="src"
      class="relative z-10 h-full w-full object-contain transition-opacity hover:opacity-95"
      :alt="alt"
      :data-testid="`${testIdPrefix}-hero-image`"
    />

    <div class="absolute inset-0 z-20">
      <slot></slot>
    </div>
  </div>
</template>
