/**
 * Pure aggregator for the dividend reporting summary.
 *
 * The API surface (`GET /dividends/reports/summary`) returns a flat
 * report-card payload with the headline metrics needed by the issuer
 * dashboard:
 *
 *   - total declared
 *   - total paid
 *   - total withholding
 *   - failed payment count
 *   - unpaid amount
 *   - dividends-by-status breakdown
 *
 * The aggregator is split out from the service layer so the math is
 * independently testable without booting Postgres or Nest.
 */

import type {
  DividendBatchStatus,
  DividendEntitlement,
  DividendEvent,
  DividendPayment,
  DividendPaymentBatch,
  DividendPaymentStatus,
  DividendStatus,
} from './dividends.types.js'

export interface DividendsReportsSummary {
  /** Total of `total_distribution_cents` across all non-cancelled declarations. */
  totalDeclaredCents: number
  /** Sum of net amounts on entitlements with `status = PAID`. */
  totalPaidCents: number
  /** Sum of withholding cents across all calculated entitlements. */
  totalWithholdingCents: number
  /** Sum of net amounts still owed (entitlements not yet paid/voided/reversed). */
  unpaidAmountCents: number
  /** Count of payments in failed/returned/cancelled state. */
  failedPaymentCount: number
  /** Number of declarations broken down by canonical status. */
  dividendsByStatus: Record<DividendStatus, number>
  /** Number of payment batches by canonical batch status. */
  batchesByStatus: Record<DividendBatchStatus, number>
  /** Inclusive count of declarations considered. */
  declarationCount: number
  /** Currency assumed for the cents totals. Set when all rows agree, else `MIXED`. */
  currency: 'USD' | 'MIXED' | string
  /** Window over which the summary was computed, if scoped. */
  window?: { from?: string; to?: string }
}

const DIVIDEND_STATUSES: ReadonlyArray<DividendStatus> = [
  'DRAFT',
  'PENDING_APPROVAL',
  'CHANGES_REQUESTED',
  'APPROVED',
  'ELIGIBILITY_LOCKED',
  'CALCULATED',
  'PAYMENT_SCHEDULED',
  'PARTIALLY_PAID',
  'PAID',
  'RECONCILED',
  'ARCHIVED',
  'CANCELLED',
  'REJECTED',
  'DECLARED',
  'SNAPSHOTTED',
  'RECORD_DATE_SET',
  'PAYABLE',
]

const BATCH_STATUSES: ReadonlyArray<DividendBatchStatus> = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'SCHEDULED',
  'PROCESSING',
  'PARTIALLY_PROCESSED',
  'PARTIALLY_FAILED',
  'PROCESSED',
  'COMPLETED',
  'FAILED',
  'RECONCILED',
  'CANCELLED',
]

const FAILED_PAYMENT_STATUSES: ReadonlySet<DividendPaymentStatus> = new Set<DividendPaymentStatus>(['FAILED', 'RETURNED', 'CANCELLED'])

/** "Considered cancelled or rejected" → excluded from totals. */
const EXCLUDED_FROM_TOTALS: ReadonlySet<DividendStatus> = new Set<DividendStatus>(['CANCELLED', 'REJECTED'])

/** Reverse-lookup of paid-state entitlements; matches per-entitlement `status` enum. */
function isPaidEntitlement(e: DividendEntitlement): boolean {
  return e.status === 'PAID'
}

function isUnpaidEntitlement(e: DividendEntitlement): boolean {
  return e.status === 'PENDING' || e.status === 'CALCULATED' || e.status === 'HELD'
}

export interface BuildSummaryInput {
  declarations: ReadonlyArray<DividendEvent>
  entitlements: ReadonlyArray<DividendEntitlement>
  payments: ReadonlyArray<DividendPayment>
  batches: ReadonlyArray<DividendPaymentBatch>
  window?: { from?: string; to?: string }
}

/**
 * Aggregate summary metrics across the supplied row sets. The caller is
 * expected to scope by issuer/window before calling — this function does
 * no filtering of its own beyond the cancelled/rejected exclusion for
 * the "total declared" headline.
 */
export function buildReportsSummary(input: BuildSummaryInput): DividendsReportsSummary {
  const dividendsByStatus = emptyStatusMap(DIVIDEND_STATUSES)
  const batchesByStatus = emptyStatusMap(BATCH_STATUSES)

  let totalDeclaredCents = 0
  for (const declaration of input.declarations) {
    dividendsByStatus[declaration.status] = (dividendsByStatus[declaration.status] ?? 0) + 1
    if (!EXCLUDED_FROM_TOTALS.has(declaration.status)) {
      totalDeclaredCents += Number(declaration.totalDistributionCents) || 0
    }
  }

  let totalPaidCents = 0
  let totalWithholdingCents = 0
  let unpaidAmountCents = 0
  for (const ent of input.entitlements) {
    totalWithholdingCents += Number(ent.withholdingCents) || 0
    if (isPaidEntitlement(ent)) {
      totalPaidCents += Number(ent.netAmountCents) || 0
    } else if (isUnpaidEntitlement(ent)) {
      unpaidAmountCents += Number(ent.netAmountCents) || 0
    }
  }

  let failedPaymentCount = 0
  for (const payment of input.payments) {
    if (FAILED_PAYMENT_STATUSES.has(payment.status)) {
      failedPaymentCount += 1
    }
  }

  for (const batch of input.batches) {
    batchesByStatus[batch.status] = (batchesByStatus[batch.status] ?? 0) + 1
  }

  const currency = pickSingleCurrency(input)
  return {
    batchesByStatus,
    currency,
    declarationCount: input.declarations.length,
    dividendsByStatus,
    failedPaymentCount,
    totalDeclaredCents,
    totalPaidCents,
    totalWithholdingCents,
    unpaidAmountCents,
    window: input.window,
  }
}

function emptyStatusMap<T extends string>(keys: ReadonlyArray<T>): Record<T, number> {
  const out = {} as Record<T, number>
  for (const k of keys) out[k] = 0
  return out
}

function pickSingleCurrency(input: BuildSummaryInput): string {
  const set = new Set<string>()
  for (const d of input.declarations) if (d.currency) set.add(d.currency)
  for (const e of input.entitlements) if (e.currency) set.add(e.currency)
  for (const p of input.payments) if (p.currency) set.add(p.currency)
  for (const b of input.batches) if (b.currency) set.add(b.currency)
  if (set.size === 0) return 'USD'
  if (set.size === 1) return [...set][0]!
  return 'MIXED'
}
