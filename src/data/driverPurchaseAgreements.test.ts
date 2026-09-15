import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
import { parseAgreementProgress } from './driverPurchaseAgreements'
import { DAY_OUTCOMES, DAY_OUTCOME_LABELS, OVERPAYMENT_REASON_LABELS } from '@/constants/labels'
const progress = { paidMinor: 25000, remainingMinor: 975000, originalCompletionOn: '2026-11-01', adjustedCompletionOn: '2026-11-02', remainingDays: 50, adjustmentDays: 1, missingDays: 0, asOfDate: '2026-09-13', estimatedBaseline: false, policyEffectiveOn: '2026-09-01' }
describe('purchase progress boundary', () => {
  it('accepts server results and earlier completion', () => {
    expect(parseAgreementProgress(progress)).toEqual(progress)
    expect(parseAgreementProgress({ ...progress, adjustmentDays: -3 }).adjustmentDays).toBe(-3)
  })
  it('rejects fractional and unsafe money and incomplete dates', () => {
    for (const paidMinor of [1.5, Number.MAX_SAFE_INTEGER + 1, '25000', null]) expect(() => parseAgreementProgress({ ...progress, paidMinor })).toThrow()
    expect(() => parseAgreementProgress({ ...progress, asOfDate: null })).toThrow()
    expect(() => parseAgreementProgress({})).toThrow()
  })
  it('accepts closed historical agreements without a known completion date', () => {
    expect(parseAgreementProgress({ ...progress, adjustedCompletionOn: null, originalCompletionOn: null, remainingDays: null, policyEffectiveOn: null }).remainingDays).toBeNull()
  })
})
describe('collection vocabulary', () => {
  it('places Service directly after Driver’s Day', () => {
    expect(DAY_OUTCOMES[DAY_OUTCOMES.indexOf('DRIVERS_DAY') + 1]).toBe('SERVICE')
    expect(DAY_OUTCOME_LABELS.SERVICE).toBe('Service')
    expect(OVERPAYMENT_REASON_LABELS.PURCHASE_PAYMENT).toBe('Extra toward vehicle purchase')
  })
})
