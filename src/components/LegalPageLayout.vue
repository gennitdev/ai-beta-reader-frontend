<template>
  <div class="min-h-full bg-[#fbf8f1] px-4 py-10 text-gray-800 dark:bg-navy-950 dark:text-gray-200 sm:px-6">
    <article class="mx-auto max-w-3xl rounded-2xl border border-[#e7d29a] bg-white p-6 shadow-sm dark:border-navy-700 dark:bg-navy-900 sm:p-10">
      <header class="mb-8 border-b border-gray-200 pb-4 dark:border-navy-700">
        <RouterLink to="/" class="text-sm font-semibold text-gold-700 hover:text-gold-600 dark:text-gold-300">
          beta bot
        </RouterLink>
      </header>

      <div class="legal-copy">
        <slot />
      </div>

      <footer class="mt-10 flex flex-wrap gap-x-5 gap-y-2 border-t border-gray-200 pt-6 text-sm dark:border-navy-700">
        <RouterLink to="/" class="text-gold-700 hover:underline dark:text-gold-300">Home</RouterLink>
        <RouterLink to="/privacy" class="text-gold-700 hover:underline dark:text-gold-300">Privacy Policy</RouterLink>
        <RouterLink to="/terms" class="text-gold-700 hover:underline dark:text-gold-300">Terms of Use</RouterLink>
        <a href="mailto:gennitdev@gmail.com" class="text-gold-700 hover:underline dark:text-gold-300">gennitdev@gmail.com</a>
      </footer>
    </article>
  </div>
</template>

<style scoped>
.legal-copy :deep(h2) {
  margin-bottom: 0.75rem;
  color: #00132f;
  font-size: 1.25rem;
  font-weight: 700;
}

.legal-copy :deep(p),
.legal-copy :deep(li) {
  line-height: 1.75;
}

.legal-copy :deep(p + p) {
  margin-top: 0.75rem;
}

.legal-copy :deep(ul) {
  margin-top: 0.75rem;
  list-style: disc;
  padding-left: 1.5rem;
}

.legal-copy :deep(a) {
  color: #815a18;
  text-decoration: underline;
}

.legal-copy :deep(code) {
  border-radius: 0.25rem;
  background: #f4eccf;
  padding: 0.1rem 0.3rem;
  color: #00132f;
}

:global(.dark .legal-copy h2) {
  color: #ffffff;
}

:global(.dark .legal-copy a) {
  color: #deba63;
}

:global(.dark .legal-copy code) {
  background: #122a47;
  color: #fae8cd;
}
</style>
