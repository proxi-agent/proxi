import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { canTransition } from './tasks.types.js'

describe('task state machine', () => {
  it('allows OPEN -> IN_REVIEW -> RESOLVED', () => {
    assert.equal(canTransition('OPEN', 'IN_REVIEW'), true)
    assert.equal(canTransition('IN_REVIEW', 'RESOLVED'), true)
  })

  it('prevents transitions out of terminal states', () => {
    assert.equal(canTransition('RESOLVED', 'OPEN'), false)
    assert.equal(canTransition('CANCELLED', 'OPEN'), false)
  })

  it('allows cancelling from any non-terminal state', () => {
    assert.equal(canTransition('OPEN', 'CANCELLED'), true)
    assert.equal(canTransition('IN_REVIEW', 'CANCELLED'), true)
    assert.equal(canTransition('BLOCKED', 'CANCELLED'), true)
  })

  it('supports blocking and unblocking', () => {
    assert.equal(canTransition('OPEN', 'BLOCKED'), true)
    assert.equal(canTransition('BLOCKED', 'IN_REVIEW'), true)
    assert.equal(canTransition('BLOCKED', 'OPEN'), true)
  })
})
