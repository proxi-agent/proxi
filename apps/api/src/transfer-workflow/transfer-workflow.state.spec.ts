import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { TransferState } from '@prisma/client'

import {
  assertTransferTransition,
  canTransitionTransferState,
  isTerminalTransferState,
  lifecycleStageFor,
} from './transfer-workflow.state.js'

describe('transfer state machine', () => {
  it('allows happy-path progression', () => {
    const path: Array<[TransferState, TransferState]> = [
      [TransferState.DRAFT, TransferState.SUBMITTED],
      [TransferState.SUBMITTED, TransferState.UNDER_REVIEW],
      [TransferState.UNDER_REVIEW, TransferState.APPROVED],
      [TransferState.APPROVED, TransferState.SETTLED],
    ]
    for (const [from, to] of path) {
      assert.equal(canTransitionTransferState(from, to), true, `${from} → ${to}`)
    }
  })

  it('supports info-request round trip', () => {
    assert.equal(canTransitionTransferState(TransferState.UNDER_REVIEW, TransferState.NEEDS_INFO), true)
    assert.equal(canTransitionTransferState(TransferState.NEEDS_INFO, TransferState.UNDER_REVIEW), true)
  })

  it('allows cancellation from any non-terminal state', () => {
    const nonTerminal: TransferState[] = [
      TransferState.DRAFT,
      TransferState.SUBMITTED,
      TransferState.UNDER_REVIEW,
      TransferState.NEEDS_INFO,
      TransferState.APPROVED,
    ]
    for (const state of nonTerminal) {
      assert.equal(canTransitionTransferState(state, TransferState.CANCELLED), true, state)
    }
  })

  it('forbids transitions from terminal states', () => {
    const terminal: TransferState[] = [TransferState.SETTLED, TransferState.REJECTED, TransferState.CANCELLED]
    for (const state of terminal) {
      assert.equal(isTerminalTransferState(state), true, state)
      assert.equal(canTransitionTransferState(state, TransferState.UNDER_REVIEW), false, state)
      assert.equal(canTransitionTransferState(state, TransferState.APPROVED), false, state)
    }
  })

  it('forbids skipping review', () => {
    assert.equal(canTransitionTransferState(TransferState.SUBMITTED, TransferState.APPROVED), false)
    assert.equal(canTransitionTransferState(TransferState.SUBMITTED, TransferState.SETTLED), false)
    assert.equal(canTransitionTransferState(TransferState.UNDER_REVIEW, TransferState.SETTLED), false)
  })

  it('assertTransferTransition throws on invalid moves', () => {
    assert.throws(() => assertTransferTransition(TransferState.DRAFT, TransferState.SETTLED), /Invalid transfer state transition/)
    assert.throws(() => assertTransferTransition(TransferState.SETTLED, TransferState.CANCELLED), /Invalid transfer state transition/)
  })

  it('maps every state to a coarse lifecycle stage', () => {
    for (const state of Object.values(TransferState)) {
      assert.ok(lifecycleStageFor(state), `missing lifecycle stage for ${state}`)
    }
  })
})
