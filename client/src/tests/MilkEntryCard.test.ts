import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MilkEntryCard from '../components/molecules/MilkEntryCard.vue'

const activeCow = {
  id: 'cow-1',
  tag_number: 'MH-001',
  name: 'Bessie',
  sex: 'female',
  status: 'active',
}

const noNameCow = { ...activeCow, name: null }

const savedRecord = {
  id: 'rec-1',
  animal_id: 'cow-1',
  litres: 12.5,
  milk_discarded: false,
}

function mountCard(propsOverride = {}) {
  return mount(MilkEntryCard, {
    props: {
      cow: activeCow,
      record: null,
      syncStatus: 'idle',
      onWithdrawal: false,
      withdrawalUntil: null,
      ...propsOverride,
    },
  })
}

describe('MilkEntryCard', () => {
  // ─── Rendering ────────────────────────────────────────────────────────────

  it('renders the cow tag number', () => {
    const wrapper = mountCard()
    expect(wrapper.text()).toContain('MH-001')
  })

  it('renders the cow name when present', () => {
    const wrapper = mountCard()
    expect(wrapper.text()).toContain('Bessie')
  })

  it('does not render a name span when cow has no name', () => {
    const wrapper = mountCard({ cow: noNameCow })
    expect(wrapper.find('.cow-name').exists()).toBe(false)
  })

  // ─── Withdrawal banner ────────────────────────────────────────────────────

  it('shows the withdrawal banner when onWithdrawal=true', () => {
    const wrapper = mountCard({
      onWithdrawal: true,
      withdrawalUntil: '2026-03-01T00:00:00.000Z',
    })
    expect(wrapper.find('.withdrawal-banner').exists()).toBe(true)
  })

  it('hides the withdrawal banner when onWithdrawal=false', () => {
    const wrapper = mountCard()
    expect(wrapper.find('.withdrawal-banner').exists()).toBe(false)
  })

  it('applies card-withdrawal class when cow is on withdrawal', () => {
    const wrapper = mountCard({ onWithdrawal: true })
    expect(wrapper.find('.milk-entry-card').classes()).toContain('card-withdrawal')
  })

  // ─── Input behaviour ──────────────────────────────────────────────────────

  it('shows the record litres as input value for active cows', () => {
    const wrapper = mountCard({ record: savedRecord })
    expect(Number(wrapper.find('input').element.value)).toBe(12.5)
  })

  it('shows empty input when there is no record', () => {
    const wrapper = mountCard({ record: null })
    expect(wrapper.find('input').element.value).toBe('')
  })

  it('input max attribute is 999.99', () => {
    const wrapper = mountCard()
    expect(wrapper.find('input').attributes('max')).toBe('999.99')
  })

  // ─── handleInput / update emit ────────────────────────────────────────────

  it('emits update with the parsed number on valid input', async () => {
    const wrapper = mountCard()
    const input = wrapper.find('input')
    await input.setValue('15.5')
    await input.trigger('input')
    expect(wrapper.emitted('update')).toBeTruthy()
    expect(wrapper.emitted('update')[0]).toEqual([15.5])
  })

  it('emits update(0) when the field is cleared', async () => {
    const wrapper = mountCard({ record: savedRecord })
    const input = wrapper.find('input')
    await input.setValue('')
    await input.trigger('input')
    expect(wrapper.emitted('update')).toBeTruthy()
    expect(wrapper.emitted('update')[0]).toEqual([0])
  })

  it('does not emit update for negative values', async () => {
    const wrapper = mountCard()
    const input = wrapper.find('input')
    await input.setValue('-5')
    await input.trigger('input')
    expect(wrapper.emitted('update')).toBeFalsy()
  })

  // ─── Sync badge ───────────────────────────────────────────────────────────

  it('shows no badge text when syncStatus is idle', () => {
    const wrapper = mountCard({ syncStatus: 'idle' })
    expect(wrapper.find('.sync-badge').text()).toBe('')
  })

  it('applies status-saving class when syncStatus is saving', () => {
    const wrapper = mountCard({ syncStatus: 'saving' })
    expect(wrapper.find('.sync-badge').classes()).toContain('status-saving')
  })

  it('applies status-saved class when syncStatus is saved', () => {
    const wrapper = mountCard({ syncStatus: 'saved' })
    expect(wrapper.find('.sync-badge').classes()).toContain('status-saved')
  })

  it('applies status-error class when syncStatus is error', () => {
    const wrapper = mountCard({ syncStatus: 'error' })
    expect(wrapper.find('.sync-badge').classes()).toContain('status-error')
  })
})
