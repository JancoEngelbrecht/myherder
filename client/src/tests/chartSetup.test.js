import { describe, it, expect } from 'vitest'
import { Chart as ChartJS } from 'chart.js'

describe('chartSetup', () => {
  it('import does not throw', async () => {
    await expect(import('../utils/chartSetup.js')).resolves.not.toThrow()
  })

  it('registers required Chart.js components', async () => {
    await import('../utils/chartSetup.js')
    const registry = ChartJS.registry
    // Verify core components are registered
    expect(registry.getScale('category')).toBeDefined()
    expect(registry.getScale('linear')).toBeDefined()
  })

  it('registers annotation plugin', async () => {
    await import('../utils/chartSetup.js')
    const plugins = ChartJS.registry.plugins.items
    const hasAnnotation = Object.values(plugins).some((p) => p.id === 'annotation')
    expect(hasAnnotation).toBe(true)
  })
})
