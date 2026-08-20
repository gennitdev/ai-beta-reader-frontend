(() => {
  const storageKey = 'beta-bot-theme'
  let storedTheme = null

  try {
    storedTheme = localStorage.getItem(storageKey)
  } catch {
    // Storage can be unavailable in hardened browser contexts.
  }

  const systemTheme = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
  const theme = storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : systemTheme
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
})()
