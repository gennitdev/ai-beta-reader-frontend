<script setup lang="ts">
import LegalPageLayout from '@/components/LegalPageLayout.vue'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import termsOfUse from '@/content/terms-of-use.md?raw'
</script>

<template>
  <LegalPageLayout>
    <MarkdownRenderer :text="termsOfUse" />
  </LegalPageLayout>
</template>
