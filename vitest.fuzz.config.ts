import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/fuzz/**/*.fuzz.spec.ts'],
    testTimeout: 30_000,
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
