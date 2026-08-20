import { readonly, ref } from 'vue'

export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'beta-bot-theme'

const theme = ref<Theme>('light')
let initialized = false

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark'
}

function getSystemTheme(): Theme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light'
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getStoredTheme(): Theme | null {
  if (typeof localStorage === 'undefined') return null

  try {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY)
    return isTheme(storedTheme) ? storedTheme : null
  } catch {
    return null
  }
}

function applyTheme(nextTheme: Theme) {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  root.classList.toggle('dark', nextTheme === 'dark')
  root.dataset.theme = nextTheme
  root.style.colorScheme = nextTheme
}

export function initializeTheme(): Theme {
  const initialTheme = getStoredTheme() ?? getSystemTheme()
  theme.value = initialTheme
  applyTheme(initialTheme)
  initialized = true
  return initialTheme
}

export function setTheme(nextTheme: Theme) {
  theme.value = nextTheme
  applyTheme(nextTheme)

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
    } catch {
      // The visual preference still applies for this session when storage is unavailable.
    }
  }
}

export function useTheme() {
  if (!initialized) initializeTheme()

  const toggleTheme = () => {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  return {
    theme: readonly(theme),
    setTheme,
    toggleTheme,
  }
}
