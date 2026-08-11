import { describe, expect, it } from 'vitest'
import { formatMinorUnits, parseMinorUnits } from './money'

describe('parseMinorUnits', () => {
  it('parses a whole-leone amount', () => {
    expect(parseMinorUnits('35000')).toBe(3_500_000)
  })

  it('parses thousands separators', () => {
    expect(parseMinorUnits('35,000')).toBe(3_500_000)
    expect(parseMinorUnits('1,234,567')).toBe(123_456_700)
  })

  it('parses two decimal places', () => {
    expect(parseMinorUnits('35000.50')).toBe(3_500_050)
  })

  it('pads a single decimal place', () => {
    expect(parseMinorUnits('35000.5')).toBe(3_500_050)
  })

  it('handles a bare zero and small amounts', () => {
    expect(parseMinorUnits('0')).toBe(0)
    expect(parseMinorUnits('0.01')).toBe(1)
  })

  it('strips leading zeros without misreading the value', () => {
    expect(parseMinorUnits('007')).toBe(700)
    expect(parseMinorUnits('00.05')).toBe(5)
  })

  it('rejects more than two decimal places', () => {
    expect(parseMinorUnits('35000.505')).toBeNull()
  })

  it('rejects non-numeric input', () => {
    expect(parseMinorUnits('abc')).toBeNull()
    expect(parseMinorUnits('35,00o')).toBeNull()
    expect(parseMinorUnits('')).toBeNull()
    expect(parseMinorUnits('   ')).toBeNull()
  })

  it('rejects multiple decimal points', () => {
    expect(parseMinorUnits('35.00.50')).toBeNull()
  })

  it('parses a negative amount', () => {
    expect(parseMinorUnits('-1000')).toBe(-100_000)
  })

  it('never produces a floating-point rounding artefact', () => {
    // The classic float trap: 0.1 + 0.2 !== 0.3 in IEEE 754. A parser doing
    // parseFloat(input) * 100 would be exposed to exactly this class of bug;
    // string-based parsing is not.
    expect(parseMinorUnits('0.10')).toBe(10)
    expect(parseMinorUnits('0.20')).toBe(20)
    expect(parseMinorUnits('19.99')).toBe(1999)
    expect(parseMinorUnits('100.29')).toBe(10029)
  })
})

describe('formatMinorUnits', () => {
  it('formats a whole-leone amount with thousands separators', () => {
    expect(formatMinorUnits(3_500_000)).toBe('SLE 35,000')
    expect(formatMinorUnits(123_456_700)).toBe('SLE 1,234,567')
  })

  it('formats cents only when non-zero', () => {
    expect(formatMinorUnits(3_500_050)).toBe('SLE 35,000.50')
    expect(formatMinorUnits(3_500_000)).toBe('SLE 35,000')
  })

  it('formats zero', () => {
    expect(formatMinorUnits(0)).toBe('SLE 0')
  })

  it('renders a negative amount with a real minus sign, per CLAUDE.md', () => {
    expect(formatMinorUnits(-100_000)).toBe('−SLE 1,000')
  })

  it('round-trips through parseMinorUnits', () => {
    for (const input of ['35000', '35,000.50', '0.01', '999999.99']) {
      const minor = parseMinorUnits(input)
      expect(minor).not.toBeNull()
      const reparsed = parseMinorUnits(formatMinorUnits(minor as number).replace('SLE ', ''))
      expect(reparsed).toBe(minor)
    }
  })
})
