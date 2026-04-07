import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import TeatSelector from '../components/molecules/TeatSelector.vue'

describe('TeatSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders exactly 4 teat buttons', () => {
    const wrapper = mount(TeatSelector, {
      props: { modelValue: [] },
    })
    const buttons = wrapper.findAll('.teat-btn')
    expect(buttons).toHaveLength(4)
  })

  it('clicking an unselected teat toggles it into the selection', async () => {
    const wrapper = mount(TeatSelector, {
      props: { modelValue: [] },
    })

    await wrapper.findAll('.teat-btn')[0].trigger('click')

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toHaveLength(1)
    expect(emitted[0][0]).toContain('front_left')
  })

  it('clicking an already-selected teat removes it from the selection', async () => {
    const wrapper = mount(TeatSelector, {
      props: { modelValue: ['front_left', 'rear_right'] },
    })

    // front_left is the first button
    await wrapper.findAll('.teat-btn')[0].trigger('click')

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toHaveLength(1)
    expect(emitted[0][0]).not.toContain('front_left')
    expect(emitted[0][0]).toContain('rear_right')
  })

  it('emits updated selection array containing all selected teats', async () => {
    const wrapper = mount(TeatSelector, {
      props: { modelValue: ['front_left'] },
    })

    // Click front_right (index 1)
    await wrapper.findAll('.teat-btn')[1].trigger('click')

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toHaveLength(1)
    const result = emitted[0][0]
    expect(result).toContain('front_left')
    expect(result).toContain('front_right')
  })

  it('pre-selected teats render with selected class', () => {
    const wrapper = mount(TeatSelector, {
      props: { modelValue: ['front_left', 'rear_left'] },
    })

    const buttons = wrapper.findAll('.teat-btn')
    expect(buttons[0].classes()).toContain('selected') // front_left
    expect(buttons[1].classes()).not.toContain('selected') // front_right
    expect(buttons[2].classes()).toContain('selected') // rear_left
    expect(buttons[3].classes()).not.toContain('selected') // rear_right
  })
})
