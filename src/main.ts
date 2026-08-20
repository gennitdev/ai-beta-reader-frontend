import './style.css'
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import '@fontsource/opendyslexic/400.css'
import '@fontsource/opendyslexic/700.css'

import { createApp, watch } from 'vue'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'

import App from './App.vue'
import router from './router'
import { initializeTheme, useTheme, type Theme } from '@/composables/useTheme'

const initialTheme = initializeTheme()

function syncNativeTheme(theme: Theme) {
  if (!Capacitor.isNativePlatform()) return

  const isDark = theme === 'dark'
  void StatusBar.setBackgroundColor({ color: isDark ? '#00132f' : '#f9fafb' }).catch(() => {
    // Ignore errors if background color configuration is unsupported.
  })
  void StatusBar.setStyle({ style: isDark ? Style.Light : Style.Dark }).catch(() => {
    // Ignore style errors on unsupported platforms.
  })
}

if (Capacitor.isNativePlatform()) {
  void StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {
    // Ignore errors if status bar overlay configuration is unsupported
  })
  syncNativeTheme(initialTheme)
}

const { theme } = useTheme()
watch(theme, syncNativeTheme)

const app = createApp(App)

app.use(router)

app.mount('#app')
