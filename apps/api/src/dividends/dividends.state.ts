import type { DividendAction, DividendStatus } from './dividends.types.js'

/**
 * Dividend-event state machine.
 *
 * Product-visible lifecycle:
 *
 *   DRAFT ◄──────────────────────┐
 *     ▼                          │
 *   PENDING_APPROVAL ─► CHANGES_REQUESTED ─┐
 *     │                                    │
 *     ├─► REJECTED  (terminal-ish)         │ resubmit
 *     │                                    │
 *     ▼                                    │
 *   APPROVED ◄──────────────────────────────┘
 *     ▼
 *   ELIGIBILITY_LOCKED
 *     ▼
 *   CALCULATED
 *     ▼
 *   PAYMENT_SCHEDULED ────► PARTIALLY_PAID ──► PAID  (terminal)
 *                                       │
 *                                       ▼
 *                                  CANCELLED  (terminal)
 *
 * Business rules enforced in the service layer:
 * - A dividend cannot be CALCULATED until it is APPROVED.
 * - A dividend cannot be paid (PAYMENT_SCHEDULED / PARTIALLY_PAID / PAID)
 *   until entitlements are CALCULATED and eligibility is locked.
 * - CHANGES_REQUESTED bounces the declaration back to the issuer; from
 *   there, edits are allowed (treated like a draft) and resubmission
 *   moves it back to PENDING_APPROVAL.
 * - REJECTED is a hard rejection. The only legal exit is CANCELLED so
 *   the audit trail is preserved.
 * - CANCELLED is reachable from every non-terminal state, but cancelling
 *   after PAYMENT_SCHEDULED requires an internal-admin "force" override
 *   (enforced in the service layer, not here).
 *
 * Legacy statuses (`DECLARED`, `SNAPSHOTTED`, `RECORD_DATE_SET`, `PAYABLE`)
 * are recognised for read-back compatibility and implicitly map to
 * APPROVED / ELIGIBILITY_LOCKED / CALCULATED / PAYMENT_SCHEDULED. New
 * writes must use the canonical values.
 */

const TERMINAL_STATES = new Set<DividendStatus>(['ARCHIVED', 'CANCELLED'])

const ALLOWED_TRANSITIONS: Record<DividendStatus, readonly DividendStatus[]> = {
  DRAFT: ['PENDING_APPROVAL', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'CANCELLED'],
  CHANGES_REQUESTED: ['DRAFT', 'PENDING_APPROVAL', 'CANCELLED'],
  APPROVED: ['ELIGIBILITY_LOCKED', 'CANCELLED'],
  ELIGIBILITY_LOCKED: ['CALCULATED', 'CANCELLED'],
  CALCULATED: ['PAYMENT_SCHEDULED', 'CANCELLED'],
  PAYMENT_SCHEDULED: ['PARTIALLY_PAID', 'PAID', 'CANCELLED'],
  PARTIALLY_PAID: ['PAID', 'CANCELLED'],
  PAID: ['RECONCILED', 'ARCHIVED'],
  RECONCILED: ['ARCHIVED'],
  ARCHIVED: [],
  CANCELLED: [],
  REJECTED: ['CANCELLED'],
  // Legacy waypoints — behave like their canonical counterparts so old
  // rows remain advance-able through the lifecycle.
  DECLARED: ['ELIGIBILITY_LOCKED', 'CANCELLED'],
  SNAPSHOTTED: ['CALCULATED', 'PAID', 'CANCELLED'],
  RECORD_DATE_SET: ['CALCULATED', 'CANCELLED'],
  PAYABLE: ['PAYMENT_SCHEDULED', 'PAID', 'CANCELLED'],
}

/**
 * States from which a non-privileged actor may cancel. Cancelling from
 * any later state requires an internal-admin override (enforced in the
 * service layer with `isInternalAdmin`).
 */
const CANCELLABLE_WITHOUT_OVERRIDE = new Set<DividendStatus>([
  'DRAFT',
  'PENDING_APPROVAL',
  'CHANGES_REQUESTED',
  'APPROVED',
  'ELIGIBILITY_LOCKED',
  'CALCULATED',
  'REJECTED',
  // Legacy waypoints prior to payment scheduling.
  'DECLARED',
  'RECORD_DATE_SET',
])

/**
 * States from which a privileged actor (super_admin / transfer_agent_admin)
 * may force-cancel. PAID and already-CANCELLED rows are never re-openable.
 */
const FORCE_CANCELLABLE = new Set<DividendStatus>([
  'PAYMENT_SCHEDULED',
  'PARTIALLY_PAID',
  // Legacy paying waypoints.
  'SNAPSHOTTED',
  'PAYABLE',
])

/**
 * Human-readable prerequisites enforced by the lifecycle. The service
 * layer should prefer these messages when raising `ConflictException`s
 * so the UI can render them directly.
 */
export const LIFECYCLE_REQUIREMENTS = {
  approve: 'Dividend must be in PENDING_APPROVAL to approve',
  submitForApproval: 'Dividend must be in DRAFT or CHANGES_REQUESTED to submit for approval',
  reject: 'Only PENDING_APPROVAL dividends can be rejected',
  requestChanges: 'Only PENDING_APPROVAL dividends can be sent back for changes',
  lockEligibility: 'Dividend must be APPROVED before eligibility can be locked',
  calculate: 'Dividend must have ELIGIBILITY_LOCKED before entitlements can be calculated',
  schedulePayment: 'Dividend must be CALCULATED before payments can be scheduled',
  recordPayment: 'Dividend must be scheduled or paying before per-shareholder payments can be recorded',
  cancel: 'Cannot cancel a dividend that is already paid',
  cancelOverride: 'Cancelling after payment scheduling requires an internal-admin override with reason',
  archive: 'Dividend must be PAID or RECONCILED before it can be archived',
} as const

export function isTerminalDividendStatus(status: DividendStatus): boolean {
  return TERMINAL_STATES.has(status)
}

export function canTransitionDividendStatus(from: DividendStatus, to: DividendStatus): boolean {
  if (from === to) {
    return false
  }
  return (ALLOWED_TRANSITIONS[from] || []).includes(to)
}

export function assertDividendTransition(from: DividendStatus, to: DividendStatus): void {
  if (!canTransitionDividendStatus(from, to)) {
    const allowed = (ALLOWED_TRANSITIONS[from] || []).join(', ') || '(none — terminal)'
    throw new Error(`Invalid dividend status transition: ${from} → ${to}. Allowed from ${from}: ${allowed}`)
  }
}

/**
 * True when the dividend has been APPROVED (or any later state except
 * CANCELLED). Used as the precondition for locking eligibility.
 */
export function isApprovedOrLater(status: DividendStatus): boolean {
  return (
    status === 'APPROVED' ||
    status === 'ELIGIBILITY_LOCKED' ||
    status === 'CALCULATED' ||
    status === 'PAYMENT_SCHEDULED' ||
    status === 'PARTIALLY_PAID' ||
    status === 'PAID' ||
    status === 'DECLARED' ||
    status === 'SNAPSHOTTED' ||
    status === 'RECORD_DATE_SET' ||
    status === 'PAYABLE'
  )
}

/**
 * True when entitlements have been materialised (CALCULATED or any
 * paying state). Used as the precondition for creating payment batches.
 */
export function isCalculatedOrLater(status: DividendStatus): boolean {
  return (
    status === 'CALCULATED' ||
    status === 'PAYMENT_SCHEDULED' ||
    status === 'PARTIALLY_PAID' ||
    status === 'PAID' ||
    status === 'SNAPSHOTTED' ||
    status === 'PAYABLE'
  )
}

/**
 * True when eligibility has been frozen — the ledger positions as of the
 * record date must no longer change the canonical entitlements.
 */
export function isEligibilityLockedOrLater(status: DividendStatus): boolean {
  return (
    status === 'ELIGIBILITY_LOCKED' ||
    status === 'CALCULATED' ||
    status === 'PAYMENT_SCHEDULED' ||
    status === 'PARTIALLY_PAID' ||
    status === 'PAID' ||
    status === 'DECLARED' ||
    status === 'SNAPSHOTTED' ||
    status === 'RECORD_DATE_SET' ||
    status === 'PAYABLE'
  )
}

/**
 * True when a non-privileged actor may cancel the declaration. Once the
 * declaration is `PAYMENT_SCHEDULED` or further along, an internal-admin
 * override is required (`canForceCancelDividend`).
 */
export function canCancelDividend(status: DividendStatus): boolean {
  return CANCELLABLE_WITHOUT_OVERRIDE.has(status)
}

/**
 * True when a privileged actor (super_admin / transfer_agent_admin) can
 * force-cancel after payment processing has begun. `PAID` and existing
 * `CANCELLED` rows are never re-openable.
 */
export function canForceCancelDividend(status: DividendStatus): boolean {
  return FORCE_CANCELLABLE.has(status)
}

/**
 * Returns the workflow action keys legally available from a given status.
 * The detail view's `allowedActions` is computed from this and then
 * filtered by the actor's RBAC permissions.
 *
 * `forceCancel` is included alongside `cancel` whenever the lifecycle
 * permits it; the controller layer is responsible for hiding it from
 * actors who lack the internal-admin role.
 */
export function allowedActionsFor(status: DividendStatus): DividendAction[] {
  switch (status) {
    case 'DRAFT':
      return ['edit', 'submitForApproval', 'cancel']
    case 'PENDING_APPROVAL':
      return ['approve', 'reject', 'requestChanges', 'cancel']
    case 'CHANGES_REQUESTED':
      return ['edit', 'submitForApproval', 'cancel']
    case 'APPROVED':
      return ['lockEligibility', 'cancel']
    case 'ELIGIBILITY_LOCKED':
      return ['calculate', 'cancel']
    case 'CALCULATED':
      return ['createBatch', 'generateStatements', 'cancel']
    case 'PAYMENT_SCHEDULED':
      return ['recordPayment', 'createBatch', 'forceCancel']
    case 'PARTIALLY_PAID':
      return ['recordPayment', 'forceCancel']
    case 'PAID':
      return ['archive']
    case 'RECONCILED':
      return ['archive']
    case 'ARCHIVED':
      return []
    case 'CANCELLED':
      return []
    case 'REJECTED':
      return ['cancel']
    // Legacy waypoints — surface what they still permit.
    case 'DECLARED':
      return ['lockEligibility', 'cancel']
    case 'SNAPSHOTTED':
      return ['createBatch', 'forceCancel']
    case 'RECORD_DATE_SET':
      return ['calculate', 'cancel']
    case 'PAYABLE':
      return ['recordPayment', 'forceCancel']
    default:
      return []
  }
}

export { ALLOWED_TRANSITIONS, CANCELLABLE_WITHOUT_OVERRIDE, FORCE_CANCELLABLE, TERMINAL_STATES }
