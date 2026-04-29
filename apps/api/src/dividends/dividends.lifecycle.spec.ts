import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { computeEntitlements, totalDistributionCents, totalNetCents, totalWithholdingCents } from './dividends.math.js'
import { assertDividendTransition, canTransitionDividendStatus, LIFECYCLE_REQUIREMENTS } from './dividends.state.js'
import type { DividendStatus } from './dividends.types.js'

/**
 * Lifecycle-level invariants, exercised at the domain-logic seam without
 * a database. These are the same business rules the service layer uses
 * inside its transaction guards.
 */
describe('dividend lifecycle business rules', () => {
  it('rejects payment-related transitions when entitlements have not been calculated', () => {
    const reachable: DividendStatus[] = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ELIGIBILITY_LOCKED']
    for (const state of reachable) {
      assert.equal(canTransitionDividendStatus(state, 'PAYMENT_SCHEDULED'), false, `${state} → PAYMENT_SCHEDULED forbidden`)
      assert.equal(canTransitionDividendStatus(state, 'PARTIALLY_PAID'), false, `${state} → PARTIALLY_PAID forbidden`)
      assert.equal(canTransitionDividendStatus(state, 'PAID'), false, `${state} → PAID forbidden`)
    }
  })

  it('rejects calculation before approval', () => {
    assert.equal(canTransitionDividendStatus('DRAFT', 'CALCULATED'), false)
    assert.equal(canTransitionDividendStatus('PENDING_APPROVAL', 'CALCULATED'), false)
    assert.equal(canTransitionDividendStatus('APPROVED', 'CALCULATED'), false)
  })

  it('exposes human-readable lifecycle requirement messages', () => {
    assert.match(LIFECYCLE_REQUIREMENTS.approve, /PENDING_APPROVAL/)
    assert.match(LIFECYCLE_REQUIREMENTS.reject, /PENDING_APPROVAL/)
    assert.match(LIFECYCLE_REQUIREMENTS.requestChanges, /PENDING_APPROVAL/)
    assert.match(LIFECYCLE_REQUIREMENTS.lockEligibility, /APPROVED/)
    assert.match(LIFECYCLE_REQUIREMENTS.calculate, /ELIGIBILITY_LOCKED/)
    assert.match(LIFECYCLE_REQUIREMENTS.schedulePayment, /CALCULATED/)
    assert.match(LIFECYCLE_REQUIREMENTS.cancel, /paid/)
    assert.match(LIFECYCLE_REQUIREMENTS.cancelOverride, /override/)
  })

  it('CHANGES_REQUESTED → resubmit → APPROVED is a legal recovery loop', () => {
    const recovery: Array<[DividendStatus, DividendStatus]> = [
      ['DRAFT', 'PENDING_APPROVAL'],
      ['PENDING_APPROVAL', 'CHANGES_REQUESTED'],
      ['CHANGES_REQUESTED', 'PENDING_APPROVAL'],
      ['PENDING_APPROVAL', 'APPROVED'],
    ]
    for (const [from, to] of recovery) {
      assert.doesNotThrow(() => assertDividendTransition(from, to), `${from} → ${to}`)
    }
  })

  it('REJECTED is a sink — only CANCELLED is reachable', () => {
    assert.doesNotThrow(() => assertDividendTransition('PENDING_APPROVAL', 'REJECTED'))
    assert.doesNotThrow(() => assertDividendTransition('REJECTED', 'CANCELLED'))
    assert.throws(() => assertDividendTransition('REJECTED', 'DRAFT'), /Invalid dividend status transition/)
    assert.throws(() => assertDividendTransition('REJECTED', 'PENDING_APPROVAL'), /Invalid dividend status transition/)
  })

  it('assertDividendTransition gates the entire happy path', () => {
    const happy: Array<[DividendStatus, DividendStatus]> = [
      ['DRAFT', 'PENDING_APPROVAL'],
      ['PENDING_APPROVAL', 'APPROVED'],
      ['APPROVED', 'ELIGIBILITY_LOCKED'],
      ['ELIGIBILITY_LOCKED', 'CALCULATED'],
      ['CALCULATED', 'PAYMENT_SCHEDULED'],
      ['PAYMENT_SCHEDULED', 'PARTIALLY_PAID'],
      ['PARTIALLY_PAID', 'PAID'],
    ]
    for (const [from, to] of happy) {
      assert.doesNotThrow(() => assertDividendTransition(from, to), `${from} → ${to}`)
    }
  })
})

describe('dividend calculation produces totals consistent with declared rate', () => {
  it('per-share rate × eligibility roster equals declared total', () => {
    const drafts = computeEntitlements({
      positions: [
        { holderId: 'A', quantity: '1000' },
        { holderId: 'B', quantity: '500' },
        { holderId: 'C', quantity: '2500' },
      ],
      rateAmount: '0.50',
      rateType: 'PER_SHARE',
      withholdingDefaultPct: '10',
    })
    const expectedGross = (1000 + 500 + 2500) * 50 // 50¢ × shares
    assert.equal(totalDistributionCents(drafts), expectedGross)
    const wh = totalWithholdingCents(drafts)
    const net = totalNetCents(drafts)
    assert.equal(wh + net, expectedGross)
    assert.equal(wh, Math.round(expectedGross * 0.1))
  })

  it('fixed pool distribution preserves the pool exactly even with rounding', () => {
    const drafts = computeEntitlements({
      positions: [
        { holderId: 'A', quantity: '1' },
        { holderId: 'B', quantity: '1' },
        { holderId: 'C', quantity: '1' },
      ],
      rateAmount: '100.01', // $100.01 → 10001¢
      rateType: 'FIXED_AMOUNT',
    })
    assert.equal(totalDistributionCents(drafts), 10_001)
  })

  it('skips holders with zero balance — never produces zero-cent rows', () => {
    const drafts = computeEntitlements({
      positions: [
        { holderId: 'A', quantity: '0' },
        { holderId: 'B', quantity: '100' },
      ],
      rateAmount: '0.10',
      rateType: 'PER_SHARE',
    })
    assert.equal(drafts.length, 1)
    assert.equal(drafts[0].holderId, 'B')
  })
})
