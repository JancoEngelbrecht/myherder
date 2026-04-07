import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ConfirmDialog from '../components/molecules/ConfirmDialog.vue'

describe('ConfirmDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders dialog content when show is true and is absent when show is false', () => {
    const shownWrapper = mount(ConfirmDialog, {
      props: { show: true, message: 'Are you sure?' },
    })
    expect(shownWrapper.find('.dialog-overlay').exists()).toBe(true)

    const hiddenWrapper = mount(ConfirmDialog, {
      props: { show: false, message: 'Are you sure?' },
    })
    expect(hiddenWrapper.find('.dialog-overlay').exists()).toBe(false)
  })

  it('displays the custom message prop', () => {
    const wrapper = mount(ConfirmDialog, {
      props: { show: true, message: 'Delete this cow permanently?' },
    })
    expect(wrapper.find('.dialog-text').text()).toBe('Delete this cow permanently?')
  })

  it('emits confirm when confirm button clicked', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: { show: true, message: 'Delete?' },
    })

    await wrapper.find('.btn-danger').trigger('click')

    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })

  it('emits cancel when cancel button clicked', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: { show: true, message: 'Delete?' },
    })

    await wrapper.find('.btn-secondary').trigger('click')

    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('disables both buttons and shows disabled state when loading is true', () => {
    const wrapper = mount(ConfirmDialog, {
      props: { show: true, message: 'Delete?', loading: true },
    })

    const confirmBtn = wrapper.find('.btn-danger')
    const cancelBtn = wrapper.find('.btn-secondary')
    expect(confirmBtn.attributes('disabled')).toBeDefined()
    expect(cancelBtn.attributes('disabled')).toBeDefined()
  })

  it('renders custom confirm and cancel labels via props', () => {
    const wrapper = mount(ConfirmDialog, {
      props: {
        show: true,
        message: 'Remove?',
        confirmLabel: 'Yes, remove',
        cancelLabel: 'No, keep it',
      },
    })

    expect(wrapper.find('.btn-danger').text()).toBe('Yes, remove')
    expect(wrapper.find('.btn-secondary').text()).toBe('No, keep it')
  })
})
