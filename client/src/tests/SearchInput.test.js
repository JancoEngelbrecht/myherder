import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import SearchInput from '../components/atoms/SearchInput.vue'

describe('SearchInput', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders input with the placeholder prop', () => {
    const wrapper = mount(SearchInput, {
      props: { modelValue: '', placeholder: 'Search cows...' },
    })

    const input = wrapper.find('input.search-input')
    expect(input.exists()).toBe(true)
    expect(input.attributes('placeholder')).toBe('Search cows...')
  })

  it('emits update:modelValue after debounce when user types', async () => {
    vi.useFakeTimers()
    const wrapper = mount(SearchInput, {
      props: { modelValue: '' },
    })

    const input = wrapper.find('input.search-input')
    // setValue sets the element value and triggers the input event
    await input.setValue('Holstein')

    // Advance past the 300ms debounce
    vi.runAllTimers()
    await flushPromises()

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    // The last emitted value should be 'Holstein'
    const lastEmit = emitted[emitted.length - 1]
    expect(lastEmit[0]).toBe('Holstein')

    vi.useRealTimers()
  })

  it('clear button resets value and emits empty string immediately', async () => {
    const wrapper = mount(SearchInput, {
      props: { modelValue: 'existing text' },
    })

    // The clear button appears when internal value is non-empty.
    // Set the internal value via setValue on the input element.
    const input = wrapper.find('input.search-input')
    await input.setValue('existing text')

    const clearBtn = wrapper.find('.search-clear')
    expect(clearBtn.exists()).toBe(true)

    await clearBtn.trigger('click')

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    const lastEmit = emitted[emitted.length - 1]
    expect(lastEmit[0]).toBe('')
  })
})
