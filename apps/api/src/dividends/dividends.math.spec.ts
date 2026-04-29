import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  computeEntitlements,
  isValidExDividendDate,
  isValidRecordDate,
  totalDistributionCents,
  totalNetCents,
  totalWithholdingCents,
} from './dividends.math.js'

describe('dividends math — legacy two-arg signature', () => {
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
})

describe('dividends math — PER_SHARE rate type', () => {
  it('multiplies fractional shares by a dollar rate without floating-point error', () => {
    const entitlements = computeEntitlements({
      positions: [
        { holderId: 'A', quantity: '100.5' },
        { holderId: 'B', quantity: '0' },
        { holderId: 'C', quantity: '12345.67891234' },
      ],
      rateAmount: '0.25',
      rateType: 'PER_SHARE',
    })
    assert.equal(entitlements.length, 2)
    assert.equal(entitlements[0].holderId, 'A')
    assert.equal(entitlements[0].amountCents, 2513) // 100.5 * 0.25 = $25.125 → 2513¢ (round half-up)
    assert.equal(entitlements[1].holderId, 'C')
    assert.equal(entitlements[1].amountCents, Math.round(12345.67891234 * 0.25 * 100))
  })

  it('applies a default withholding pct to every holder', () => {
    const entitlements = computeEntitlements({
      positions: [{ holderId: 'A', quantity: '1000' }],
      rateAmount: '1.00',
      rateType: 'PER_SHARE',
      withholdingDefaultPct: '24',
    })
    assert.equal(entitlements[0].amountCents, 100_000)
    assert.equal(entitlements[0].withholdingCents, 24_000)
    assert.equal(entitlements[0].netAmountCents, 76_000)
  })

  it('honours per-shareholder withholding overrides', () => {
    const entitlements = computeEntitlements({
      positions: [
        { holderId: 'US', quantity: '1000' },
        { holderId: 'NRA', quantity: '1000' },
      ],
      rateAmount: '1.00',
      rateType: 'PER_SHARE',
      withholdingDefaultPct: '0',
      withholdingOverrides: { NRA: '30' },
    })
    const us = entitlements.find(e => e.holderId === 'US')!
    const nra = entitlements.find(e => e.holderId === 'NRA')!
    assert.equal(us.withholdingCents, 0)
    assert.equal(us.netAmountCents, 100_000)
    assert.equal(nra.withholdingCents, 30_000)
    assert.equal(nra.netAmountCents, 70_000)
  })
})

describe('dividends math — PERCENTAGE rate type', () => {
  it('multiplies par × shares × pct/100', () => {
    const entitlements = computeEntitlements({
      parValueCents: 100, // $1 par
      positions: [{ holderId: 'A', quantity: '1000' }],
      rateAmount: '5', // 5%
      rateType: 'PERCENTAGE',
    })
    // 1000 × $1.00 × 5% = $50.00 → 5000¢
    assert.equal(entitlements[0].amountCents, 5_000)
  })

  it('returns zero when par is zero', () => {
    const entitlements = computeEntitlements({
      parValueCents: 0,
      positions: [{ holderId: 'A', quantity: '1000' }],
      rateAmount: '5',
      rateType: 'PERCENTAGE',
    })
    assert.equal(entitlements[0].amountCents, 0)
  })
})

describe('dividends math — FIXED_AMOUNT rate type', () => {
  it('distributes pool pro-rata and preserves total exactly', () => {
    const entitlements = computeEntitlements({
      positions: [
        { holderId: 'A', quantity: '300' },
        { holderId: 'B', quantity: '700' },
      ],
      rateAmount: '1000.00', // $1,000 pool
      rateType: 'FIXED_AMOUNT',
    })
    assert.equal(totalDistributionCents(entitlements), 100_000) // = $1,000
    assert.equal(entitlements.find(e => e.holderId === 'A')!.amountCents, 30_000)
    assert.equal(entitlements.find(e => e.holderId === 'B')!.amountCents, 70_000)
  })

  it('attributes rounding remainder to the largest holder so the pool sums exactly', () => {
    const entitlements = computeEntitlements({
      positions: [
        { holderId: 'A', quantity: '1' },
        { holderId: 'B', quantity: '1' },
        { holderId: 'C', quantity: '1' },
      ],
      rateAmount: '0.10', // 10¢ across 3 holders → 3¢ + 3¢ + 4¢
      rateType: 'FIXED_AMOUNT',
    })
    assert.equal(totalDistributionCents(entitlements), 10)
    const sorted = [...entitlements].sort((a, b) => a.amountCents - b.amountCents)
    assert.equal(sorted[0].amountCents, 3)
    assert.equal(sorted[1].amountCents, 3)
    assert.equal(sorted[2].amountCents, 4)
  })
})

describe('dividends math — totals and date validation', () => {
  it('totals net + withholding back to gross', () => {
    const entitlements = computeEntitlements({
      positions: [
        { holderId: 'A', quantity: '500' },
        { holderId: 'B', quantity: '500' },
      ],
      rateAmount: '0.10',
      rateType: 'PER_SHARE',
      withholdingDefaultPct: '15',
    })
    const gross = totalDistributionCents(entitlements)
    const net = totalNetCents(entitlements)
    const wh = totalWithholdingCents(entitlements)
    assert.equal(gross, 10_000)
    assert.equal(net + wh, gross)
  })

  it('validates declaration ≤ record ≤ payment order', () => {
    assert.equal(isValidRecordDate('2025-02-01', '2025-02-15', '2025-01-15'), true)
    assert.equal(isValidRecordDate('2025-01-01', '2025-02-15', '2025-02-01'), false)
    assert.equal(isValidRecordDate('not-a-date', '2025-02-15', '2025-01-15'), false)
  })

  it('validates ex-dividend date sits between declaration and record', () => {
    assert.equal(isValidExDividendDate(undefined, '2025-02-01', '2025-01-15'), true)
    assert.equal(isValidExDividendDate('2025-01-30', '2025-02-01', '2025-01-15'), true)
    assert.equal(isValidExDividendDate('2025-02-05', '2025-02-01', '2025-01-15'), false)
    assert.equal(isValidExDividendDate('2025-01-10', '2025-02-01', '2025-01-15'), false)
  })
})
