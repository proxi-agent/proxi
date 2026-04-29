/**
 * State machines for `DividendPaymentBatch` and `DividendPayment`.
 *
 * Kept framework-free so it can be reused inside the service layer
 * and unit-tested with `node:test`. Mirrors the dividend declaration
 * state machine pattern (`dividends.state.ts`) — `assertTransition`
 * throws a domain-friendly `Error` that the service rethrows as a
 * `ConflictException` at the boundary.
 *
 * Backwards compatibility:
 * - `COMPLETED` is treated as a legacy alias of `PROCESSED` for
 *   batches. The state machine keeps both reachable so older rows
 *   continue to work; the canonical write path uses `PROCESSED`.
 * - `SETTLED` is treated as a legacy alias of `PAID` for payments,
 *   and `SENT` is treated as a legacy alias of `PROCESSING`.
 */

import type { DividendBatchStatus, DividendPaymentStatus } from './dividends.types.js'

export const BATCH_TRANSITIONS: Readonly<Record<DividendBatchStatus, readonly DividendBatchStatus[]>> = Object.freeze({
  APPROVED: ['SCHEDULED', 'CANCELLED'],
  CANCELLED: [],
  COMPLETED: ['RECONCILED'],
  DRAFT: ['PENDING_APPROVAL', 'CANCELLED'],
  FAILED: ['CANCELLED'],
  PARTIALLY_FAILED: ['PROCESSED', 'PARTIALLY_PROCESSED', 'RECONCILED', 'CANCELLED'],
  PARTIALLY_PROCESSED: ['PROCESSED', 'PARTIALLY_FAILED', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'DRAFT', 'CANCELLED'],
  PROCESSED: ['RECONCILED'],
  PROCESSING: ['PARTIALLY_PROCESSED', 'PARTIALLY_FAILED', 'PROCESSED', 'FAILED'],
  RECONCILED: [],
  SCHEDULED: ['PROCESSING', 'CANCELLED'],
})

export const PAYMENT_TRANSITIONS: Readonly<Record<DividendPaymentStatus, readonly DividendPaymentStatus[]>> = Object.freeze({
  CANCELLED: [],
  FAILED: ['SCHEDULED', 'CANCELLED'],
  PAID: ['RECONCILED', 'RETURNED'],
  PENDING: ['SCHEDULED', 'CANCELLED'],
  PROCESSING: ['PAID', 'SETTLED', 'FAILED', 'RETURNED', 'CANCELLED'],
  RECONCILED: [],
  RETURNED: ['CANCELLED', 'SCHEDULED'],
  SCHEDULED: ['PROCESSING', 'SENT', 'CANCELLED'],
  SENT: ['PAID', 'SETTLED', 'FAILED', 'RETURNED'],
  SETTLED: ['RECONCILED', 'RETURNED'],
})

/** Statuses where the batch is finished (no further transitions allowed). */
export const TERMINAL_BATCH_STATUSES: ReadonlySet<DividendBatchStatus> = new Set(['CANCELLED', 'RECONCILED'])

/** Statuses where the payment is finished. */
export const TERMINAL_PAYMENT_STATUSES: ReadonlySet<DividendPaymentStatus> = new Set(['CANCELLED', 'RECONCILED'])

/** Set of payment statuses that count as "money has moved" for batch rollups. */
export const PAID_PAYMENT_STATUSES: ReadonlySet<DividendPaymentStatus> = new Set(['PAID', 'SETTLED', 'RECONCILED'])
export const FAILED_PAYMENT_STATUSES: ReadonlySet<DividendPaymentStatus> = new Set(['FAILED', 'RETURNED'])
export const IN_FLIGHT_PAYMENT_STATUSES: ReadonlySet<DividendPaymentStatus> = new Set(['PROCESSING', 'SENT'])
export const PENDING_PAYMENT_STATUSES: ReadonlySet<DividendPaymentStatus> = new Set(['PENDING', 'SCHEDULED'])

export interface BatchTransitionRule {
  message: string
}

export const BATCH_LIFECYCLE_REQUIREMENTS: Record<string, string> = {
  approve: 'Only batches in PENDING_APPROVAL can be approved.',
  cancel: 'Cannot cancel a batch in this state — already terminal.',
  forceSchedule: 'Override required: at least one payment is missing payment instructions.',
  markProcessing: 'Only SCHEDULED batches can be marked PROCESSING.',
  recordPayment: 'Payments can only be recorded once the batch is PROCESSING.',
  reconcile: 'Reconciliation can only be applied to PROCESSED, PARTIALLY_FAILED, or COMPLETED batches.',
  reject: 'Only batches in PENDING_APPROVAL can be rejected.',
  schedule: 'Only APPROVED batches can be scheduled.',
  submit: 'Only DRAFT batches can be submitted for approval.',
}

export class BatchTransitionError extends Error {
  constructor(
    public readonly from: DividendBatchStatus,
    public readonly to: DividendBatchStatus,
  ) {
    super(`Invalid batch transition: ${from} → ${to}`)
    this.name = 'BatchTransitionError'
  }
}

export class PaymentTransitionError extends Error {
  constructor(
    public readonly from: DividendPaymentStatus,
    public readonly to: DividendPaymentStatus,
  ) {
    super(`Invalid payment transition: ${from} → ${to}`)
    this.name = 'PaymentTransitionError'
  }
}

export function canBatchTransition(from: DividendBatchStatus, to: DividendBatchStatus): boolean {
  if (from === to) return true
  return BATCH_TRANSITIONS[from]?.includes(to) ?? false
}

export function assertBatchTransition(from: DividendBatchStatus, to: DividendBatchStatus): void {
  if (!canBatchTransition(from, to)) {
    throw new BatchTransitionError(from, to)
  }
}

export function canPaymentTransition(from: DividendPaymentStatus, to: DividendPaymentStatus): boolean {
  if (from === to) return true
  return PAYMENT_TRANSITIONS[from]?.includes(to) ?? false
}

export function assertPaymentTransition(from: DividendPaymentStatus, to: DividendPaymentStatus): void {
  if (!canPaymentTransition(from, to)) {
    throw new PaymentTransitionError(from, to)
  }
}

/** True when the batch should not accept any further state changes. */
export function isTerminalBatch(status: DividendBatchStatus): boolean {
  return TERMINAL_BATCH_STATUSES.has(status)
}

export function isTerminalPayment(status: DividendPaymentStatus): boolean {
  return TERMINAL_PAYMENT_STATUSES.has(status)
}

export interface BatchRollupCounts {
  pending: number
  inFlight: number
  paid: number
  failed: number
  cancelled: number
  reconciled: number
}

/**
 * Pure helper that maps batch counts to the canonical rollup status.
 * Returns `null` when the current status should be preserved (no
 * deterministic transition applies). Service-level callers add the
 * `RECONCILED` transition explicitly via `reconcileBatch`.
 */
export function rollupBatchStatus(counts: BatchRollupCounts): DividendBatchStatus | null {
  const { pending, inFlight, paid, failed } = counts
  const total = pending + inFlight + paid + failed + counts.cancelled + counts.reconciled
  if (!total) return null

  if (pending === 0 && inFlight === 0) {
    if (failed === 0 && paid > 0) return 'PROCESSED'
    if (failed > 0 && paid === 0) return 'FAILED'
    if (failed > 0 && paid > 0) return 'PARTIALLY_FAILED'
  }

  // Some money has moved while others are still in flight / pending.
  if (paid > 0 && (pending > 0 || inFlight > 0)) return 'PARTIALLY_PROCESSED'

  return null
}
