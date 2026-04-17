import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { RulesService } from './rules.service.js'

class MockLedgerService {
  async getPositions() {
    return [{ holderId: 'ALPHA_CAPITAL', quantity: 1000, securityId: 'PROXI-CLASS-A' }]
  }
}

describe('RulesService transfer eligibility', () => {
  it('returns machine-readable blocking codes', async () => {
    const rules = new RulesService(new MockLedgerService() as never)
    const evaluation = await rules.evaluateTransferEligibility({
      fromHolderId: 'ALPHA_CAPITAL',
      quantity: 2500,
      securityId: 'PROXI-CLASS-A',
      toHolderId: 'AURORA_FUND',
      type: 'TRANSFER',
    })

    assert.equal(evaluation.eligible, false)
    assert.ok(evaluation.blockingCodes.includes('OWNERSHIP_INSUFFICIENT'))
  })
})
