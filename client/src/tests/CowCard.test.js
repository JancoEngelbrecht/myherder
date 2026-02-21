import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CowCard from '../components/organisms/CowCard.vue'

const mockCow = {
  id: 'abc-123',
  tag_number: 'TAG-001',
  name: 'Bessie',
  breed: 'Holstein',
  sex: 'female',
  status: 'active',
  dob: '2021-03-15',
}

const stubs = { RouterLink: { template: '<a><slot /></a>' } }

describe('CowCard', () => {
  it('renders the tag number', () => {
    const wrapper = mount(CowCard, { props: { cow: mockCow }, global: { stubs } })
    expect(wrapper.text()).toContain('TAG-001')
  })

  it('renders the cow name', () => {
    const wrapper = mount(CowCard, { props: { cow: mockCow }, global: { stubs } })
    expect(wrapper.text()).toContain('Bessie')
  })

  it('shows em-dash when cow has no name', () => {
    const wrapper = mount(CowCard, { props: { cow: { ...mockCow, name: null } }, global: { stubs } })
    expect(wrapper.text()).toContain('—')
  })

  it('shows the breed when provided', () => {
    const wrapper = mount(CowCard, { props: { cow: mockCow }, global: { stubs } })
    expect(wrapper.text()).toContain('Holstein')
  })

  it('applies sex-female class to avatar', () => {
    const wrapper = mount(CowCard, { props: { cow: mockCow }, global: { stubs } })
    expect(wrapper.find('.cow-avatar').classes()).toContain('sex-female')
  })
})
