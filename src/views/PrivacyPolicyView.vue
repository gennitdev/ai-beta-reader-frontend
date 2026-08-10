<script setup lang="ts">
import LegalPageLayout from '@/components/LegalPageLayout.vue'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import privacyPolicy from '@/content/privacy-policy.md?raw'
</script>

<template>
  <LegalPageLayout>
    <MarkdownRenderer :text="privacyPolicy" />
  </LegalPageLayout>
</template>
