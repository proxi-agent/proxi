/**
 * Centralized audit event names.
 *
 * All `action` strings written to the audit log live here. This keeps the
 * event vocabulary auditable, lets AI layers enumerate known actions at
 * startup, and prevents typos like "TRANSFER_APRPROVED" from sneaking into
 * production.
 *
 * Naming convention:
 *   <DOMAIN>_<NOUN>_<VERB_PAST_TENSE>
 *
 *   • DOMAIN ∈ TRANSFER | DIVIDEND | MEETING | BALLOT | LEDGER | SHAREHOLDER
 *             | ISSUER | TASK | AUDIT | USER
 *   • NOUN   is singular
 *   • VERB   is past tense (CREATED, SUBMITTED, APPROVED, REJECTED, …)
 *
 * When adding a new event, append it to the relevant group below. If the
 * event should raise a task/signal, also register a handler in
 * `tasks.signals.ts`.
 */

export const AuditActions = {
  // ------- Transfers -----------------------------------------------------
  TRANSFER_DRAFTED: 'TRANSFER_DRAFTED',
  TRANSFER_SUBMITTED: 'TRANSFER_SUBMITTED',
  TRANSFER_REVIEW_STARTED: 'TRANSFER_REVIEW_STARTED',
  TRANSFER_INFO_REQUESTED: 'TRANSFER_INFO_REQUESTED',
  TRANSFER_RESUBMITTED: 'TRANSFER_RESUBMITTED',
  TRANSFER_APPROVED: 'TRANSFER_APPROVED',
  TRANSFER_REJECTED: 'TRANSFER_REJECTED',
  TRANSFER_SETTLED: 'TRANSFER_SETTLED',
  TRANSFER_CANCELLED: 'TRANSFER_CANCELLED',
  TRANSFER_SETTLEMENT_BLOCKED: 'TRANSFER_SETTLEMENT_BLOCKED',

  // ------- Ledger --------------------------------------------------------
  LEDGER_ENTRY_POSTED: 'LEDGER_ENTRY_POSTED',
  LEDGER_ADJUSTMENT_POSTED: 'LEDGER_ADJUSTMENT_POSTED',

  // ------- Dividends -----------------------------------------------------
  DIVIDEND_CREATED: 'DIVIDEND_CREATED',
  DIVIDEND_UPDATED: 'DIVIDEND_UPDATED',
  DIVIDEND_DECLARED: 'DIVIDEND_DECLARED',
  DIVIDEND_SNAPSHOTTED: 'DIVIDEND_SNAPSHOTTED',
  DIVIDEND_ENTITLEMENT_PAID: 'DIVIDEND_ENTITLEMENT_PAID',
  DIVIDEND_ENTITLEMENT_FAILED: 'DIVIDEND_ENTITLEMENT_FAILED',
  DIVIDEND_CANCELLED: 'DIVIDEND_CANCELLED',
  DIVIDEND_PAYMENT_RETRIED: 'DIVIDEND_PAYMENT_RETRIED',

  // ------- Meetings / voting --------------------------------------------
  MEETING_CREATED: 'MEETING_CREATED',
  MEETING_UPDATED: 'MEETING_UPDATED',
  MEETING_OPENED: 'MEETING_OPENED',
  MEETING_CLOSED: 'MEETING_CLOSED',
  MEETING_CERTIFIED: 'MEETING_CERTIFIED',
  PROPOSAL_UPSERTED: 'PROPOSAL_UPSERTED',
  PROPOSALS_UPSERTED: 'PROPOSALS_UPSERTED',
  BALLOT_ISSUED: 'BALLOT_ISSUED',
  BALLOT_SUBMITTED: 'BALLOT_SUBMITTED',
  BALLOT_REVOKED: 'BALLOT_REVOKED',

  // ------- Issuers / shareholders / securities ---------------------------
  ISSUER_CREATED: 'ISSUER_CREATED',
  ISSUER_UPDATED: 'ISSUER_UPDATED',
  SECURITY_CREATED: 'SECURITY_CREATED',
  SHARE_CLASS_UPDATED: 'SHARE_CLASS_UPDATED',
  SHAREHOLDER_CREATED: 'SHAREHOLDER_CREATED',
  SHAREHOLDER_UPDATED: 'SHAREHOLDER_UPDATED',
  SHAREHOLDER_KYC_UPDATED: 'SHAREHOLDER_KYC_UPDATED',

  // ------- Tasks ---------------------------------------------------------
  TASK_CREATED: 'TASK_CREATED',
  TASK_UPDATED: 'TASK_UPDATED',
  TASK_OPEN: 'TASK_OPEN',
  TASK_IN_REVIEW: 'TASK_IN_REVIEW',
  TASK_BLOCKED: 'TASK_BLOCKED',
  TASK_RESOLVED: 'TASK_RESOLVED',
  TASK_CANCELLED: 'TASK_CANCELLED',
} as const

export type AuditActionName = (typeof AuditActions)[keyof typeof AuditActions]

/**
 * Canonical event groups, useful for filtering audit feeds by domain
 * without hardcoding prefixes on the client.
 */
export const AUDIT_DOMAINS = {
  BALLOT: 'BALLOT',
  DIVIDEND: 'DIVIDEND',
  ISSUER: 'ISSUER',
  LEDGER: 'LEDGER',
  MEETING: 'MEETING',
  SECURITY: 'SECURITY',
  SHAREHOLDER: 'SHAREHOLDER',
  TASK: 'TASK',
  TRANSFER: 'TRANSFER',
} as const

export type AuditDomain = (typeof AUDIT_DOMAINS)[keyof typeof AUDIT_DOMAINS]

/** Domain inferred from the event name prefix (first `_`-delimited token). */
export function domainFromAction(action: string): AuditDomain | undefined {
  const prefix = action.split('_')[0]
  return AUDIT_DOMAINS[prefix as keyof typeof AUDIT_DOMAINS]
}

/** All known action names — exposed so UIs/insights can render filter chips. */
export const ALL_AUDIT_ACTIONS: readonly AuditActionName[] = Object.values(AuditActions)
