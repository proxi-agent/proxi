import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { computeEntitlements, isValidRecordDate, totalDistributionCents } from './dividends.math.js'

describe('dividends math', () => {
  it('computes entitlements only for positive positions, sorted by holderId', () => {
    const entitlements = computeEntitlements(
      [
        { holderId: 'B', quantity: 100 },
        { holderId: 'A', quantity: 50 },
        { holderId: 'C', quantity: 0 },
        { holderId: 'D', quantity: -10 },
      ],
      25,
    )
    assert.equal(entitlements.length, 2)
    assert.equal(entitlements[0].holderId, 'A')
    assert.equal(entitlements[0].amountCents, 1250)
    assert.equal(entitlements[1].holderId, 'B')
    assert.equal(entitlements[1].amountCents, 2500)
  })

  it('rounds fractional cents to nearest integer', () => {
    const entitlements = computeEntitlements([{ holderId: 'X', quantity: 333 }], 3.3333)
    assert.equal(entitlements[0].amountCents, Math.round(333 * 3.3333))
  })

  it('throws on invalid rate', () => {
    assert.throws(() => computeEntitlements([], Number.NaN))
    assert.throws(() => computeEntitlements([], -1))
  })

  it('sums entitlements correctly', () => {
    const total = totalDistributionCents([{ amountCents: 100 }, { amountCents: 250 }, { amountCents: 5 }])
    assert.equal(total, 355)
  })

  it('validates declaration <= record <= payment order', () => {
    assert.equal(isValidRecordDate('2025-02-01', '2025-02-15', '2025-01-15'), true)
    assert.equal(isValidRecordDate('2025-01-01', '2025-02-15', '2025-02-01'), false)
    assert.equal(isValidRecordDate('not-a-date', '2025-02-15', '2025-01-15'), false)
  })
})
