import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useAuthStore } from '../stores/auth.js'

let driverLoaded = null // module-level lazy import cache

/**
 * Composable for per-feature guided tours using driver.js.
 *
 * @param {string} tourId - Unique tour identifier (e.g. 'dashboard', 'milk-recording')
 * @param {Array|Function} stepsOrFn - Steps array or function returning steps (for lazy i18n resolution)
 * @param {object} [options]
 * @param {boolean} [options.autoStart=true] - Auto-start on first visit
 */
export function useTour(tourId, stepsOrFn, options = {}) {
  const { autoStart = true } = options
  const authStore = useAuthStore()
  const hasCompleted = ref(false)
  let driverInstance = null
  let autoStartTimer = null
  let isMounted = false
  let destroyedByCleanup = false

  function storageKey() {
    const userId = authStore.user?.id || 'anon'
    const farmId = localStorage.getItem('farm_id') || 'default'
    return `tour_completed_${tourId}_${userId}_${farmId}`
  }

  function checkCompleted() {
    hasCompleted.value = localStorage.getItem(storageKey()) === '1'
  }

  function markComplete() {
    localStorage.setItem(storageKey(), '1')
    hasCompleted.value = true
  }

  function resetTour() {
    localStorage.removeItem(storageKey())
    hasCompleted.value = false
  }

  async function startTour() {
    // Guard against calls after unmount or environment teardown
    if (!isMounted || typeof document === 'undefined') return

    // Lazy-load driver.js on first tour start
    if (!driverLoaded) {
      driverLoaded = import('driver.js').then(async (mod) => {
        await import('driver.js/dist/driver.css')
        return mod.driver
      })
    }
    let driverFn
    try {
      driverFn = await driverLoaded
    } catch { return }
    if (!isMounted) return // Component may have unmounted during import

    // Resolve steps lazily so t() picks up the current locale
    let steps
    try {
      steps = typeof stepsOrFn === 'function' ? stepsOrFn() : stepsOrFn
    } catch { return } // Bail if environment torn down (e.g. test cleanup)

    // Filter out steps whose target element doesn't exist in the DOM
    const activeSteps = steps.filter((step) => {
      if (!step.element) return true // No element = centered popover
      return document.querySelector(step.element)
    })

    if (activeSteps.length === 0) return

    driverInstance = driverFn({
      showProgress: true,
      animate: true,
      allowClose: true,
      overlayColor: 'rgba(0, 0, 0, 0.5)',
      stagePadding: 8,
      stageRadius: 12,
      popoverClass: 'myherder-tour-popover',
      steps: activeSteps,
      onDestroyed: () => {
        // Only mark complete when user finishes/closes the tour naturally,
        // not when we programmatically destroy during unmount
        if (!destroyedByCleanup) markComplete()
        driverInstance = null
      },
    })

    driverInstance.drive()
  }

  function destroyTour() {
    if (driverInstance) {
      destroyedByCleanup = true
      driverInstance.destroy()
      driverInstance = null
      destroyedByCleanup = false
    }
  }

  onMounted(async () => {
    isMounted = true
    checkCompleted()
    if (autoStart && !hasCompleted.value) {
      // Wait for DOM to settle before starting
      await nextTick()
      // Small delay to ensure elements are rendered
      autoStartTimer = setTimeout(() => startTour(), 300)
    }
  })

  onBeforeUnmount(() => {
    isMounted = false
    clearTimeout(autoStartTimer)
    destroyTour()
  })

  return { hasCompleted, startTour, resetTour }
}
