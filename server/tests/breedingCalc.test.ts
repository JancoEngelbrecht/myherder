const { calcDates } = require('../helpers/breedingCalc')

// Note: calcDates uses setDate/getDate (local time) internally. The exact
// output dates may shift by ±1 day depending on server timezone. These tests
// verify the arithmetic is consistent and use actual computed output from the
// local timezone. In production, the server timezone should be set to match
// the farm's timezone for correct date computation.

const BASE_DATE = '2026-03-15' // Use mid-month to avoid timezone boundary ambiguity

describe('calcDates', () => {
  // Compute expected dates once from the actual function for reference
  const defaults = calcDates('ai_insemination', BASE_DATE)

  // ── Default timings ─────────────────────────────────────────────

  it('heat_observed returns expected_next_heat and expected_preg_check only', () => {
    const result = calcDates('heat_observed', BASE_DATE)
    expect(result.expected_next_heat).toBeTruthy()
    expect(result.expected_preg_check).toBeTruthy()
    expect(result.expected_calving).toBeNull()
    expect(result.expected_dry_off).toBeNull()
  })

  it('ai_insemination returns all 4 auto-dates', () => {
    const result = calcDates('ai_insemination', BASE_DATE)
    expect(result.expected_next_heat).toBeTruthy()
    expect(result.expected_preg_check).toBeTruthy()
    expect(result.expected_calving).toBeTruthy()
    expect(result.expected_dry_off).toBeTruthy()
  })

  it('bull_service computes same dates as ai_insemination', () => {
    const result = calcDates('bull_service', BASE_DATE)
    expect(result.expected_calving).toBe(defaults.expected_calving)
    expect(result.expected_dry_off).toBe(defaults.expected_dry_off)
    expect(result.expected_next_heat).toBe(defaults.expected_next_heat)
    expect(result.expected_preg_check).toBe(defaults.expected_preg_check)
  })

  it('default timings produce correct day offsets', () => {
    const base = new Date(BASE_DATE)
    const heat = new Date(defaults.expected_next_heat)
    const preg = new Date(defaults.expected_preg_check)
    const calving = new Date(defaults.expected_calving)
    const dryOff = new Date(defaults.expected_dry_off)

    // Verify day offsets (allow ±1 for timezone)
    const dayDiff = (a, b) => Math.round((a - b) / (1000 * 60 * 60 * 24))
    expect(dayDiff(heat, base)).toBeGreaterThanOrEqual(20)
    expect(dayDiff(heat, base)).toBeLessThanOrEqual(22) // ~21 days
    expect(dayDiff(preg, base)).toBeGreaterThanOrEqual(34)
    expect(dayDiff(preg, base)).toBeLessThanOrEqual(36) // ~35 days
    expect(dayDiff(calving, base)).toBeGreaterThanOrEqual(282)
    expect(dayDiff(calving, base)).toBeLessThanOrEqual(284) // ~283 days
    // dry_off is calving - 60 days
    expect(dayDiff(calving, dryOff)).toBeGreaterThanOrEqual(59)
    expect(dayDiff(calving, dryOff)).toBeLessThanOrEqual(61) // ~60 days
  })

  // ── Breed-specific overrides ────────────────────────────────────

  it('uses breed-specific timings when provided', () => {
    const jersey = {
      heat_cycle_days: 18,
      gestation_days: 279,
      preg_check_days: 30,
      dry_off_days: 55,
    }
    const result = calcDates('ai_insemination', BASE_DATE, jersey)

    // Verify the overrides produce different dates than defaults
    expect(result.expected_next_heat).not.toBe(defaults.expected_next_heat)
    expect(result.expected_preg_check).not.toBe(defaults.expected_preg_check)
    expect(result.expected_calving).not.toBe(defaults.expected_calving)

    // Verify approximate day offsets
    const base = new Date(BASE_DATE)
    const dayDiff = (a, b) => Math.round((a - b) / (1000 * 60 * 60 * 24))
    expect(dayDiff(new Date(result.expected_next_heat), base)).toBeGreaterThanOrEqual(17)
    expect(dayDiff(new Date(result.expected_next_heat), base)).toBeLessThanOrEqual(19) // ~18
    expect(dayDiff(new Date(result.expected_calving), base)).toBeGreaterThanOrEqual(278)
    expect(dayDiff(new Date(result.expected_calving), base)).toBeLessThanOrEqual(280) // ~279
  })

  it('uses defaults for missing fields in partial breedTimings', () => {
    const partial = { heat_cycle_days: 18 } // only heat cycle overridden
    const result = calcDates('ai_insemination', BASE_DATE, partial)

    // Heat should differ from default (18 vs 21)
    expect(result.expected_next_heat).not.toBe(defaults.expected_next_heat)
    // Calving should match default (gestation not overridden)
    expect(result.expected_calving).toBe(defaults.expected_calving)
    // Preg check should match default (preg_check_days not overridden)
    expect(result.expected_preg_check).toBe(defaults.expected_preg_check)
  })

  // ── Non-insemination events ─────────────────────────────────────

  const nullResult = {
    expected_next_heat: null,
    expected_preg_check: null,
    expected_calving: null,
    expected_dry_off: null,
  }

  it('preg_check_positive returns all null dates', () => {
    expect(calcDates('preg_check_positive', BASE_DATE)).toEqual(nullResult)
  })

  it('calving returns all null dates', () => {
    expect(calcDates('calving', BASE_DATE)).toEqual(nullResult)
  })

  it('dry_off returns all null dates', () => {
    expect(calcDates('dry_off', BASE_DATE)).toEqual(nullResult)
  })

  it('abort returns all null dates', () => {
    expect(calcDates('abort', BASE_DATE)).toEqual(nullResult)
  })

  it('unknown event type returns all null dates', () => {
    expect(calcDates('unknown_type', BASE_DATE)).toEqual(nullResult)
  })

  // ── Edge cases ──────────────────────────────────────────────────

  it('handles month boundary crossing', () => {
    const result = calcDates('heat_observed', '2026-01-28')
    // Should produce a February date, not crash
    expect(result.expected_next_heat).toMatch(/^2026-02/)
  })

  it('handles year boundary crossing', () => {
    const result = calcDates('ai_insemination', '2026-12-15')
    // Calving should be in 2027
    expect(result.expected_calving).toMatch(/^2027-/)
  })

  it('returns defined result for null eventDate (documents behavior)', () => {
    // calcDates does not validate eventDate — caller responsibility
    // With null, new Date(null) = epoch, addDays returns valid but wrong dates
    const result = calcDates('ai_insemination', null)
    expect(result).toBeDefined()
    expect(result.expected_next_heat).toBeDefined()
  })
})
