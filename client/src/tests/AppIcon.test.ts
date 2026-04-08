import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AppIcon from '../components/atoms/AppIcon.vue'

describe('AppIcon', () => {
  it('renders an SVG element for a known icon name', () => {
    const wrapper = mount(AppIcon, { props: { name: 'home' } })
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('renders nothing for an unknown icon name', () => {
    const wrapper = mount(AppIcon, { props: { name: 'nonexistent-icon-xyz' } })
    // No svg — unknown icon is silently ignored
    expect(wrapper.find('svg').exists()).toBe(false)
  })

  it('passes size prop to the Lucide component', () => {
    const wrapper = mount(AppIcon, { props: { name: 'home', size: 32 } })
    const svg = wrapper.find('svg')
    expect(svg.exists()).toBe(true)
    // Lucide renders size as width/height attributes
    expect(svg.attributes('width')).toBe('32')
    expect(svg.attributes('height')).toBe('32')
  })

  it('uses size 20 as default', () => {
    const wrapper = mount(AppIcon, { props: { name: 'home' } })
    const svg = wrapper.find('svg')
    expect(svg.attributes('width')).toBe('20')
  })

  it('passes strokeWidth prop to the SVG', () => {
    const wrapper = mount(AppIcon, { props: { name: 'home', strokeWidth: 2.5 } })
    const svg = wrapper.find('svg')
    expect(svg.exists()).toBe(true)
    expect(svg.attributes('stroke-width')).toBe('2.5')
  })

  it('uses strokeWidth 1.5 as default', () => {
    const wrapper = mount(AppIcon, { props: { name: 'home' } })
    const svg = wrapper.find('svg')
    expect(svg.attributes('stroke-width')).toBe('1.5')
  })

  it('renders check icon', () => {
    const wrapper = mount(AppIcon, { props: { name: 'check' } })
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('renders trash icon via alias', () => {
    const wrapper = mount(AppIcon, { props: { name: 'trash' } })
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('renders settings icon', () => {
    const wrapper = mount(AppIcon, { props: { name: 'settings' } })
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('renders sync icon', () => {
    const wrapper = mount(AppIcon, { props: { name: 'sync' } })
    expect(wrapper.find('svg').exists()).toBe(true)
  })
})
