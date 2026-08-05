/**
 * Lightweight, level-gated logger.
 *
 * Drop-in replacement for `console.*` calls: swap `console.warn(...)` for
 * `logger.warn(...)`. The point over raw `console` is that log output is
 * gated by a level, so noisy `debug`/`info`/`log` output is silenced in
 * production builds while `warn`/`error` still surface.
 *
 * Default level:
 *   - development (`import.meta.env.DEV`): `debug` (everything)
 *   - production: `warn` (only warnings and errors)
 *
 * Override at runtime (e.g. in tests or from a debug setting) with
 * `logger.setLevel('debug')`.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
}

/**
 * Read Vite's `DEV` flag defensively — `import.meta.env` is undefined in some
 * non-bundled execution contexts (this mirrors the guards already used in
 * cloudSync.ts), so fall back to development verbosity when it is unavailable.
 */
function isDev(): boolean {
  try {
    return typeof import.meta !== 'undefined' ? Boolean(import.meta.env?.DEV) : true
  } catch {
    return true
  }
}

function defaultLevel(): LogLevel {
  return isDev() ? 'debug' : 'warn'
}

let currentLevel: LogLevel = defaultLevel()

function enabled(level: Exclude<LogLevel, 'silent'>): boolean {
  return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[currentLevel]
}

export const logger = {
  /** Set the active log level. Anything below this weight is dropped. */
  setLevel(level: LogLevel): void {
    currentLevel = level
  },

  /** Current active log level. */
  getLevel(): LogLevel {
    return currentLevel
  },

  /** Reset to the environment-derived default (`debug` in dev, `warn` in prod). */
  resetLevel(): void {
    currentLevel = defaultLevel()
  },

  debug(...args: unknown[]): void {
    if (enabled('debug')) console.debug(...args)
  },

  info(...args: unknown[]): void {
    if (enabled('info')) console.info(...args)
  },

  /** Alias of `info` — eases migration from `console.log`. */
  log(...args: unknown[]): void {
    if (enabled('info')) console.log(...args)
  },

  warn(...args: unknown[]): void {
    if (enabled('warn')) console.warn(...args)
  },

  error(...args: unknown[]): void {
    if (enabled('error')) console.error(...args)
  },
}

export default logger
