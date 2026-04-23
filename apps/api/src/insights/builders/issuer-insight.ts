import type { Issuer } from '../../issuers/issuers.types.js'
import type { IssuerSummary } from '../../reporting/reporting.service.js'
import type { Insight, InsightAction, InsightSignal } from '../insights.types.js'

export interface IssuerInsightInputs {
  issuer: Issuer
  summary: IssuerSummary
  recentAuditCount24h: number
  openExceptionCases: number
  overdueTasks: number
  draftDividends: number
  declaredDividends: number
  openMeetings: number
}

export function buildIssuerInsight(input: IssuerInsightInputs): Insight {
  const signals: InsightSignal[] = []
  const actions: InsightAction[] = []

  if (input.issuer.status !== 'ACTIVE') {
    signals.push({
      code: 'ISSUER_INACTIVE',
      label: `Issuer is ${input.issuer.status}`,
      severity: 'WARN',
    })
  }

  if (input.summary.pendingTransfers > 0) {
    signals.push({
      code: 'PENDING_TRANSFERS',
      label: `${input.summary.pendingTransfers} pending transfer${input.summary.pendingTransfers === 1 ? '' : 's'}`,
      severity: input.summary.pendingTransfers > 10 ? 'WARN' : 'INFO',
    })
    actions.push({
      action: 'VIEW_TRANSFERS',
      label: 'View pending transfers',
      url: `/transfers?issuerId=${input.issuer.id}&state=IN_REVIEW`,
    })
  }

  if (input.openExceptionCases > 0) {
    signals.push({
      code: 'EXCEPTIONS',
      label: `${input.openExceptionCases} case${input.openExceptionCases === 1 ? '' : 's'} in exception`,
      severity: 'CRITICAL',
    })
  }

  if (input.overdueTasks > 0) {
    signals.push({
      code: 'OVERDUE_TASKS',
      label: `${input.overdueTasks} overdue task${input.overdueTasks === 1 ? '' : 's'}`,
      severity: 'WARN',
    })
    actions.push({
      action: 'VIEW_TASKS',
      label: 'View overdue tasks',
      url: `/tasks?issuerId=${input.issuer.id}&overdue=1`,
    })
  }

  if (input.summary.upcomingMeetings > 0) {
    signals.push({
      code: 'UPCOMING_MEETINGS',
      label: `${input.summary.upcomingMeetings} upcoming meeting${input.summary.upcomingMeetings === 1 ? '' : 's'}`,
      severity: 'INFO',
    })
  }

  if (input.declaredDividends > 0) {
    signals.push({
      code: 'DECLARED_DIVIDENDS',
      label: `${input.declaredDividends} declared dividend${input.declaredDividends === 1 ? '' : 's'} awaiting snapshot or payment`,
      severity: 'INFO',
    })
  }

  const summary = [
    `${input.issuer.name} (${input.issuer.jurisdiction || 'unknown jurisdiction'}) – ${input.issuer.status}.`,
    `${input.summary.securities} securit${input.summary.securities === 1 ? 'y' : 'ies'}, ${input.summary.shareholders.toLocaleString()} shareholders, ${input.summary.outstandingShares.toLocaleString()} shares outstanding.`,
    `${input.summary.pendingTransfers} pending transfers, ${input.summary.openTasks} open tasks, ${input.summary.upcomingMeetings} upcoming meetings.`,
    `Last 24h: ${input.recentAuditCount24h} audit event${input.recentAuditCount24h === 1 ? '' : 's'} recorded.`,
  ].join(' ')

  const headline = signals.some(signal => signal.severity === 'CRITICAL')
    ? `${input.issuer.name}: attention needed.`
    : `${input.issuer.name}: ${input.summary.pendingTransfers} pending transfers, ${input.summary.openTasks} open tasks.`

  return {
    data: {
      counts: input.summary,
      status: input.issuer.status,
    },
    generatedAt: new Date(),
    generator: 'HEURISTIC',
    headline,
    kind: 'ISSUER_SUMMARY',
    recommendedActions: actions,
    references: [{ id: input.issuer.id, kind: 'ISSUER', label: input.issuer.name }],
    signals,
    subject: { id: input.issuer.id, label: input.issuer.name, type: 'ISSUER' },
    summary,
  }
}
