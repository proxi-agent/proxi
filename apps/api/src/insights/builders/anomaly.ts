import type { Insight, InsightSignal } from '../insights.types.js'

export interface AnomalyInputs {
  /** Transfers with ageHours > threshold and still pending. */
  staleTransfers: Array<{ caseId: number; ageHours: number; status: string; lifecycleStage: string }>
  /** Declared dividends whose record date has passed without snapshot. */
  overdueDividendSnapshots: Array<{ dividendId: string; recordDate: string }>
  /** Dividends snapshotted with pending entitlements past payment date. */
  unpaidPastPayment: Array<{ dividendId: string; paymentDate: string; pendingCount: number }>
  /** Meetings with < quorum by status=CLOSED. */
  meetingsBelowQuorum: Array<{ meetingId: string; quorumPct: number; turnoutPct: number }>
  /** Ledger postings in the last 24h flagged severity >= HIGH. */
  highSeverityAudits24h: number
  /** Shareholders with pending KYC but active holdings. */
  kycPendingWithHoldings: number
  /** Tasks overdue and unassigned at CRITICAL/HIGH priority. */
  overdueUnassignedCriticalTasks: number
  /** Negative/zero holdings that received a transfer_out attempt. (heuristic from ledger) */
  negativeBalanceAttempts: number
}

export function buildAnomalyInsight(inputs: AnomalyInputs): Insight {
  const signals: InsightSignal[] = []

  if (inputs.staleTransfers.length > 0) {
    signals.push({
      code: 'STALE_TRANSFERS',
      detail: inputs.staleTransfers
        .slice(0, 5)
        .map(t => `Case #${t.caseId} (${t.lifecycleStage}, ${Math.round(t.ageHours)}h)`)
        .join(', '),
      label: `${inputs.staleTransfers.length} stale pending transfer${inputs.staleTransfers.length === 1 ? '' : 's'}`,
      metadata: { transfers: inputs.staleTransfers },
      severity: 'WARN',
    })
  }

  if (inputs.overdueDividendSnapshots.length > 0) {
    signals.push({
      code: 'DIVIDEND_SNAPSHOT_OVERDUE',
      detail: inputs.overdueDividendSnapshots.map(d => `${d.dividendId} (record ${d.recordDate})`).join(', '),
      label: `${inputs.overdueDividendSnapshots.length} dividend${inputs.overdueDividendSnapshots.length === 1 ? '' : 's'} past record date without snapshot`,
      severity: 'CRITICAL',
    })
  }

  if (inputs.unpaidPastPayment.length > 0) {
    const totalPending = inputs.unpaidPastPayment.reduce((acc, d) => acc + d.pendingCount, 0)
    signals.push({
      code: 'PAYMENT_OVERDUE',
      detail: inputs.unpaidPastPayment.map(d => `${d.dividendId} – ${d.pendingCount} pending (payment ${d.paymentDate})`).join(', '),
      label: `${totalPending} entitlement${totalPending === 1 ? '' : 's'} unpaid past payment date`,
      severity: 'CRITICAL',
    })
  }

  if (inputs.meetingsBelowQuorum.length > 0) {
    signals.push({
      code: 'BELOW_QUORUM',
      detail: inputs.meetingsBelowQuorum
        .map(m => `${m.meetingId}: ${m.turnoutPct.toFixed(1)}% vs ${m.quorumPct}% required`)
        .join('; '),
      label: `${inputs.meetingsBelowQuorum.length} closed meeting${inputs.meetingsBelowQuorum.length === 1 ? '' : 's'} below quorum`,
      severity: 'WARN',
    })
  }

  if (inputs.highSeverityAudits24h >= 5) {
    signals.push({
      code: 'AUDIT_SPIKE',
      label: `${inputs.highSeverityAudits24h} high-severity audit events in last 24h`,
      severity: 'WARN',
    })
  }

  if (inputs.kycPendingWithHoldings > 0) {
    signals.push({
      code: 'KYC_HOLDING_MISMATCH',
      label: `${inputs.kycPendingWithHoldings} shareholder${inputs.kycPendingWithHoldings === 1 ? '' : 's'} with pending KYC but active holdings`,
      severity: 'WARN',
    })
  }

  if (inputs.overdueUnassignedCriticalTasks > 0) {
    signals.push({
      code: 'UNASSIGNED_CRITICAL_TASKS',
      label: `${inputs.overdueUnassignedCriticalTasks} overdue critical/high task${inputs.overdueUnassignedCriticalTasks === 1 ? '' : 's'} without an assignee`,
      severity: 'CRITICAL',
    })
  }

  if (inputs.negativeBalanceAttempts > 0) {
    signals.push({
      code: 'BALANCE_INTEGRITY',
      label: `${inputs.negativeBalanceAttempts} recent ledger attempt${inputs.negativeBalanceAttempts === 1 ? '' : 's'} against insufficient balance`,
      severity: 'CRITICAL',
    })
  }

  const critical = signals.filter(signal => signal.severity === 'CRITICAL').length
  const warn = signals.filter(signal => signal.severity === 'WARN').length
  const headline =
    signals.length === 0
      ? 'No anomalies detected across transfers, dividends, voting, or audit streams.'
      : `${critical} critical and ${warn} warning signal${critical + warn === 1 ? '' : 's'} detected.`

  const summary =
    signals.length === 0
      ? 'Automated heuristics found no operational anomalies in the current data set.'
      : signals.map(signal => `• [${signal.severity}] ${signal.label}${signal.detail ? ` — ${signal.detail}` : ''}`).join('\n')

  return {
    data: inputs as unknown as Record<string, unknown>,
    generatedAt: new Date(),
    generator: 'HEURISTIC',
    headline,
    kind: 'ANOMALY_FLAGS',
    recommendedActions: [],
    references: [],
    signals,
    subject: { id: 'global', label: 'Operational anomalies', type: 'OPERATIONS' },
    summary,
  }
}
