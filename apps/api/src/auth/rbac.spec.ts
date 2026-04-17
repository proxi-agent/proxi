import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { hasPermission } from './rbac.js'

describe('RBAC permissions for transfer workflow', () => {
  it('prevents shareholders from approving transfers', () => {
    assert.equal(hasPermission('shareholder', 'transfer.approve'), false)
    assert.equal(hasPermission('shareholder', 'ledger.post'), false)
  })

  it('allows reviewers to approve but not post directly', () => {
    assert.equal(hasPermission('agent_reviewer', 'transfer.approve'), true)
    assert.equal(hasPermission('agent_reviewer', 'ledger.post'), false)
  })

  it('allows processors to run AI processing', () => {
    assert.equal(hasPermission('agent_processor', 'transfer.ai.process'), true)
  })
})
