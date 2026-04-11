import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MilkRecordCard from '../components/molecules/MilkRecordCard.vue'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRecord(overrides = {}) {
  return {
    id: 'rec-1',
    animal_id: 'cow-1',
    tag_number: 'C-001',
    animal_name: 'Bella',
    recorded_by: 'user-1',
    recorded_by_name: 'Admin',
    session: 'morning',
    litres: 12.5,
    recording_date: '2026-02-15',
    session_time: '06:30',
    milk_discarded: false,
    discard_reason: null,
    notes: null,
    ...overrides,
  }
}

function createWrapper(record) {
  return mount(MilkRecordCard, {
    props: { record },
  })
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MilkRecordCard', () => {
  it('renders tag number and cow name', () => {
    const wrapper = createWrapper(makeRecord())
    expect(wrapper.text()).toContain('C-001')
    expect(wrapper.text()).toContain('Bella')
  })

  it('renders litres with one decimal', () => {
    const wrapper = createWrapper(makeRecord({ litres: 12.5 }))
    expect(wrapper.text()).toContain('12.5 L')
  })

  it('renders session label and date', () => {
    const wrapper = createWrapper(makeRecord())
    expect(wrapper.text()).toContain('15/02/2026')
  })

  it('renders session time when present', () => {
    const wrapper = createWrapper(makeRecord({ session_time: '06:30' }))
    expect(wrapper.text()).toContain('06:30')
  })

  it('renders recorded-by name element', () => {
    const wrapper = createWrapper(makeRecord({ recorded_by_name: 'Sipho' }))
    expect(wrapper.find('.card-meta').exists()).toBe(true)
  })

  it('shows discarded badge and styling when milk_discarded is true', () => {
    const wrapper = createWrapper(makeRecord({ milk_discarded: true }))
    expect(wrapper.find('.discarded-badge').exists()).toBe(true)
    expect(wrapper.find('.card-discarded').exists()).toBe(true)
  })

  it('shows discard reason when present', () => {
    const wrapper = createWrapper(
      makeRecord({
        milk_discarded: true,
        discard_reason: 'Medication withdrawal until 2026-03-01',
      })
    )
    expect(wrapper.text()).toContain('Medication withdrawal until 2026-03-01')
  })

  it('handles missing optional fields gracefully', () => {
    const wrapper = createWrapper(
      makeRecord({
        animal_name: null,
        session_time: null,
        recorded_by_name: null,
        notes: null,
      })
    )
    expect(wrapper.find('.cow-name').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('null')
  })
})
