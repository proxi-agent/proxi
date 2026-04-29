import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  allowedActionsFor,
  assertDividendTransition,
  canCancelDividend,
  canForceCancelDividend,
  canTransitionDividendStatus,
  isApprovedOrLater,
  isCalculatedOrLater,
  isEligibilityLockedOrLater,
  isTerminalDividendStatus,
} from './dividends.state.js'
import type { DividendStatus } from './dividends.types.js'

describe('dividend state machine', () => {
  it('allows happy-path progression', () => {
    const path: Array<[DividendStatus, DividendStatus]> = [
      ['DRAFT', 'PENDING_APPROVAL'],
      ['PENDING_APPROVAL', 'APPROVED'],
      ['APPROVED', 'ELIGIBILITY_LOCKED'],
      ['ELIGIBILITY_LOCKED', 'CALCULATED'],
      ['CALCULATED', 'PAYMENT_SCHEDULED'],
      ['PAYMENT_SCHEDULED', 'PARTIALLY_PAID'],
      ['PARTIALLY_PAID', 'PAID'],
    ]
    for (const [from, to] of path) {
      assert.equal(canTransitionDividendStatus(from, to), true, `${from} → ${to}`)
    }
  })

  it('allows PAYMENT_SCHEDULED to jump straight to PAID (single-shareholder run)', () => {
    assert.equal(canTransitionDividendStatus('PAYMENT_SCHEDULED', 'PAID'), true)
  })

  it('supports send-back to CHANGES_REQUESTED from PENDING_APPROVAL', () => {
    assert.equal(canTransitionDividendStatus('PENDING_APPROVAL', 'CHANGES_REQUESTED'), true)
  })

  it('supports outright rejection from PENDING_APPROVAL', () => {
    assert.equal(canTransitionDividendStatus('PENDING_APPROVAL', 'REJECTED'), true)
  })

  it('CHANGES_REQUESTED bounces back to draft or directly to a fresh review', () => {
    assert.equal(canTransitionDividendStatus('CHANGES_REQUESTED', 'DRAFT'), true)
    assert.equal(canTransitionDividendStatus('CHANGES_REQUESTED', 'PENDING_APPROVAL'), true)
    assert.equal(canTransitionDividendStatus('CHANGES_REQUESTED', 'CANCELLED'), true)
  })

  it('REJECTED is hard — only legal exit is CANCELLED', () => {
    assert.equal(canTransitionDividendStatus('REJECTED', 'DRAFT'), false)
    assert.equal(canTransitionDividendStatus('REJECTED', 'PENDING_APPROVAL'), false)
    assert.equal(canTransitionDividendStatus('REJECTED', 'CANCELLED'), true)
  })

  it('allows cancellation from any non-terminal state', () => {
    const nonTerminal: DividendStatus[] = [
      'DRAFT',
      'PENDING_APPROVAL',
      'APPROVED',
      'ELIGIBILITY_LOCKED',
      'CALCULATED',
      'PAYMENT_SCHEDULED',
      'PARTIALLY_PAID',
    ]
    for (const state of nonTerminal) {
      assert.equal(canTransitionDividendStatus(state, 'CANCELLED'), true, state)
    }
  })

  it('forbids transitions from terminal states', () => {
    const terminal: DividendStatus[] = ['ARCHIVED', 'CANCELLED']
    for (const state of terminal) {
      assert.equal(isTerminalDividendStatus(state), true, state)
      assert.equal(canTransitionDividendStatus(state, 'APPROVED'), false, state)
    }
  })

  it('allows PAID and RECONCILED to advance to ARCHIVED but blocks reverse', () => {
    assert.equal(canTransitionDividendStatus('PAID', 'ARCHIVED'), true)
    assert.equal(canTransitionDividendStatus('PAID', 'RECONCILED'), true)
    assert.equal(canTransitionDividendStatus('RECONCILED', 'ARCHIVED'), true)
    assert.equal(canTransitionDividendStatus('ARCHIVED', 'PAID'), false)
    assert.equal(canTransitionDividendStatus('ARCHIVED', 'RECONCILED'), false)
  })

  it('forbids illegal shortcuts — cannot calculate before approval, cannot pay before calculation', () => {
    assert.equal(canTransitionDividendStatus('DRAFT', 'APPROVED'), false)
    assert.equal(canTransitionDividendStatus('DRAFT', 'CALCULATED'), false)
    assert.equal(canTransitionDividendStatus('PENDING_APPROVAL', 'ELIGIBILITY_LOCKED'), false)
    assert.equal(canTransitionDividendStatus('APPROVED', 'CALCULATED'), false)
    assert.equal(canTransitionDividendStatus('ELIGIBILITY_LOCKED', 'PAYMENT_SCHEDULED'), false)
    assert.equal(canTransitionDividendStatus('CALCULATED', 'PAID'), false)
  })

  it('assertDividendTransition throws on invalid moves with a descriptive message', () => {
    assert.throws(() => assertDividendTransition('DRAFT', 'PAID'), /Invalid dividend status transition: DRAFT → PAID/)
    assert.throws(() => assertDividendTransition('ARCHIVED', 'PAID'), /Allowed from ARCHIVED: \(none — terminal\)/)
    assert.throws(() => assertDividendTransition('PAID', 'CANCELLED'), /Allowed from PAID: RECONCILED, ARCHIVED/)
  })

  it('predicates report the lifecycle progression correctly', () => {
    assert.equal(isApprovedOrLater('DRAFT'), false)
    assert.equal(isApprovedOrLater('PENDING_APPROVAL'), false)
    assert.equal(isApprovedOrLater('APPROVED'), true)
    assert.equal(isApprovedOrLater('PAID'), true)

    assert.equal(isEligibilityLockedOrLater('APPROVED'), false)
    assert.equal(isEligibilityLockedOrLater('ELIGIBILITY_LOCKED'), true)
    assert.equal(isEligibilityLockedOrLater('CALCULATED'), true)

    assert.equal(isCalculatedOrLater('ELIGIBILITY_LOCKED'), false)
    assert.equal(isCalculatedOrLater('CALCULATED'), true)
    assert.equal(isCalculatedOrLater('PAYMENT_SCHEDULED'), true)
  })

  it('accepts legacy DECLARED / SNAPSHOTTED statuses as equivalent waypoints', () => {
    assert.equal(isApprovedOrLater('DECLARED'), true)
    assert.equal(isEligibilityLockedOrLater('SNAPSHOTTED'), true)
    assert.equal(canTransitionDividendStatus('DECLARED', 'ELIGIBILITY_LOCKED'), true)
    assert.equal(canTransitionDividendStatus('SNAPSHOTTED', 'PAID'), true)
  })

  it('canCancelDividend gates ordinary cancellation up to CALCULATED', () => {
    const allowed: DividendStatus[] = [
      'DRAFT',
      'PENDING_APPROVAL',
      'CHANGES_REQUESTED',
      'APPROVED',
      'ELIGIBILITY_LOCKED',
      'CALCULATED',
      'REJECTED',
    ]
    for (const state of allowed) {
      assert.equal(canCancelDividend(state), true, `${state} cancellable`)
      assert.equal(canForceCancelDividend(state), false, `${state} not force-only`)
    }
  })

  it('canForceCancelDividend covers payment-processing states only', () => {
    assert.equal(canCancelDividend('PAYMENT_SCHEDULED'), false)
    assert.equal(canForceCancelDividend('PAYMENT_SCHEDULED'), true)
    assert.equal(canCancelDividend('PARTIALLY_PAID'), false)
    assert.equal(canForceCancelDividend('PARTIALLY_PAID'), true)
    assert.equal(canForceCancelDividend('PAID'), false)
    assert.equal(canForceCancelDividend('CANCELLED'), false)
  })

  it('allowedActionsFor surfaces the right buttons for each lifecycle state', () => {
    assert.deepEqual(allowedActionsFor('DRAFT'), ['edit', 'submitForApproval', 'cancel'])
    assert.deepEqual(allowedActionsFor('PENDING_APPROVAL'), ['approve', 'reject', 'requestChanges', 'cancel'])
    assert.deepEqual(allowedActionsFor('CHANGES_REQUESTED'), ['edit', 'submitForApproval', 'cancel'])
    assert.deepEqual(allowedActionsFor('APPROVED'), ['lockEligibility', 'cancel'])
    assert.deepEqual(allowedActionsFor('ELIGIBILITY_LOCKED'), ['calculate', 'cancel'])
    assert.deepEqual(allowedActionsFor('CALCULATED'), ['createBatch', 'generateStatements', 'cancel'])
    assert.deepEqual(allowedActionsFor('PAYMENT_SCHEDULED'), ['recordPayment', 'createBatch', 'forceCancel'])
    assert.deepEqual(allowedActionsFor('PARTIALLY_PAID'), ['recordPayment', 'forceCancel'])
    assert.deepEqual(allowedActionsFor('PAID'), ['archive'])
    assert.deepEqual(allowedActionsFor('RECONCILED'), ['archive'])
    assert.deepEqual(allowedActionsFor('ARCHIVED'), [])
    assert.deepEqual(allowedActionsFor('CANCELLED'), [])
    assert.deepEqual(allowedActionsFor('REJECTED'), ['cancel'])
  })
})
