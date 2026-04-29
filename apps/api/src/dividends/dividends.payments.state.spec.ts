import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  assertBatchTransition,
  assertPaymentTransition,
  BatchTransitionError,
  canBatchTransition,
  canPaymentTransition,
  isTerminalBatch,
  isTerminalPayment,
  PaymentTransitionError,
  rollupBatchStatus,
} from './dividends.payments.state.js'

describe('dividends.payments.state — batch transitions', () => {
  it('walks the canonical happy path DRAFT → RECONCILED', () => {
    const path = [
      ['DRAFT', 'PENDING_APPROVAL'],
      ['PENDING_APPROVAL', 'APPROVED'],
      ['APPROVED', 'SCHEDULED'],
      ['SCHEDULED', 'PROCESSING'],
      ['PROCESSING', 'PROCESSED'],
      ['PROCESSED', 'RECONCILED'],
    ] as const
    for (const [from, to] of path) {
      assert.equal(canBatchTransition(from, to), true, `${from} → ${to}`)
    }
  })

  it('refuses backwards transitions like SCHEDULED → DRAFT', () => {
    assert.equal(canBatchTransition('SCHEDULED', 'DRAFT'), false)
    assert.throws(() => assertBatchTransition('SCHEDULED', 'DRAFT'), BatchTransitionError)
  })

  it('treats RECONCILED and CANCELLED as terminal', () => {
    assert.equal(isTerminalBatch('RECONCILED'), true)
    assert.equal(isTerminalBatch('CANCELLED'), true)
    assert.equal(isTerminalBatch('PROCESSED'), false)
  })

  it('allows reject (PENDING_APPROVAL → DRAFT) but not approve from DRAFT', () => {
    assert.equal(canBatchTransition('PENDING_APPROVAL', 'DRAFT'), true)
    assert.equal(canBatchTransition('DRAFT', 'APPROVED'), false)
  })

  it('honours legacy COMPLETED as a reconciliation source', () => {
    assert.equal(canBatchTransition('COMPLETED', 'RECONCILED'), true)
  })
})

describe('dividends.payments.state — payment transitions', () => {
  it('walks the canonical PENDING → RECONCILED happy path', () => {
    const path = [
      ['PENDING', 'SCHEDULED'],
      ['SCHEDULED', 'PROCESSING'],
      ['PROCESSING', 'PAID'],
      ['PAID', 'RECONCILED'],
    ] as const
    for (const [from, to] of path) {
      assert.equal(canPaymentTransition(from, to), true, `${from} → ${to}`)
    }
  })

  it('allows retry from FAILED back to SCHEDULED', () => {
    assert.equal(canPaymentTransition('FAILED', 'SCHEDULED'), true)
  })

  it('blocks transitions out of terminal states', () => {
    assert.equal(canPaymentTransition('RECONCILED', 'PAID'), false)
    assert.equal(canPaymentTransition('CANCELLED', 'PAID'), false)
    assert.equal(isTerminalPayment('CANCELLED'), true)
  })

  it('throws PaymentTransitionError for invalid transitions', () => {
    assert.throws(() => assertPaymentTransition('PENDING', 'PAID'), PaymentTransitionError)
  })

  it('treats SETTLED/SENT as legacy aliases that can still terminate', () => {
    assert.equal(canPaymentTransition('SETTLED', 'RECONCILED'), true)
    assert.equal(canPaymentTransition('SENT', 'PAID'), true)
  })
})

describe('dividends.payments.state — rollupBatchStatus', () => {
  it('returns null when there are no payments', () => {
    assert.equal(rollupBatchStatus({ cancelled: 0, failed: 0, inFlight: 0, paid: 0, pending: 0, reconciled: 0 }), null)
  })

  it('rolls up to PROCESSED when everything paid and nothing failed', () => {
    assert.equal(rollupBatchStatus({ cancelled: 0, failed: 0, inFlight: 0, paid: 4, pending: 0, reconciled: 0 }), 'PROCESSED')
  })

  it('rolls up to PARTIALLY_FAILED when some paid + some failed', () => {
    assert.equal(rollupBatchStatus({ cancelled: 0, failed: 1, inFlight: 0, paid: 3, pending: 0, reconciled: 0 }), 'PARTIALLY_FAILED')
  })

  it('rolls up to FAILED when all attempts failed', () => {
    assert.equal(rollupBatchStatus({ cancelled: 0, failed: 3, inFlight: 0, paid: 0, pending: 0, reconciled: 0 }), 'FAILED')
  })

  it('rolls up to PARTIALLY_PROCESSED while money is still in flight', () => {
    assert.equal(rollupBatchStatus({ cancelled: 0, failed: 0, inFlight: 1, paid: 2, pending: 0, reconciled: 0 }), 'PARTIALLY_PROCESSED')
    assert.equal(rollupBatchStatus({ cancelled: 0, failed: 0, inFlight: 0, paid: 2, pending: 1, reconciled: 0 }), 'PARTIALLY_PROCESSED')
  })
})
