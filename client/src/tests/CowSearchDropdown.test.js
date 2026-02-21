import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import CowSearchDropdown from '../components/molecules/CowSearchDropdown.vue'
import api from '../services/api.js'

vi.mock('../services/api.js', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

const MOCK_COWS = [
  { id: 'cow-1', tag_number: 'TAG-001', name: 'Bessie', sex: 'female' },
  { id: 'cow-2', tag_number: 'TAG-002', name: 'Daisy', sex: 'female' },
]

describe('CowSearchDropdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the input with the given placeholder', () => {
    const wrapper = mount(CowSearchDropdown, { props: { placeholder: 'Find a cow...' } })
    expect(wrapper.find('input').attributes('placeholder')).toBe('Find a cow...')
  })

  it('does not call the API when query is fewer than 2 characters', async () => {
    const wrapper = mount(CowSearchDropdown)
    await wrapper.find('input').setValue('T')
    vi.runAllTimers()
    await flushPromises()
    expect(api.get).not.toHaveBeenCalled()
  })

  it('calls the API after the 300ms debounce when query has 2+ characters', async () => {
    api.get.mockResolvedValue({ data: [] })
    const wrapper = mount(CowSearchDropdown)
    await wrapper.find('input').setValue('TA')
    vi.runAllTimers()
    await flushPromises()
    expect(api.get).toHaveBeenCalledWith('/cows', { params: { search: 'TA' } })
  })

  it('shows dropdown results after a successful search', async () => {
    api.get.mockResolvedValue({ data: MOCK_COWS })
    const wrapper = mount(CowSearchDropdown)
    await wrapper.find('input').setValue('TAG')
    vi.runAllTimers()
    await flushPromises()
    expect(wrapper.findAll('.dropdown-item')).toHaveLength(2)
    expect(wrapper.text()).toContain('TAG-001')
    expect(wrapper.text()).toContain('TAG-002')
  })

  it('emits update:modelValue with the cow id when a result is selected', async () => {
    api.get.mockResolvedValue({ data: MOCK_COWS })
    const wrapper = mount(CowSearchDropdown)
    await wrapper.find('input').setValue('TAG')
    vi.runAllTimers()
    await flushPromises()
    await wrapper.find('.dropdown-item').trigger('mousedown')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted.at(-1)).toEqual(['cow-1'])
  })

  it('shows the selected cow chip after selection', async () => {
    api.get.mockResolvedValue({ data: MOCK_COWS })
    const wrapper = mount(CowSearchDropdown)
    await wrapper.find('input').setValue('TAG')
    vi.runAllTimers()
    await flushPromises()
    await wrapper.find('.dropdown-item').trigger('mousedown')
    expect(wrapper.find('.selected-cow').exists()).toBe(true)
    expect(wrapper.find('.selected-cow').text()).toContain('TAG-001')
  })

  it('emits null and hides the chip when the clear button is clicked', async () => {
    api.get.mockResolvedValue({ data: MOCK_COWS })
    const wrapper = mount(CowSearchDropdown)
    await wrapper.find('input').setValue('TAG')
    vi.runAllTimers()
    await flushPromises()
    await wrapper.find('.dropdown-item').trigger('mousedown')
    // Now clear
    await wrapper.find('.clear-btn').trigger('click')
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([null])
    expect(wrapper.find('.selected-cow').exists()).toBe(false)
  })

  it('filters results by sexFilter prop client-side', async () => {
    const mixed = [
      { id: 'c1', tag_number: 'M-001', name: 'Bull', sex: 'male' },
      { id: 'c2', tag_number: 'F-001', name: 'Cow', sex: 'female' },
    ]
    api.get.mockResolvedValue({ data: mixed })
    const wrapper = mount(CowSearchDropdown, { props: { sexFilter: 'female' } })
    await wrapper.find('input').setValue('00')
    vi.runAllTimers()
    await flushPromises()
    const items = wrapper.findAll('.dropdown-item')
    expect(items).toHaveLength(1)
    expect(items[0].text()).toContain('F-001')
  })
})
