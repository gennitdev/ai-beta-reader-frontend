import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,vue}'],
      // Ratchet policy: keep these just below the current measured coverage so
      // they act as a regression floor. When a change raises coverage, nudge the
      // matching threshold up to lock in the gain — never lower them to make a
      // change pass. Current actuals: stmts 49.6 / branch 34.3 / funcs 44.4 / lines 50.6.
      thresholds: {
        statements: 53,
        branches: 35,
        functions: 48,
        lines: 54,
      },
    },
  },
  css: {
    postcss: './postcss.config.js',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      fs: fileURLToPath(new URL('./src/shims/fs.ts', import.meta.url)),
      path: fileURLToPath(new URL('./src/shims/path.ts', import.meta.url)),
      crypto: fileURLToPath(new URL('./src/shims/crypto.ts', import.meta.url)),
    },
  },
  publicDir: 'public',
  base: '/',
})
