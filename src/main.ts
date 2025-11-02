import './style.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'

import App from './App.vue'
import router from './router'

if (Capacitor.isNativePlatform()) {
  void StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {
    // Ignore errors if status bar overlay configuration is unsupported
  })
  void StatusBar.setBackgroundColor({ color: '#1f2937' /* Tailwind gray-800 */ }).catch(() => {
    // Fallback silently if background color cannot be applied
  })
  void StatusBar.setStyle({ style: Style.Light }).catch(() => {
    // Ignore style errors on unsupported platforms
  })
}

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(VueQueryPlugin)

app.mount('#app')
