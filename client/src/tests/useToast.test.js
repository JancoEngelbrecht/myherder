import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useToast } from '../composables/useToast.js'

describe('useToast', () => {
  beforeEach(() => {
    // Clear existing toasts between tests
    const { toasts } = useToast()
    toasts.value = []
  })

  it('show() adds toast to reactive list', () => {
    const { show, toasts } = useToast()
    show('Test message')
    expect(toasts.value).toHaveLength(1)
    expect(toasts.value[0].message).toBe('Test message')
  })

  it('show() with type sets correct type property', () => {
    const { show, toasts } = useToast()
    show('Warning', 'warning')
    expect(toasts.value[toasts.value.length - 1].type).toBe('warning')
  })

  it('dismiss() removes toast by id', () => {
    const { show, dismiss, toasts } = useToast()
    const id = show('To remove', 'error', 0) // duration 0 to avoid auto-dismiss
    expect(toasts.value.some((t) => t.id === id)).toBe(true)
    dismiss(id)
    expect(toasts.value.some((t) => t.id === id)).toBe(false)
  })

  it('auto-dismisses after duration', async () => {
    vi.useFakeTimers()
    const { show, toasts } = useToast()
    show('Auto dismiss', 'error', 1000)
    expect(toasts.value).toHaveLength(1)
    vi.advanceTimersByTime(1000)
    expect(toasts.value).toHaveLength(0)
    vi.useRealTimers()
  })
})
