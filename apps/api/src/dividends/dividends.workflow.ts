/**
 * Pure workflow helpers — the operator-facing 11-step stepper plus the
 * communications state machine. Lives outside `dividends.service.ts`
 * so it can be unit-tested without booting Nest or a DB.
 *
 * The stepper logic is intentionally loose — it's a *read* projection
 * over heterogeneous workflow state (lifecycle, snapshot, exceptions,
 * etc.) so the UI can render check / spinner / lock affordances
 * deterministically. Authoritative transition guards live in
 * `dividends.state.ts` and `dividends.payments.state.ts`.
 */

import type {
  DividendCalculationSummary,
  DividendCommunication,
  DividendCommunicationStatus,
  DividendEligibilitySnapshot,
  DividendEvent,
  DividendFractionalAdjustment,
  DividendPaymentBatch,
  DividendReconciliationException,
  DividendReinvestmentRecord,
  DividendWarning,
  DividendWorkflowStep,
} from './dividends.types.js'

export const COMMUNICATION_TRANSITIONS: Readonly<Record<DividendCommunicationStatus, readonly DividendCommunicationStatus[]>> =
  Object.freeze({
    APPROVED: ['SENT', 'CANCELLED'],
    CANCELLED: [],
    DRAFT: ['PENDING_REVIEW', 'CANCELLED'],
    PENDING_REVIEW: ['APPROVED', 'DRAFT', 'CANCELLED'],
    SENT: ['CANCELLED'],
  })

export class CommunicationTransitionError extends Error {
  constructor(
    public readonly from: DividendCommunicationStatus,
    public readonly to: DividendCommunicationStatus,
  ) {
    super(
      `Invalid communication status transition: ${from} → ${to}. Allowed: ${
        (COMMUNICATION_TRANSITIONS[from] || []).join(', ') || '(none)'
      }`,
    )
    this.name = 'CommunicationTransitionError'
  }
}

export function canCommunicationTransition(from: DividendCommunicationStatus, to: DividendCommunicationStatus): boolean {
  return (COMMUNICATION_TRANSITIONS[from] || []).includes(to)
}

export function assertCommunicationTransition(from: DividendCommunicationStatus, to: DividendCommunicationStatus): void {
  if (!canCommunicationTransition(from, to)) {
    throw new CommunicationTransitionError(from, to)
  }
}

export interface BuildStepsInput {
  dividend: DividendEvent
  communications: readonly DividendCommunication[]
  snapshot: DividendEligibilitySnapshot | null
  calculatedSummary: DividendCalculationSummary | undefined
  fractional: readonly DividendFractionalAdjustment[]
  reinvestmentRecords: readonly DividendReinvestmentRecord[]
  batches: readonly DividendPaymentBatch[]
  exceptions: readonly DividendReconciliationException[]
}

/**
 * Project domain state into the 11-step UI stepper. Each step's `state`
 * is one of `pending` / `in_progress` / `done` / `blocked` / `skipped`.
 *
 * The function is pure: callers compose it with reads from the service
 * layer.
 */
export function buildWorkflowSteps(input: BuildStepsInput): DividendWorkflowStep[] {
  const { dividend, communications, snapshot, calculatedSummary, fractional, reinvestmentRecords, batches, exceptions } = input

  const isApproved =
    dividend.status === 'APPROVED' ||
    dividend.status === 'ELIGIBILITY_LOCKED' ||
    dividend.status === 'CALCULATED' ||
    dividend.status === 'PAYMENT_SCHEDULED' ||
    dividend.status === 'PARTIALLY_PAID' ||
    dividend.status === 'PAID' ||
    dividend.status === 'RECONCILED' ||
    dividend.status === 'ARCHIVED'
  const isRejected = dividend.status === 'REJECTED' || dividend.status === 'CANCELLED'

  const boardStep: DividendWorkflowStep = {
    detail: dividend.approvedAt
      ? `Approved ${dividend.approvedAt.toISOString().slice(0, 10)}`
      : isRejected
        ? `Rejected · ${dividend.status}`
        : `Status: ${dividend.status}`,
    key: 'BOARD_REVIEW',
    label: 'Board review',
    reachedAt: dividend.approvedAt,
    state: isRejected ? 'blocked' : isApproved ? 'done' : dividend.status === 'PENDING_APPROVAL' ? 'in_progress' : 'pending',
    warnings: [],
  }

  const keyDatesComplete = Boolean(dividend.declarationDate && dividend.recordDate && dividend.paymentDate)
  const keyDatesStep: DividendWorkflowStep = {
    detail: `Decl ${dividend.declarationDate} · Rec ${dividend.recordDate} · Pay ${dividend.paymentDate}`,
    key: 'KEY_DATES',
    label: 'Key dates',
    state: keyDatesComplete ? 'done' : 'pending',
    warnings: [],
  }

  const sentComms = communications.filter(c => c.status === 'SENT')
  const draftComms = communications.filter(c => c.status === 'DRAFT' || c.status === 'PENDING_REVIEW')
  const commsStep: DividendWorkflowStep = {
    detail: sentComms.length
      ? `${sentComms.length} sent · ${draftComms.length} pending`
      : communications.length
        ? `${communications.length} drafted`
        : 'No communications yet',
    key: 'COMMUNICATIONS',
    label: 'Notices / Announcement',
    state: sentComms.length > 0 ? 'done' : communications.length > 0 ? 'in_progress' : 'pending',
    warnings: [],
  }

  const registerStep: DividendWorkflowStep = {
    detail: snapshot ? `${snapshot.holderCount} holders · captured ${snapshot.capturedAt.toISOString().slice(0, 10)}` : 'Not captured',
    key: 'REGISTER_REVIEW',
    label: 'Register review',
    reachedAt: snapshot?.capturedAt,
    state: snapshot ? 'done' : isApproved ? 'in_progress' : 'pending',
    warnings: [],
  }

  const eligibilityLocked = Boolean(snapshot?.lockedAt) || dividend.status === 'CALCULATED' || isApproved
  const eligibilityStep: DividendWorkflowStep = {
    detail: snapshot?.lockedAt
      ? `Locked ${snapshot.lockedAt.toISOString().slice(0, 10)} · ${snapshot.totalEligibleShares} shares`
      : dividend.eligibilityLockedAt
        ? 'Locked'
        : 'Not locked',
    key: 'ELIGIBILITY',
    label: 'Eligibility',
    reachedAt: snapshot?.lockedAt ?? dividend.eligibilityLockedAt,
    state: snapshot?.lockedAt ? 'done' : dividend.status === 'ELIGIBILITY_LOCKED' ? 'in_progress' : eligibilityLocked ? 'done' : 'pending',
    warnings: [],
  }

  const taxWarnings: DividendWarning[] = (calculatedSummary?.warnings ?? []).filter(
    w => w.code === 'MISSING_TAX_INFO' || w.code === 'UNKNOWN_RESIDENCY' || w.code === 'EXPIRED_TAX_FORM',
  )
  const taxStep: DividendWorkflowStep = {
    detail: calculatedSummary
      ? `Withholding ${calculatedSummary.totalWithholdingCents}¢ / Net ${calculatedSummary.totalNetCents}¢`
      : 'Awaiting calculation',
    key: 'TAX',
    label: 'Tax / Withholding',
    state: calculatedSummary ? (taxWarnings.length ? 'in_progress' : 'done') : 'pending',
    warnings: taxWarnings,
  }

  const fractionalStep: DividendWorkflowStep = {
    detail: fractional.length ? `${fractional.length} adjustments applied` : 'No adjustments',
    key: 'FRACTIONAL',
    label: 'Fractional adjustments',
    state: fractional.length > 0 ? 'done' : calculatedSummary ? 'skipped' : 'pending',
    warnings: [],
  }

  const dripOrCashStep: DividendWorkflowStep = {
    detail: reinvestmentRecords.length
      ? `${reinvestmentRecords.length} DRIP records · ${batches.length} cash batches`
      : batches.length
        ? `${batches.length} cash batches`
        : 'Awaiting cash or DRIP processing',
    key: 'DRIP_OR_CASH',
    label: 'Cash or DRIP processing',
    state: reinvestmentRecords.length > 0 || batches.length > 0 ? 'done' : calculatedSummary ? 'in_progress' : 'pending',
    warnings: [],
  }

  const paidBatch = batches.find(b => b.status === 'PROCESSED' || b.status === 'COMPLETED' || b.status === 'RECONCILED')
  const paymentStep: DividendWorkflowStep = {
    detail: paidBatch ? `Batch ${paidBatch.batchNumber} ${paidBatch.status}` : batches.length ? 'In progress' : 'Pending',
    key: 'PAYMENT_EXECUTION',
    label: 'Payment execution',
    state: paidBatch ? 'done' : batches.length ? 'in_progress' : 'pending',
    warnings: [],
  }

  const allReconciled = batches.length > 0 && batches.every(b => b.status === 'RECONCILED' || b.status === 'CANCELLED')
  const openExceptions = exceptions.filter(e => e.status === 'OPEN' || e.status === 'INVESTIGATING')
  const reconciliationStep: DividendWorkflowStep = {
    detail: openExceptions.length ? `${openExceptions.length} exceptions to resolve` : allReconciled ? 'All reconciled' : 'Pending',
    key: 'RECONCILIATION',
    label: 'Reconciliation',
    state: allReconciled
      ? 'done'
      : openExceptions.length
        ? 'in_progress'
        : batches.some(b => b.status === 'PROCESSED' || b.status === 'COMPLETED' || b.status === 'PARTIALLY_FAILED')
          ? 'in_progress'
          : 'pending',
    warnings: openExceptions.map(e => ({
      code: e.type,
      message: e.description,
      severity: 'WARNING' as const,
    })),
  }

  const archiveStep: DividendWorkflowStep = {
    detail: dividend.archivedAt ? `Archived ${dividend.archivedAt.toISOString().slice(0, 10)}` : 'Pending closeout',
    key: 'ARCHIVE',
    label: 'Archive',
    reachedAt: dividend.archivedAt,
    state: dividend.status === 'ARCHIVED' ? 'done' : allReconciled && !openExceptions.length ? 'in_progress' : 'pending',
    warnings: [],
  }

  return [
    boardStep,
    keyDatesStep,
    commsStep,
    registerStep,
    eligibilityStep,
    taxStep,
    fractionalStep,
    dripOrCashStep,
    paymentStep,
    reconciliationStep,
    archiveStep,
  ]
}
