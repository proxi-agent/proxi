import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildAnomalyInsight } from './anomaly.js'

describe('anomaly insight builder', () => {
  it('reports a clean state when no anomalies present', () => {
    const insight = buildAnomalyInsight({
      highSeverityAudits24h: 0,
      kycPendingWithHoldings: 0,
      meetingsBelowQuorum: [],
      negativeBalanceAttempts: 0,
      overdueDividendSnapshots: [],
      overdueUnassignedCriticalTasks: 0,
      staleTransfers: [],
      unpaidPastPayment: [],
    })
    assert.equal(insight.signals.length, 0)
    assert.match(insight.headline, /no anomalies/i)
  })

  it('flags critical anomalies with severity CRITICAL', () => {
    const insight = buildAnomalyInsight({
      highSeverityAudits24h: 0,
      kycPendingWithHoldings: 0,
      meetingsBelowQuorum: [],
      negativeBalanceAttempts: 0,
      overdueDividendSnapshots: [{ dividendId: 'div-1', recordDate: '2026-04-01' }],
      overdueUnassignedCriticalTasks: 2,
      staleTransfers: [],
      unpaidPastPayment: [{ dividendId: 'div-2', paymentDate: '2026-04-10', pendingCount: 5 }],
    })
    const critical = insight.signals.filter(signal => signal.severity === 'CRITICAL')
    assert.equal(critical.length, 3)
    assert.ok(insight.headline.includes('3 critical'))
  })

  it('renders each signal in the summary', () => {
    const insight = buildAnomalyInsight({
      highSeverityAudits24h: 12,
      kycPendingWithHoldings: 4,
      meetingsBelowQuorum: [],
      negativeBalanceAttempts: 0,
      overdueDividendSnapshots: [],
      overdueUnassignedCriticalTasks: 0,
      staleTransfers: [{ ageHours: 100, caseId: 5, lifecycleStage: 'REVIEW_PENDING', status: 'IN_REVIEW' }],
      unpaidPastPayment: [],
    })
    assert.match(insight.summary, /stale pending transfer/i)
    assert.match(insight.summary, /audit events/i)
  })
})
