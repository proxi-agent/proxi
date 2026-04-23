import type { OperationalSummary } from '../../reporting/reporting.service.js'
import type { Insight, InsightAction, InsightSignal } from '../insights.types.js'

export interface OperationalCopilotInputs {
  summary: OperationalSummary
  staleTransferCount: number
  overdueDividendSnapshots: number
  unpaidEntitlementsPastPayment: number
  meetingsBelowQuorum: number
  overdueUnassignedCriticalTasks: number
}

export function buildOperationalCopilotInsight(inputs: OperationalCopilotInputs): Insight {
  const signals: InsightSignal[] = []
  const actions: InsightAction[] = []
  const { meetingsBelowQuorum, overdueDividendSnapshots, overdueUnassignedCriticalTasks, staleTransferCount, summary, unpaidEntitlementsPastPayment } = inputs

  if (summary.tasks.overdue > 0) {
    signals.push({
      code: 'OVERDUE_TASKS',
      label: `${summary.tasks.overdue} overdue task${summary.tasks.overdue === 1 ? '' : 's'}`,
      severity: summary.tasks.overdue > 5 ? 'CRITICAL' : 'WARN',
    })
    actions.push({ action: 'VIEW_OVERDUE_TASKS', label: 'Review overdue tasks', url: '/tasks?overdue=1' })
  }

  if (staleTransferCount > 0) {
    signals.push({
      code: 'STALE_TRANSFERS',
      label: `${staleTransferCount} transfer${staleTransferCount === 1 ? '' : 's'} stalled > 72h`,
      severity: 'WARN',
    })
    actions.push({ action: 'VIEW_STALE_TRANSFERS', label: 'Triage stalled transfers', url: '/transfers?stalled=1' })
  }

  if (overdueDividendSnapshots > 0) {
    signals.push({
      code: 'DIVIDEND_SNAPSHOT_OVERDUE',
      label: `${overdueDividendSnapshots} dividend${overdueDividendSnapshots === 1 ? '' : 's'} need record-date snapshot`,
      severity: 'CRITICAL',
    })
  }

  if (unpaidEntitlementsPastPayment > 0) {
    signals.push({
      code: 'PAYMENT_BACKLOG',
      label: `${unpaidEntitlementsPastPayment} dividend payment${unpaidEntitlementsPastPayment === 1 ? '' : 's'} past due`,
      severity: 'CRITICAL',
    })
  }

  if (meetingsBelowQuorum > 0) {
    signals.push({
      code: 'MEETING_QUORUM_AT_RISK',
      label: `${meetingsBelowQuorum} closed meeting${meetingsBelowQuorum === 1 ? '' : 's'} finished below quorum`,
      severity: 'WARN',
    })
  }

  if (overdueUnassignedCriticalTasks > 0) {
    signals.push({
      code: 'UNASSIGNED_CRITICAL',
      label: `${overdueUnassignedCriticalTasks} critical task${overdueUnassignedCriticalTasks === 1 ? '' : 's'} overdue and unassigned`,
      severity: 'CRITICAL',
    })
  }

  if (summary.voting.openMeetings > 0) {
    signals.push({
      code: 'OPEN_VOTING',
      label: `${summary.voting.openMeetings} meeting${summary.voting.openMeetings === 1 ? '' : 's'} open for voting`,
      severity: 'INFO',
    })
  }

  if (summary.transfers.pending > 0) {
    signals.push({
      code: 'PENDING_TRANSFERS',
      label: `${summary.transfers.pending} pending transfer${summary.transfers.pending === 1 ? '' : 's'}`,
      severity: summary.transfers.pending > 20 ? 'WARN' : 'INFO',
    })
  }

  const criticalCount = signals.filter(signal => signal.severity === 'CRITICAL').length
  const warnCount = signals.filter(signal => signal.severity === 'WARN').length

  const headline =
    criticalCount > 0
      ? `${criticalCount} critical operational item${criticalCount === 1 ? '' : 's'} need attention today.`
      : warnCount > 0
        ? `${warnCount} item${warnCount === 1 ? '' : 's'} to review today.`
        : 'Operations are steady – no critical blockers detected.'

  const summaryText = [
    `${summary.issuers.active} active issuers, ${summary.shareholders.total.toLocaleString()} shareholders.`,
    `${summary.transfers.pending} pending / ${summary.transfers.settled} settled transfers.`,
    `${summary.dividends.declared} declared dividends, ${summary.dividends.paid} paid.`,
    `${summary.voting.openMeetings} open meetings, ${summary.voting.upcomingMeetings} upcoming.`,
    `${summary.tasks.open} open tasks (${summary.tasks.overdue} overdue).`,
    `${summary.ledgerEvents.last24h} ledger events in last 24h.`,
  ].join(' ')

  return {
    data: {
      criticalCount,
      summary,
      warnCount,
    },
    generatedAt: new Date(),
    generator: 'HEURISTIC',
    headline,
    kind: 'OPERATIONAL_COPILOT',
    recommendedActions: actions,
    references: [],
    signals,
    subject: { id: 'global', label: 'Operations', type: 'OPERATIONS' },
    summary: summaryText,
  }
}
