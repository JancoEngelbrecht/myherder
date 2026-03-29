import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router/index.js'
import i18n from './i18n/index.js'
import './style.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(i18n)

app.mount('#app')

// Auto-reload when new service worker takes control (seamless deploy updates)
if ('serviceWorker' in navigator) {
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })

  // Poll for SW updates every 60s (only when tab is visible)
  navigator.serviceWorker.ready.then((registration) => {
    const CHECK_INTERVAL = 60 * 1000
    let intervalId = null

    function startPolling() {
      if (intervalId) return
      intervalId = setInterval(() => {
        registration.update().catch(() => {})
      }, CHECK_INTERVAL)
    }

    function stopPolling() {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
    }

    // Start polling if tab is visible
    if (!document.hidden) startPolling()

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopPolling()
      } else {
        // Check immediately when tab becomes visible, then resume interval
        registration.update().catch(() => {})
        startPolling()
      }
    })
  })
}
