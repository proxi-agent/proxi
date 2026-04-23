import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Case } from '../../cases/cases.service.js'

import { buildTransferInsight } from './transfer-insight.js'

function makeCase(overrides: Partial<Case>): Case {
  return {
    approvals: [],
    canonicalTransferData: {},
    createdAt: new Date(),
    documents: [],
    events: [],
    evidenceRequired: [],
    evidenceSubmitted: [],
    extractions: [],
    id: 1,
    intakeMethod: 'GUIDED_ENTRY',
    lifecycleStage: 'DRAFT',
    missingEvidence: [],
    quantity: 100,
    restrictionBlockingReasons: [],
    restrictionChecks: [],
    restrictionContext: {},
    securityId: 'sec-1',
    status: 'PENDING',
    type: 'TRANSFER',
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('transfer insight builder', () => {
  it('marks blocked transfers with CRITICAL severity', () => {
    const insight = buildTransferInsight(
      makeCase({ restrictionBlockingReasons: ['TAX_ID_MISMATCH'] }),
    )
    assert.equal(insight.signals[0].severity, 'CRITICAL')
    assert.match(insight.headline, /blocked/i)
  })

  it('reports missing evidence as a WARN signal with list of documents', () => {
    const insight = buildTransferInsight(
      makeCase({ missingEvidence: ['MEDALLION', 'W9'] }),
    )
    const evidence = insight.signals.find(signal => signal.code === 'EVIDENCE_MISSING')
    assert.ok(evidence)
    assert.equal(evidence?.severity, 'WARN')
    assert.match(evidence?.detail || '', /MEDALLION/)
  })

  it('reports success when transfer is completed', () => {
    const insight = buildTransferInsight(
      makeCase({ ledgerEventId: 7, lifecycleStage: 'COMPLETED', status: 'COMPLETED' }),
    )
    assert.equal(insight.signals[0].severity, 'SUCCESS')
    assert.match(insight.headline, /settled successfully/i)
  })
})
