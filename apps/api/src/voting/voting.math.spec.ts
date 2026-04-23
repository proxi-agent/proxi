import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { tallyVotes } from './voting.math.js'

describe('voting math', () => {
  it('passes a proposal when quorum and approval are met', () => {
    const tally = tallyVotes({
      proposalId: 'p1',
      quorumPct: 40,
      requiredPct: 50,
      totalEligibleShares: 1000,
      votes: [
        { choice: 'FOR', sharesCast: 300 },
        { choice: 'AGAINST', sharesCast: 150 },
        { choice: 'ABSTAIN', sharesCast: 50 },
      ],
    })
    assert.equal(tally.quorumMet, true)
    assert.equal(tally.passed, true)
    assert.equal(tally.for, 300)
    assert.equal(tally.against, 150)
    assert.equal(tally.abstain, 50)
    assert.equal(tally.approvalPct, 66.67)
  })

  it('fails when quorum is not met', () => {
    const tally = tallyVotes({
      proposalId: 'p2',
      quorumPct: 50,
      requiredPct: 50,
      totalEligibleShares: 1000,
      votes: [
        { choice: 'FOR', sharesCast: 200 },
        { choice: 'AGAINST', sharesCast: 100 },
      ],
    })
    assert.equal(tally.quorumMet, false)
    assert.equal(tally.passed, false)
  })

  it('fails when approval percentage below threshold', () => {
    const tally = tallyVotes({
      proposalId: 'p3',
      quorumPct: 10,
      requiredPct: 66,
      totalEligibleShares: 1000,
      votes: [
        { choice: 'FOR', sharesCast: 400 },
        { choice: 'AGAINST', sharesCast: 400 },
      ],
    })
    assert.equal(tally.quorumMet, true)
    assert.equal(tally.passed, false)
    assert.equal(tally.approvalPct, 50)
  })

  it('handles zero votes safely', () => {
    const tally = tallyVotes({
      proposalId: 'p4',
      quorumPct: 50,
      requiredPct: 50,
      totalEligibleShares: 1000,
      votes: [],
    })
    assert.equal(tally.passed, false)
    assert.equal(tally.approvalPct, 0)
    assert.equal(tally.totalCastShares, 0)
  })
})
