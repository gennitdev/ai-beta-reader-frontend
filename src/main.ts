import './style.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { VueQueryPlugin } from '@tanstack/vue-query'

import App from './App.vue'
import router from './router'
import { auth0 } from './auth'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(auth0)
app.use(VueQueryPlugin)

app.mount('#app')
