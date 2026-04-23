import type { DividendEvent } from '../../dividends/dividends.types.js'
import type { Insight, InsightAction, InsightSignal } from '../insights.types.js'

export interface DividendReadinessInputs {
  event: DividendEvent
  /** # of holders with positive balance as-of record date. */
  eligibleHolderCount: number
  /** # of those holders we have onboarded shareholder_accounts for. */
  linkedAccountCount: number
  /** # of entitlements in each status (populated after snapshot). */
  entitlementCounts: { paid: number; pending: number; total: number; voided: number }
  /** Sum of positions at record date, used to sanity-check distribution size. */
  totalSharesAtRecordDate: number
  /** Outstanding shares recorded for the security. */
  outstandingShares: number
}

const DAY_MS = 86_400_000

export function buildDividendReadinessInsight(input: DividendReadinessInputs): Insight {
  const { entitlementCounts, eligibleHolderCount, event, linkedAccountCount, outstandingShares, totalSharesAtRecordDate } = input
  const signals: InsightSignal[] = []
  const actions: InsightAction[] = []

  const recordDate = new Date(event.recordDate)
  const paymentDate = new Date(event.paymentDate)
  const declarationDate = new Date(event.declarationDate)
  const now = new Date()

  if (declarationDate > recordDate || recordDate > paymentDate) {
    signals.push({
      code: 'DATE_ORDER_INVALID',
      detail: `declaration ${event.declarationDate} / record ${event.recordDate} / payment ${event.paymentDate}`,
      label: 'Date ordering invalid',
      severity: 'CRITICAL',
    })
  }

  if (event.status === 'DRAFT' && recordDate.getTime() <= now.getTime()) {
    signals.push({
      code: 'RECORD_DATE_PAST_DRAFT',
      label: 'Record date reached but dividend still in DRAFT',
      severity: 'WARN',
    })
    actions.push({ action: 'DECLARE_DIVIDEND', label: 'Declare dividend', params: { id: event.id } })
  }

  if (event.status === 'DECLARED') {
    const daysToRecord = Math.ceil((recordDate.getTime() - now.getTime()) / DAY_MS)
    if (daysToRecord <= 0) {
      signals.push({
        code: 'READY_TO_SNAPSHOT',
        detail: `Record date ${event.recordDate} reached.`,
        label: 'Ready to take record-date snapshot',
        severity: 'INFO',
      })
      actions.push({ action: 'SNAPSHOT_DIVIDEND', label: 'Snapshot entitlements', params: { id: event.id } })
    } else {
      signals.push({
        code: 'AWAITING_RECORD_DATE',
        label: `Snapshot in ${daysToRecord} day${daysToRecord === 1 ? '' : 's'}`,
        severity: 'INFO',
      })
    }
  }

  if (eligibleHolderCount > 0 && linkedAccountCount < eligibleHolderCount) {
    const unlinked = eligibleHolderCount - linkedAccountCount
    signals.push({
      code: 'UNLINKED_HOLDERS',
      detail: `${unlinked} holder${unlinked === 1 ? '' : 's'} have ledger positions but no shareholder account record; entitlement snapshot will skip them.`,
      label: `${unlinked} holders without shareholder accounts`,
      severity: 'WARN',
    })
    actions.push({ action: 'RECONCILE_HOLDERS', label: 'Reconcile ledger holders to shareholder accounts' })
  }

  if (outstandingShares > 0 && totalSharesAtRecordDate > outstandingShares) {
    signals.push({
      code: 'OVER_ISSUANCE',
      detail: `${totalSharesAtRecordDate.toLocaleString()} shares in holdings vs ${outstandingShares.toLocaleString()} authorized outstanding.`,
      label: 'Holdings exceed outstanding shares',
      severity: 'CRITICAL',
    })
  }

  if (event.status === 'SNAPSHOTTED') {
    if (entitlementCounts.total === 0) {
      signals.push({
        code: 'EMPTY_SNAPSHOT',
        label: 'Snapshot produced zero entitlements',
        severity: 'CRITICAL',
      })
    }
    if (entitlementCounts.pending > 0) {
      const daysToPayment = Math.ceil((paymentDate.getTime() - now.getTime()) / DAY_MS)
      signals.push({
        code: 'PENDING_PAYMENTS',
        detail:
          daysToPayment <= 0
            ? `${entitlementCounts.pending} entitlements still pending past payment date.`
            : `${entitlementCounts.pending} entitlements pending; payment date in ${daysToPayment} day${daysToPayment === 1 ? '' : 's'}.`,
        label: `${entitlementCounts.pending} pending payouts`,
        severity: daysToPayment <= 0 ? 'CRITICAL' : 'WARN',
      })
      actions.push({ action: 'PAY_ENTITLEMENTS', label: 'Process pending payments', params: { id: event.id } })
    }
  }

  if (event.status === 'PAID') {
    signals.push({
      code: 'PAID',
      detail: `All ${entitlementCounts.total} entitlements paid.`,
      label: 'Dividend fully paid',
      severity: 'SUCCESS',
    })
  }

  if (event.status === 'CANCELLED') {
    signals.push({ code: 'CANCELLED', label: 'Dividend cancelled', severity: 'INFO' })
  }

  const headline = buildHeadline(event, signals)
  const summary = buildSummary(event, input, signals)

  return {
    data: {
      entitlementCounts,
      expectedDistributionCents: event.ratePerShareCents * totalSharesAtRecordDate,
      paymentDate: event.paymentDate,
      recordDate: event.recordDate,
      status: event.status,
      totalDistributionCents: event.totalDistributionCents,
    },
    generatedAt: new Date(),
    generator: 'HEURISTIC',
    headline,
    kind: 'DIVIDEND_READINESS',
    recommendedActions: actions,
    references: [{ id: event.id, kind: 'DIVIDEND_EVENT', label: event.description || 'Dividend event' }],
    signals,
    subject: { id: event.id, label: event.description || `Dividend ${event.id}`, type: 'DIVIDEND_EVENT' },
    summary,
  }
}

function buildHeadline(event: DividendEvent, signals: InsightSignal[]): string {
  const critical = signals.find(signal => signal.severity === 'CRITICAL')
  if (critical) {
    return `Dividend ${event.id} has a blocker: ${critical.label}.`
  }
  const warn = signals.find(signal => signal.severity === 'WARN')
  if (warn) {
    return `Dividend ${event.id} needs attention: ${warn.label}.`
  }
  return `Dividend ${event.id} status ${event.status}.`
}

function buildSummary(event: DividendEvent, input: DividendReadinessInputs, signals: InsightSignal[]): string {
  const parts = [
    `Rate ${(event.ratePerShareCents / 100).toFixed(4)} ${event.currency}/share.`,
    `Declared ${event.declarationDate}, record ${event.recordDate}, payment ${event.paymentDate}.`,
    `${input.eligibleHolderCount} holder${input.eligibleHolderCount === 1 ? '' : 's'} hold ${input.totalSharesAtRecordDate.toLocaleString()} shares as of record date.`,
  ]
  if (signals.length === 0) {
    parts.push('No outstanding readiness issues.')
  }
  return parts.join(' ')
}
