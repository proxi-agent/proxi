import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { hasPermission, normalizeRole } from './rbac.js'

describe('RBAC permissions for transfer workflow', () => {
  it('allows transfer-agent admins to access operational endpoints', () => {
    assert.equal(hasPermission('transfer_agent_admin', 'agent.admin'), true)
    assert.equal(hasPermission('transfer_agent_admin', 'transfer.approve'), true)
  })

  it('prevents shareholders from approving transfers', () => {
    assert.equal(hasPermission('shareholder', 'transfer.approve'), false)
    assert.equal(hasPermission('shareholder', 'ledger.post'), false)
  })

  it('allows issuer operators to review but not post direct ledger adjustments', () => {
    assert.equal(hasPermission('issuer_operator', 'transfer.review'), true)
    assert.equal(hasPermission('issuer_operator', 'ledger.adjust'), false)
  })

  it('allows reviewers to approve but not post directly', () => {
    assert.equal(hasPermission('agent_reviewer', 'transfer.approve'), true)
    assert.equal(hasPermission('agent_reviewer', 'ledger.post'), false)
  })

  it('allows processors to run AI processing', () => {
    assert.equal(hasPermission('agent_processor', 'transfer.ai.process'), true)
  })

  it('supports multi-role permission evaluation', () => {
    assert.equal(hasPermission(['issuer_operator', 'shareholder'], 'transfer.review'), true)
    assert.equal(hasPermission(['issuer_operator', 'shareholder'], 'ledger.adjust'), false)
  })

  it('normalizes role aliases from identity providers', () => {
    assert.equal(normalizeRole('ADMIN'), 'transfer_agent_admin')
    assert.equal(normalizeRole('investor'), 'shareholder')
    assert.equal(normalizeRole('unknown-role'), null)
  })
})
