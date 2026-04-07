import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TourButton from '../components/atoms/TourButton.vue'

const i18nPlugin = {
  install(app) {
    app.config.globalProperties.$t = (key) => key
    app.provide('i18n', {
      locale: { value: 'en' },
      t: (key) => key,
    })
  },
}

describe('TourButton', () => {
  it('renders a button', () => {
    const wrapper = mount(TourButton, {
      global: { plugins: [i18nPlugin] },
    })
    expect(wrapper.find('button.tour-btn').exists()).toBe(true)
  })

  it('emits start-tour on click', async () => {
    const wrapper = mount(TourButton, {
      global: { plugins: [i18nPlugin] },
    })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('start-tour')).toBeTruthy()
    expect(wrapper.emitted('start-tour')).toHaveLength(1)
  })

  it('shows ? icon', () => {
    const wrapper = mount(TourButton, {
      global: { plugins: [i18nPlugin] },
    })
    expect(wrapper.find('.tour-btn-icon').text()).toBe('?')
  })

  it('adds above-fab class when aboveFab prop is true', () => {
    const wrapper = mount(TourButton, {
      global: { plugins: [i18nPlugin] },
      props: { aboveFab: true },
    })
    expect(wrapper.find('button.tour-btn--above-fab').exists()).toBe(true)
  })

  it('does not add above-fab class by default', () => {
    const wrapper = mount(TourButton, {
      global: { plugins: [i18nPlugin] },
    })
    expect(wrapper.find('button.tour-btn--above-fab').exists()).toBe(false)
  })
})
