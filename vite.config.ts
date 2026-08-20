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
    include: ['src/**/*.spec.ts', 'electron/tests/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // Measure authored application runtime code across browser and Electron.
      // Declarations and view-model-only types have no runtime behavior, while
      // compatibility shims are build-time platform substitutes.
      include: [
        'src/**/*.{ts,vue}',
        'electron/src/**/*.{ts,js}',
      ],
      exclude: [
        '**/*.d.ts',
        '**/*.spec.ts',
        'src/types/**',
        'src/shims/**',
        'src/**/__tests__/**',
        'electron/tests/**',
      ],
      // Ratchet policy: keep these just below the current measured coverage so
      // they act as a regression floor. When a change raises coverage, nudge the
      // matching threshold up to lock in the gain — never lower them to make a
      // change pass. Current actuals: stmts 64.25 / branch 46.42 / funcs 57.61 / lines 65.68.
      thresholds: {
        statements: 64,
        branches: 46,
        functions: 57,
        lines: 65,
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
