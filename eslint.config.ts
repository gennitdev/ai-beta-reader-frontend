import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'

// To allow more languages other than `ts` in `.vue` files, uncomment the following lines:
// import { configureVueProject } from '@vue/eslint-config-typescript'
// configureVueProject({ scriptLangs: ['ts', 'tsx'] })
// More info at https://github.com/vuejs/eslint-config-typescript/#advanced-setup

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}'],
  },

  globalIgnores([
    '**/dist/**',
    '**/dist-ssr/**',
    '**/coverage/**',
    'android/app/build/**',
    'android/app/src/main/assets/**',
    'electron/build/**',
    // Generated/scaffold Electron support code is CommonJS and maintained by
    // the Capacitor Electron tooling. Maintained files under electron/src are
    // linted below.
    'electron/live-runner.js',
    'electron/resources/**',
    'electron/src/rt/**',
    // Local-only artifacts: Playwright reports and Claude Code git worktrees
    // (full repo copies) must not be linted — the latter also crashes the
    // directory walk and never exists in CI.
    '**/playwright-report/**',
    '**/test-results/**',
    '.claude/**',
  ]),

  pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,

  {
    name: 'app/rules',
    rules: {
      // Nudge stray debug output toward the `logger` abstraction (src/lib/logger.ts).
      // `warn`/`error` are still allowed directly since they surface real problems.
      // Kept as a warning (not error) so CI stays green while console.log usage is
      // migrated over incrementally.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  {
    name: 'app/electron-rules',
    files: ['electron/src/**/*.ts', 'electron/tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Existing Capacitor integration seams still carry a small amount of
      // untyped framework state. Keep it visible without exempting Electron.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  {
    // The logger is the one place raw console access is intentional.
    name: 'app/logger-console-allowed',
    files: ['src/lib/logger.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  {
    // Command-line tools intentionally report diagnostics to stdout/stderr.
    name: 'app/cli-console-allowed',
    files: ['scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
)
