const { calcWithdrawalDates } = require('../services/withdrawalService')

// Fixed base date makes expected values easy to verify
const BASE = '2026-01-01T12:00:00.000Z'

describe('calcWithdrawalDates', () => {
  it('returns null for both when milk hours and meat days are 0', () => {
    const { withdrawalEndMilk, withdrawalEndMeat } = calcWithdrawalDates(BASE, 0, 0)
    expect(withdrawalEndMilk).toBeNull()
    expect(withdrawalEndMeat).toBeNull()
  })

  it('calculates milk withdrawal end from hours', () => {
    const { withdrawalEndMilk, withdrawalEndMeat } = calcWithdrawalDates(BASE, 48, 0)
    // 48 h after 2026-01-01T12:00Z = 2026-01-03T12:00Z
    expect(withdrawalEndMilk).toEqual(new Date('2026-01-03T12:00:00.000Z'))
    expect(withdrawalEndMeat).toBeNull()
  })

  it('calculates meat withdrawal end from days', () => {
    const { withdrawalEndMilk, withdrawalEndMeat } = calcWithdrawalDates(BASE, 0, 0, 0, 4)
    // 4 days after 2026-01-01T12:00Z = 2026-01-05T12:00Z
    expect(withdrawalEndMilk).toBeNull()
    expect(withdrawalEndMeat).toEqual(new Date('2026-01-05T12:00:00.000Z'))
  })

  it('calculates both withdrawal dates independently', () => {
    const { withdrawalEndMilk, withdrawalEndMeat } = calcWithdrawalDates(BASE, 24, 0, 0, 7)
    expect(withdrawalEndMilk).toEqual(new Date('2026-01-02T12:00:00.000Z'))
    expect(withdrawalEndMeat).toEqual(new Date('2026-01-08T12:00:00.000Z'))
  })

  it('accepts a Date object as the treatment date', () => {
    const { withdrawalEndMilk } = calcWithdrawalDates(new Date(BASE), 12, 0)
    expect(withdrawalEndMilk).toEqual(new Date('2026-01-02T00:00:00.000Z'))
  })

  it('returns Date instances (not strings)', () => {
    const { withdrawalEndMilk, withdrawalEndMeat } = calcWithdrawalDates(BASE, 1, 0, 0, 1)
    expect(withdrawalEndMilk).toBeInstanceOf(Date)
    expect(withdrawalEndMeat).toBeInstanceOf(Date)
  })
})
