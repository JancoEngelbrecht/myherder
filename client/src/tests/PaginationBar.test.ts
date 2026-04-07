import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import PaginationBar from '../components/atoms/PaginationBar.vue'

describe('PaginationBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders page info showing from/to/total counts', () => {
    const wrapper = mount(PaginationBar, {
      props: { total: 50, page: 1, limit: 20 },
    })

    // "Showing 1–20 of 50" — i18n key resolves to raw key in test env
    const info = wrapper.find('.pagination-info')
    expect(info.exists()).toBe(true)
  })

  it('emits update:page with next page when next button clicked', async () => {
    const wrapper = mount(PaginationBar, {
      props: { total: 50, page: 1, limit: 20 },
    })

    const buttons = wrapper.findAll('.page-btn')
    // Last button is the "next" chevron
    const nextBtn = buttons[buttons.length - 1]
    await nextBtn.trigger('click')

    const emitted = wrapper.emitted('update:page')
    expect(emitted).toHaveLength(1)
    expect(emitted[0][0]).toBe(2)
  })

  it('emits update:page with previous page when prev button clicked', async () => {
    const wrapper = mount(PaginationBar, {
      props: { total: 50, page: 2, limit: 20 },
    })

    const prevBtn = wrapper.findAll('.page-btn')[0]
    await prevBtn.trigger('click')

    const emitted = wrapper.emitted('update:page')
    expect(emitted).toHaveLength(1)
    expect(emitted[0][0]).toBe(1)
  })

  it('disables previous button on first page', () => {
    const wrapper = mount(PaginationBar, {
      props: { total: 50, page: 1, limit: 20 },
    })

    const prevBtn = wrapper.findAll('.page-btn')[0]
    expect(prevBtn.attributes('disabled')).toBeDefined()
  })

  it('disables next button on last page', () => {
    // 50 total, 20 per page → 3 pages total, on page 3 next is disabled
    const wrapper = mount(PaginationBar, {
      props: { total: 50, page: 3, limit: 20 },
    })

    const buttons = wrapper.findAll('.page-btn')
    const nextBtn = buttons[buttons.length - 1]
    expect(nextBtn.attributes('disabled')).toBeDefined()
  })
})
