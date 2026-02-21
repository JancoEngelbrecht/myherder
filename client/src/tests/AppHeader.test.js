import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import AppHeader from '../components/organisms/AppHeader.vue'

const mockRouter = { push: vi.fn(), back: vi.fn() }

vi.mock('vue-router', () => ({
  useRouter: () => mockRouter,
}))

// Mock cows store deps so SyncIndicator doesn't blow up
vi.mock('../services/api.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

vi.mock('../services/syncManager.js', () => ({
  pullCows: vi.fn().mockResolvedValue([]),
  getLocalCows: vi.fn().mockResolvedValue([]),
  isOfflineError: vi.fn().mockReturnValue(false),
}))

const stubs = { SyncIndicator: true }

describe('AppHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset history state between tests so window.history.state?.back is falsy by default
    window.history.pushState({}, '')
  })

  it('renders the title prop', () => {
    const wrapper = mount(AppHeader, { props: { title: 'Herd Dashboard' }, global: { stubs } })
    expect(wrapper.text()).toContain('Herd Dashboard')
  })

  it('uses the default title when no prop is provided', () => {
    const wrapper = mount(AppHeader, { global: { stubs } })
    expect(wrapper.text()).toContain('MyHerder')
  })

  it('hides the back button when showBack is false', () => {
    const wrapper = mount(AppHeader, { props: { showBack: false }, global: { stubs } })
    expect(wrapper.find('button.btn-icon').exists()).toBe(false)
  })

  it('shows the back button when showBack is true', () => {
    const wrapper = mount(AppHeader, { props: { showBack: true }, global: { stubs } })
    expect(wrapper.find('button.btn-icon').exists()).toBe(true)
  })

  it('calls router.back() when back button is clicked and no backTo is provided', async () => {
    // Give jsdom a history entry so window.history.state.back is truthy
    window.history.pushState({ back: '/cows' }, '')
    const wrapper = mount(AppHeader, { props: { showBack: true }, global: { stubs } })
    await wrapper.find('button.btn-icon').trigger('click')
    expect(mockRouter.back).toHaveBeenCalledOnce()
    expect(mockRouter.push).not.toHaveBeenCalled()
  })

  it('calls router.push(backTo) when backTo prop is provided', async () => {
    const wrapper = mount(AppHeader, {
      props: { showBack: true, backTo: '/cows' },
      global: { stubs },
    })
    await wrapper.find('button.btn-icon').trigger('click')
    expect(mockRouter.push).toHaveBeenCalledWith('/cows')
    expect(mockRouter.back).not.toHaveBeenCalled()
  })

  it('shows the language toggle button', () => {
    const wrapper = mount(AppHeader, { global: { stubs } })
    expect(wrapper.find('.lang-toggle').exists()).toBe(true)
  })
})
