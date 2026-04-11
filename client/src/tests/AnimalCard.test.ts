import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AnimalCard from '../components/organisms/AnimalCard.vue'

const mockAnimal = {
  id: 'abc-123',
  tag_number: 'TAG-001',
  name: 'Bessie',
  breed: 'Holstein',
  sex: 'female',
  status: 'active',
  dob: '2021-03-15',
}

const stubs = { RouterLink: { template: '<a><slot /></a>' } }

describe('AnimalCard', () => {
  it('renders the tag number', () => {
    const wrapper = mount(AnimalCard, { props: { animal: mockAnimal }, global: { stubs } })
    expect(wrapper.text()).toContain('TAG-001')
  })

  it('renders the animal name', () => {
    const wrapper = mount(AnimalCard, { props: { animal: mockAnimal }, global: { stubs } })
    expect(wrapper.text()).toContain('Bessie')
  })

  it('omits the name element when animal has no name', () => {
    const wrapper = mount(AnimalCard, {
      props: { animal: { ...mockAnimal, name: null } },
      global: { stubs },
    })
    expect(wrapper.find('.animal-name').exists()).toBe(false)
  })

  it('shows the breed when provided', () => {
    const wrapper = mount(AnimalCard, { props: { animal: mockAnimal }, global: { stubs } })
    expect(wrapper.text()).toContain('Holstein')
  })

  it('applies sex-female class to avatar', () => {
    const wrapper = mount(AnimalCard, { props: { animal: mockAnimal }, global: { stubs } })
    expect(wrapper.find('.animal-avatar').classes()).toContain('sex-female')
  })
})
