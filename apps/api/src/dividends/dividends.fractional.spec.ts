import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { applyFractionalPolicy } from './dividends.fractional.js'

describe('applyFractionalPolicy', () => {
  it('truncates the fractional remainder under ROUND_DOWN', () => {
    const result = applyFractionalPolicy({ policy: 'ROUND_DOWN', shares: '12.45' })
    assert.equal(result.wholeShares, 12)
    assert.equal(result.fractionalShares, '0.45')
    assert.equal(result.adjustmentCents, 0)
    assert.equal(result.residualCashCents, 0)
  })

  it('rounds 0.5 up under ROUND_HALF_UP', () => {
    assert.equal(applyFractionalPolicy({ policy: 'ROUND_HALF_UP', shares: '12.5' }).wholeShares, 13)
    assert.equal(applyFractionalPolicy({ policy: 'ROUND_HALF_UP', shares: '12.49999999' }).wholeShares, 12)
    assert.equal(applyFractionalPolicy({ policy: 'ROUND_HALF_UP', shares: '12.50000001' }).wholeShares, 13)
  })

  it('uses banker rounding (half-to-even) under ROUND_HALF_EVEN', () => {
    // 12.5 → 12 (even); 13.5 → 14 (even); 11.5 → 12 (even).
    assert.equal(applyFractionalPolicy({ policy: 'ROUND_HALF_EVEN', shares: '12.5' }).wholeShares, 12)
    assert.equal(applyFractionalPolicy({ policy: 'ROUND_HALF_EVEN', shares: '13.5' }).wholeShares, 14)
    assert.equal(applyFractionalPolicy({ policy: 'ROUND_HALF_EVEN', shares: '11.5' }).wholeShares, 12)
    assert.equal(applyFractionalPolicy({ policy: 'ROUND_HALF_EVEN', shares: '12.4' }).wholeShares, 12)
    assert.equal(applyFractionalPolicy({ policy: 'ROUND_HALF_EVEN', shares: '12.6' }).wholeShares, 13)
  })

  it('pays residual cash under CASH_IN_LIEU', () => {
    // 0.873 shares × $82.44 (8244 cents) = ~$71.97 in cash.
    const result = applyFractionalPolicy({ policy: 'CASH_IN_LIEU', priceCents: 8244, shares: '12.873' })
    assert.equal(result.wholeShares, 12)
    assert.equal(result.fractionalShares, '0.873')
    assert.equal(result.residualCashCents, 7197)
    assert.equal(result.adjustmentCents, 7197)
  })

  it('refuses to compute CASH_IN_LIEU without a price', () => {
    assert.throws(() => applyFractionalPolicy({ policy: 'CASH_IN_LIEU', shares: '12.5' }))
  })

  it('refuses negative share counts', () => {
    assert.throws(() => applyFractionalPolicy({ policy: 'ROUND_DOWN', shares: '-1.0' }))
  })
})
