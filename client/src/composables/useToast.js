import { ref } from 'vue'

const toasts = ref([])
let nextId = 0

export function useToast() {
  function show(message, type = 'error', duration = 4000) {
    const id = ++nextId
    toasts.value.push({ id, message, type })
    if (duration > 0) setTimeout(() => dismiss(id), duration)
    return id
  }

  function dismiss(id) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  return { toasts, show, dismiss }
}
