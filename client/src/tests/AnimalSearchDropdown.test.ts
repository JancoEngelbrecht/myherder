import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AnimalSearchDropdown from '../components/molecules/AnimalSearchDropdown.vue'
import api from '../services/api'
import db from '../db/indexedDB'

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

vi.mock('../db/indexedDB', () => ({
  default: {
    animals: {
      get: vi.fn().mockResolvedValue(null),
      toArray: vi.fn().mockResolvedValue([]),
    },
  },
}))

vi.mock('../services/syncManager', () => ({
  isOfflineError: vi.fn((err) => !err.response),
}))

const MOCK_ANIMALS = [
  { id: 'animal-1', tag_number: 'TAG-001', name: 'Bessie', sex: 'female' },
  { id: 'animal-2', tag_number: 'TAG-002', name: 'Daisy', sex: 'female' },
]

describe('AnimalSearchDropdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the input with the given placeholder', () => {
    const wrapper = mount(AnimalSearchDropdown, { props: { placeholder: 'Find an animal...' } })
    expect(wrapper.find('input').attributes('placeholder')).toBe('Find an animal...')
  })

  it('does not call the API when query is fewer than 2 characters', async () => {
    const wrapper = mount(AnimalSearchDropdown)
    await wrapper.find('input').setValue('T')
    vi.runAllTimers()
    await flushPromises()
    expect(api.get).not.toHaveBeenCalled()
  })

  it('calls the API after the 300ms debounce when query has 2+ characters', async () => {
    api.get.mockResolvedValue({ data: [] })
    const wrapper = mount(AnimalSearchDropdown)
    await wrapper.find('input').setValue('TA')
    vi.runAllTimers()
    await flushPromises()
    expect(api.get).toHaveBeenCalledWith('/animals', { params: { search: 'TA' } })
  })

  it('shows dropdown results after a successful search', async () => {
    api.get.mockResolvedValue({ data: MOCK_ANIMALS })
    const wrapper = mount(AnimalSearchDropdown)
    await wrapper.find('input').setValue('TAG')
    vi.runAllTimers()
    await flushPromises()
    expect(wrapper.findAll('.dropdown-item')).toHaveLength(2)
    expect(wrapper.text()).toContain('TAG-001')
    expect(wrapper.text()).toContain('TAG-002')
  })

  it('emits update:modelValue with the animal id when a result is selected', async () => {
    api.get.mockResolvedValue({ data: MOCK_ANIMALS })
    const wrapper = mount(AnimalSearchDropdown)
    await wrapper.find('input').setValue('TAG')
    vi.runAllTimers()
    await flushPromises()
    await wrapper.find('.dropdown-item').trigger('mousedown')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted.at(-1)).toEqual(['animal-1'])
  })

  it('shows the selected animal chip after selection', async () => {
    api.get.mockResolvedValue({ data: MOCK_ANIMALS })
    const wrapper = mount(AnimalSearchDropdown)
    await wrapper.find('input').setValue('TAG')
    vi.runAllTimers()
    await flushPromises()
    await wrapper.find('.dropdown-item').trigger('mousedown')
    expect(wrapper.find('.selected-animal').exists()).toBe(true)
    expect(wrapper.find('.selected-animal').text()).toContain('TAG-001')
  })

  it('emits null and hides the chip when the clear button is clicked', async () => {
    api.get.mockResolvedValue({ data: MOCK_ANIMALS })
    const wrapper = mount(AnimalSearchDropdown)
    await wrapper.find('input').setValue('TAG')
    vi.runAllTimers()
    await flushPromises()
    await wrapper.find('.dropdown-item').trigger('mousedown')
    // Now clear
    await wrapper.find('.clear-btn').trigger('click')
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([null])
    expect(wrapper.find('.selected-animal').exists()).toBe(false)
  })

  it('passes sexFilter to API as server-side filter', async () => {
    const females = [{ id: 'a2', tag_number: 'F-001', name: 'Ewe', sex: 'female' }]
    api.get.mockResolvedValue({ data: females })
    const wrapper = mount(AnimalSearchDropdown, { props: { sexFilter: 'female' } })
    await wrapper.find('input').setValue('00')
    vi.runAllTimers()
    await flushPromises()
    expect(api.get).toHaveBeenCalledWith('/animals', { params: { search: '00', sex: 'female' } })
    const items = wrapper.findAll('.dropdown-item')
    expect(items).toHaveLength(1)
    expect(items[0].text()).toContain('F-001')
  })

  it('falls back to IndexedDB search when offline', async () => {
    const offlineAnimals = [
      { id: 'local-1', tag_number: 'OFF-001', name: 'OfflineBessie', sex: 'female' },
      { id: 'local-2', tag_number: 'OFF-002', name: 'OfflineDaisy', sex: 'female' },
      { id: 'local-3', tag_number: 'ZZZ-999', name: 'NoMatch', sex: 'female' },
    ]
    api.get.mockRejectedValue(new Error('Network Error'))
    db.animals.toArray.mockResolvedValue(offlineAnimals)

    const wrapper = mount(AnimalSearchDropdown)
    await wrapper.find('input').setValue('OFF')
    vi.runAllTimers()
    await flushPromises()

    const items = wrapper.findAll('.dropdown-item')
    expect(items).toHaveLength(2)
    expect(wrapper.text()).toContain('OFF-001')
    expect(wrapper.text()).toContain('OFF-002')
    expect(wrapper.text()).not.toContain('ZZZ-999')
  })

  it('applies sexFilter when searching IndexedDB offline', async () => {
    const offlineAnimals = [
      { id: 'local-1', tag_number: 'TAG-100', name: 'Bull', sex: 'male' },
      { id: 'local-2', tag_number: 'TAG-200', name: 'Cow', sex: 'female' },
    ]
    api.get.mockRejectedValue(new Error('Network Error'))
    db.animals.toArray.mockResolvedValue(offlineAnimals)

    const wrapper = mount(AnimalSearchDropdown, { props: { sexFilter: 'female' } })
    await wrapper.find('input').setValue('TAG')
    vi.runAllTimers()
    await flushPromises()

    const items = wrapper.findAll('.dropdown-item')
    expect(items).toHaveLength(1)
    expect(wrapper.text()).toContain('TAG-200')
    expect(wrapper.text()).not.toContain('TAG-100')
  })

  it('loads initial animal from IndexedDB when offline', async () => {
    const localAnimal = {
      id: 'animal-99',
      tag_number: 'LOC-001',
      name: 'LocalAnimal',
      sex: 'female',
    }
    api.get.mockRejectedValue(new Error('Network Error'))
    db.animals.get.mockResolvedValue(localAnimal)

    const wrapper = mount(AnimalSearchDropdown, { props: { modelValue: 'animal-99' } })
    await flushPromises()

    expect(wrapper.find('.selected-animal').exists()).toBe(true)
    expect(wrapper.find('.selected-animal').text()).toContain('LOC-001')
  })

  it('excludes soft-deleted animals from offline search results', async () => {
    const offlineAnimals = [
      { id: 'c1', tag_number: 'TAG-001', name: 'Alive', sex: 'female', deleted_at: null },
      { id: 'c2', tag_number: 'TAG-002', name: 'Deleted', sex: 'female', deleted_at: '2026-01-01' },
    ]
    api.get.mockRejectedValue(new Error('Network Error'))
    db.animals.toArray.mockResolvedValue(offlineAnimals)

    const wrapper = mount(AnimalSearchDropdown)
    await wrapper.find('input').setValue('TAG')
    vi.runAllTimers()
    await flushPromises()

    const items = wrapper.findAll('.dropdown-item')
    expect(items).toHaveLength(1)
    expect(wrapper.text()).toContain('TAG-001')
    expect(wrapper.text()).not.toContain('TAG-002')
  })

  it('does not load soft-deleted animal by ID from IndexedDB', async () => {
    const deletedAnimal = {
      id: 'animal-del',
      tag_number: 'DEL-001',
      name: 'Gone',
      sex: 'female',
      deleted_at: '2026-01-01',
    }
    api.get.mockRejectedValue(new Error('Network Error'))
    db.animals.get.mockResolvedValue(deletedAnimal)

    const wrapper = mount(AnimalSearchDropdown, { props: { modelValue: 'animal-del' } })
    await flushPromises()

    expect(wrapper.find('.selected-animal').exists()).toBe(false)
  })

  it('returns empty results when IndexedDB throws during offline search', async () => {
    api.get.mockRejectedValue(new Error('Network Error'))
    db.animals.toArray.mockRejectedValue(new Error('DatabaseClosedError'))

    const wrapper = mount(AnimalSearchDropdown)
    await wrapper.find('input').setValue('TAG')
    vi.runAllTimers()
    await flushPromises()

    expect(wrapper.findAll('.dropdown-item')).toHaveLength(0)
  })

  it('does not show results from a 500 server error via IndexedDB fallback', async () => {
    const serverErr = new Error('Internal Server Error')
    serverErr.response = { status: 500 }
    api.get.mockRejectedValue(serverErr)

    const wrapper = mount(AnimalSearchDropdown)
    await wrapper.find('input').setValue('TAG')
    vi.runAllTimers()
    await flushPromises()

    expect(db.animals.toArray).not.toHaveBeenCalled()
    expect(wrapper.findAll('.dropdown-item')).toHaveLength(0)
  })
})
