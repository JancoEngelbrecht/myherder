import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import BreedingEventCard from '../components/molecules/BreedingEventCard.vue'

const mockRouter = { push: vi.fn(), back: vi.fn() }
vi.mock('vue-router', () => ({
  useRouter: () => mockRouter,
}))

const MOCK_EVENT = {
  id: 'ev1',
  cow_id: 'c1',
  tag_number: 'TAG-001',
  cow_name: 'Bessie',
  event_type: 'ai_insemination',
  event_date: '2026-01-15',
  sire_name: 'Big Bull',
  expected_next_heat: null,
  expected_preg_check: '2026-02-19',
  expected_calving: null,
  notes: null,
}

describe('BreedingEventCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders event type badge and emoji', () => {
    const wrapper = mount(BreedingEventCard, {
      props: { event: MOCK_EVENT, showDelete: false },
    })

    // event_type ai_insemination maps to 'insem' category
    expect(wrapper.find('.event-avatar').exists()).toBe(true)
    // Badge with event type key
    expect(wrapper.find('.badge').text()).toContain('ai_insemination')
  })

  it('shows cow tag number and event date when showCow is true', () => {
    const wrapper = mount(BreedingEventCard, {
      props: { event: MOCK_EVENT, showCow: true, showDelete: false },
    })

    expect(wrapper.find('.event-title').text()).toContain('TAG-001')
    expect(wrapper.find('.event-date').text()).toBeTruthy()
  })

  it('emits edit event with the event id when edit button clicked', async () => {
    const wrapper = mount(BreedingEventCard, {
      props: { event: MOCK_EVENT, showCow: false, showDelete: true },
    })

    await wrapper.find('.btn-edit').trigger('click')

    const emitted = wrapper.emitted('edit')
    expect(emitted).toHaveLength(1)
    expect(emitted[0][0]).toBe('ev1')
  })

  it('emits delete event with the event id when delete button clicked', async () => {
    const wrapper = mount(BreedingEventCard, {
      props: { event: MOCK_EVENT, showCow: false, showDelete: true },
    })

    await wrapper.find('.btn-delete').trigger('click')

    const emitted = wrapper.emitted('delete')
    expect(emitted).toHaveLength(1)
    expect(emitted[0][0]).toBe('ev1')
  })
})
