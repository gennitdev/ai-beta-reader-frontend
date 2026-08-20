// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function mockSystemTheme(prefersDark: boolean) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: prefersDark,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })))
}

async function loadThemeModule() {
  vi.resetModules()
  return import('@/composables/useTheme')
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
  delete document.documentElement.dataset.theme
  document.documentElement.style.colorScheme = ''
  mockSystemTheme(false)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useTheme', () => {
  it('uses the system preference on first visit', async () => {
    mockSystemTheme(true)
    const { initializeTheme, useTheme } = await loadThemeModule()

    expect(initializeTheme()).toBe('dark')
    expect(useTheme().theme.value).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('prefers a valid stored choice over the system preference', async () => {
    localStorage.setItem('beta-bot-theme', 'light')
    mockSystemTheme(true)
    const { initializeTheme } = await loadThemeModule()

    expect(initializeTheme()).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('ignores an invalid stored value', async () => {
    localStorage.setItem('beta-bot-theme', 'sepia')
    mockSystemTheme(true)
    const { initializeTheme } = await loadThemeModule()

    expect(initializeTheme()).toBe('dark')
  })

  it('persists and applies theme changes', async () => {
    const { initializeTheme, setTheme, THEME_STORAGE_KEY } = await loadThemeModule()
    initializeTheme()

    setTheme('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    setTheme('light')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('still applies the theme when storage is unavailable', async () => {
    const unavailableStorage = {
      getItem: vi.fn(() => { throw new Error('blocked') }),
      setItem: vi.fn(() => { throw new Error('blocked') }),
    }
    vi.stubGlobal('localStorage', unavailableStorage)
    const { initializeTheme, setTheme } = await loadThemeModule()

    expect(initializeTheme()).toBe('light')
    expect(() => setTheme('dark')).not.toThrow()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
})
