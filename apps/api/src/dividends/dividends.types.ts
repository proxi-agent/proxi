/**
 * Domain types for the dividend module.
 *
 * Money is always represented as integer cents (BigInt-compatible). Share
 * counts are exposed as decimal strings so we can track fractional shares
 * (DRIP) without losing precision. Calculations elsewhere keep this
 * invariant — never multiply share counts by float rates.
 *
 * Status values include both canonical lifecycle states and legacy
 * waypoints (`DECLARED`, `SNAPSHOTTED`, `RECORD_DATE_SET`, `PAYABLE`)
 * recognised for read compatibility with rows written before the lifecycle
 * was formalised. See `dividends.state.ts` for the state machine.
 */

export type DividendStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'CHANGES_REQUESTED'
  | 'APPROVED'
  | 'ELIGIBILITY_LOCKED'
  | 'CALCULATED'
  | 'PAYMENT_SCHEDULED'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'RECONCILED'
  | 'ARCHIVED'
  | 'CANCELLED'
  | 'REJECTED'
  // Legacy
  | 'DECLARED'
  | 'SNAPSHOTTED'
  | 'RECORD_DATE_SET'
  | 'PAYABLE'

export type DividendKind = 'CASH' | 'STOCK' | 'SPECIAL' | 'RETURN_OF_CAPITAL' | 'SCRIP'

export type DividendRateType = 'PER_SHARE' | 'PERCENTAGE' | 'FIXED_AMOUNT'

export type EntitlementStatus = 'PENDING' | 'CALCULATED' | 'HELD' | 'PAID' | 'FAILED' | 'REVERSED' | 'VOIDED'

export type DividendApprovalAction = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'REVOKED' | 'CHANGES_REQUESTED'

/**
 * Canonical batch lifecycle.
 *
 * `COMPLETED` and `FAILED` are kept as legacy aliases that older
 * deployments may have written; new code uses `PROCESSED` and the
 * `PARTIALLY_*` family. The state machine treats `COMPLETED` as
 * equivalent to `PROCESSED` for transition purposes.
 */
export type DividendBatchStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'SCHEDULED'
  | 'PROCESSING'
  | 'PARTIALLY_PROCESSED'
  | 'PARTIALLY_FAILED'
  | 'PROCESSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'RECONCILED'
  | 'CANCELLED'

/**
 * Canonical per-payment status.
 *
 * `SENT` and `SETTLED` are legacy aliases; the state machine accepts
 * them but new transitions use `PROCESSING` (in flight) and `PAID`
 * (rail-confirmed). `RECONCILED` is reached after a reconciliation
 * import matches the payment to a bank statement entry.
 */
export type DividendPaymentStatus =
  | 'PENDING'
  | 'SCHEDULED'
  | 'PROCESSING'
  | 'SENT'
  | 'PAID'
  | 'SETTLED'
  | 'FAILED'
  | 'RETURNED'
  | 'CANCELLED'
  | 'RECONCILED'

export type DividendPaymentMethod = 'ACH' | 'WIRE' | 'CHECK' | 'STOCK' | 'INTERNAL_CREDIT'

export type DividendStatementStatus = 'DRAFT' | 'READY' | 'SENT' | 'VOIDED'

export interface DividendDocumentRef {
  storageKey: string
  fileName?: string
  contentType?: string
  uploadedAt?: string
  description?: string
}

export interface DividendEvent {
  id: string
  issuerId: string
  securityId: string
  shareClassId?: string
  status: DividendStatus
  kind: DividendKind
  rateType: DividendRateType
  /** Decimal string (e.g. "0.25" for $0.25/share). */
  rateAmount: string
  /** Legacy convenience — only meaningful when `rateType === 'PER_SHARE'`. */
  ratePerShareCents: number
  currency: string
  withholdingDefaultPct: string
  declarationDate: string
  recordDate: string
  exDividendDate?: string
  paymentDate: string
  /** Total gross distribution in cents. Updated when entitlements are calculated. */
  totalDistributionCents: number
  description?: string
  notes?: string
  supportingDocuments: DividendDocumentRef[]
  metadata: Record<string, unknown>
  /** Monotonic counter incremented on every write, used for optimistic concurrency. */
  version: number
  /** Monotonic counter bumped on each entitlement (re)calculation. */
  calculationVersion: number
  approvedAt?: Date
  eligibilityLockedAt?: Date
  calculatedAt?: Date
  /** Set when calculations are explicitly frozen post-payment scheduling. */
  calculationsLockedAt?: Date
  scheduledAt?: Date
  paidAt?: Date
  /** Set when reconciliation closes and the dividend is archived. */
  archivedAt?: Date
  cancelledAt?: Date
  rejectedAt?: Date
  changesRequestedAt?: Date
  createdAt: Date
  updatedAt: Date
}

/**
 * Action keys exposed in the detail view's `allowedActions`. The UI maps
 * these to button labels and the corresponding workflow endpoint.
 */
export type DividendAction =
  | 'edit'
  | 'submitForApproval'
  | 'approve'
  | 'reject'
  | 'requestChanges'
  | 'cancel'
  | 'forceCancel'
  | 'lockEligibility'
  | 'calculate'
  | 'createBatch'
  | 'recordPayment'
  | 'generateStatements'
  | 'archive'

/** Severity of a workflow warning surfaced in the detail view. */
export type DividendWarningSeverity = 'INFO' | 'WARNING' | 'ERROR'

export interface DividendWarning {
  /** Stable code suitable for translation / lookup. */
  code: string
  message: string
  severity: DividendWarningSeverity
  metadata?: Record<string, unknown>
}

export interface DividendIssuerSummary {
  id: string
  legalName?: string
  jurisdiction?: string
  metadata?: Record<string, unknown>
}

export interface DividendSecuritySummary {
  id: string
  name?: string
  symbol?: string
  cusip?: string
  shareClassId?: string
  shareClassCode?: string
  shareClassName?: string
  parValueCents?: number
}

export interface DividendCalculatedSummary {
  entitlementCount: number
  totalGrossCents: number
  totalWithholdingCents: number
  totalNetCents: number
  /** Number of entitlements paid (status = PAID). */
  paidCount: number
  /** Number of entitlements still pending (status PENDING/CALCULATED/HELD). */
  pendingCount: number
  /** Decimal string. */
  totalEligibleShares: string
  recordDate?: string
  capturedAt?: Date
  lockedAt?: Date
  /** Most recent calculation version captured on entitlements. */
  calculationVersion?: number
}

/**
 * Response shape returned by `GET /dividends/:id/calculation-summary` and
 * the synchronous `calculateEntitlements` action. Pure projection of the
 * stored data — no live ledger reads required to assemble it.
 */
export interface DividendCalculationSummary {
  dividendEventId: string
  status: DividendStatus
  currency: string
  recordDate: string
  /** Eligible holder count (rows with `EligibilityRowStatus === 'ELIGIBLE'`). */
  eligibleHolderCount: number
  /** Sum of all non-eligible roster rows (zero shares, blocked, etc.). */
  excludedHolderCount: number
  /** Decimal string total of eligible shares. */
  totalEligibleShares: string
  totalGrossCents: number
  totalWithholdingCents: number
  totalNetCents: number
  calculationVersion: number
  lockedForPayment: boolean
  warnings: DividendWarning[]
}

/**
 * Rich detail shape returned by `GET /dividends/:id`. Carries everything
 * the issuer/operator review screens need so the UI doesn't have to fan
 * out across many endpoints.
 */
export interface DividendDeclarationDetail {
  declaration: DividendEvent
  issuer: DividendIssuerSummary
  security: DividendSecuritySummary
  /** Computed financial terms convenience block. */
  financialTerms: {
    kind: DividendKind
    rateType: DividendRateType
    rateAmount: string
    ratePerShareCents: number
    currency: string
    withholdingDefaultPct: string
  }
  importantDates: {
    declarationDate: string
    recordDate: string
    exDividendDate?: string
    paymentDate: string
  }
  status: DividendStatus
  allowedActions: DividendAction[]
  approvalHistory: DividendApproval[]
  recentAuditEvents: Array<{
    id: number
    at: string
    action: string
    headline: string
    actor: { id: string; role?: string }
    severity: string
    payload: Record<string, unknown>
  }>
  calculatedSummary?: DividendCalculatedSummary
  warnings: DividendWarning[]
}

/**
 * Per-row eligibility status. ELIGIBLE rows feed the entitlement
 * calculator; everything else is excluded with a stable
 * `disqualificationReason` so the audit trail explains why.
 */
export type EligibilityRowStatus =
  | 'ELIGIBLE'
  | 'EXCLUDED_ZERO_BALANCE'
  | 'EXCLUDED_BLOCKED_ACCOUNT'
  | 'EXCLUDED_BLOCKED_SHAREHOLDER'
  | 'EXCLUDED_INACTIVE_KYC'
  | 'EXCLUDED_UNKNOWN_ACCOUNT'
  | 'EXCLUDED_OTHER'

/**
 * Where the row's ownership data came from. Today this is always the
 * issuer's ledger (`LEDGER_AS_OF_RECORD_DATE`); the union exists so we
 * can extend later (DTC participant feeds, etc.) without re-wiring the
 * snapshot consumers.
 */
export type OwnershipSource = 'LEDGER_AS_OF_RECORD_DATE' | 'REGISTERED' | 'BENEFICIAL' | 'EXTERNAL_FEED'

export interface DividendEligibilityEntry {
  /** Issuer-scoped account row id. May be `null` for unmatched ledger holders. */
  accountId: string | null
  shareholderId: string | null
  securityId: string
  /** Decimal string. Always set; `"0"` rows are emitted as EXCLUDED_ZERO_BALANCE. */
  sharesHeld: string
  recordDate: string
  ownershipSource: OwnershipSource
  /** Stable business-id from the ledger (e.g. account_number) for traceability. */
  ownershipReference?: string
  eligibilityStatus: EligibilityRowStatus
  disqualificationReason?: string
}

export interface DividendEligibilitySnapshot {
  id: string
  dividendEventId: string
  issuerId: string
  securityId: string
  shareClassId?: string
  recordDate: string
  capturedAt: Date
  lockedAt?: Date
  holderCount: number
  excludedHolderCount: number
  /** Decimal string (supports fractional shares). */
  totalEligibleShares: string
  /** Frozen per-row roster — eligible + excluded entries with a reason. */
  snapshotPayload: DividendEligibilityEntry[]
  metadata: Record<string, unknown>
}

/**
 * Tax disposition snapshot for the entitlement at the moment of
 * calculation. `RESIDENT` and `TREATY` are placeholders for future
 * jurisdictional logic; today everything resolves to `RESIDENT` unless
 * the shareholder is missing tax info, in which case `MISSING_TAX_INFO`
 * surfaces both as a warning and on the entitlement row.
 */
export type DividendTaxStatus = 'RESIDENT' | 'TREATY' | 'MISSING_TAX_INFO' | 'BLOCKED' | 'NOT_APPLICABLE'

export interface DividendEntitlement {
  id: string
  dividendEventId: string
  eligibilitySnapshotId?: string
  accountId: string
  shareholderId: string
  /** Decimal string. */
  sharesHeld: string
  grossAmountCents: number
  withholdingCents: number
  netAmountCents: number
  withholdingPct: string
  /** Legacy: kept in sync with `grossAmountCents`. */
  amountCents: number
  /** Currency on the entitlement, copied from the dividend at calc time. */
  currency: string
  status: EntitlementStatus
  /** Tax-disposition snapshot at calc time (drives downstream withholding logic). */
  taxStatus: DividendTaxStatus
  /** ISO country code of the holder's tax residency at calc time. */
  taxResidency?: TaxResidency
  /** Status of the holder's tax form at calc time (W9, W8-BEN, ...). */
  taxFormStatus?: TaxFormStatus
  /** Treaty-reduced withholding pct, captured separately from the applied pct. */
  treatyRate?: string
  /** Stable code explaining why the resolved withholding rate was used. */
  withholdingReason?: WithholdingReason
  /**
   * Monotonic counter of how many times entitlements were (re)calculated
   * for this dividend at the moment this row was written. Useful for
   * filtering out stale rows after a force-recalc.
   */
  calculationVersion: number
  paymentMethod?: DividendPaymentMethod
  frozenAt?: Date
  paidAt?: Date
  paymentReference?: string
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export interface DividendApproval {
  id: string
  dividendEventId: string
  action: DividendApprovalAction
  actorId: string
  actorRole?: string
  decisionNotes?: string
  decidedAt: Date
  metadata: Record<string, unknown>
  createdAt: Date
}

export interface DividendPaymentBatch {
  id: string
  dividendEventId: string
  issuerId: string
  /** Human-readable, monotonically issued per dividend (e.g. `BATCH-001`). */
  batchNumber: string
  /** Currency captured at create time so downstream files don't have to reload. */
  currency: string
  /** Date when the batch is intended to disburse — surfaces on payment files / statements. */
  paymentDate: string
  method: DividendPaymentMethod
  status: DividendBatchStatus
  paymentCount: number
  totalGrossCents: number
  totalWithholdingCents: number
  totalNetCents: number
  /** Audit context — the user who created the batch (DRAFT row owner). */
  createdBy?: string
  scheduledAt?: Date
  approvedAt?: Date
  startedAt?: Date
  /** Set when the batch reaches `PROCESSED` / `COMPLETED` (legacy). */
  completedAt?: Date
  reconciledAt?: Date
  cancelledAt?: Date
  notes?: string
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export interface DividendPayment {
  id: string
  dividendEventId: string
  batchId?: string
  entitlementId: string
  accountId: string
  shareholderId: string
  grossAmountCents: number
  withholdingCents: number
  netAmountCents: number
  currency: string
  method: DividendPaymentMethod
  status: DividendPaymentStatus
  externalRef?: string
  failureReason?: string
  attemptNo: number
  /** Provider-supplied or caller-supplied dedupe key for `recordPayment` writes. */
  idempotencyKey?: string
  paidAt?: Date
  /** Set when the payment is matched to a reconciliation file entry. */
  reconciledAt?: Date
  /** Set when the payment is bounced back by the rail (e.g. ACH return code). */
  returnedAt?: Date
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

/**
 * Stable action keys the UI can use to render workflow buttons. Mirrors
 * the state machine in `dividends.payments.state.ts`. The `force`
 * variants are gated on internal-admin role.
 */
export type DividendBatchAction =
  | 'edit'
  | 'submit'
  | 'approve'
  | 'reject'
  | 'schedule'
  | 'forceSchedule'
  | 'markProcessing'
  | 'recordPayment'
  | 'bulkRecord'
  | 'reconcile'
  | 'cancel'

/**
 * Wire-format projection of a payment batch suitable for downstream
 * payment-file generation. Keeps amounts as scaled integer cents +
 * structured account info; the actual NACHA/SWIFT/check formatter
 * lives outside the dividend module so this is the stable handoff.
 */
export interface DividendBatchExport {
  batchId: string
  batchNumber: string
  dividendEventId: string
  issuerId: string
  currency: string
  paymentDate: string
  method: DividendPaymentMethod
  paymentCount: number
  totalNetCents: number
  totalGrossCents: number
  totalWithholdingCents: number
  generatedAt: string
  rows: DividendBatchExportRow[]
}

export interface DividendBatchExportRow {
  paymentId: string
  entitlementId: string
  shareholderId: string
  accountId: string
  grossAmountCents: number
  withholdingCents: number
  netAmountCents: number
  currency: string
  method: DividendPaymentMethod
  status: DividendPaymentStatus
  externalRef?: string
}

/**
 * Result row from a reconciliation import. The import service
 * matches by external ref or idempotency key and surfaces a per-row
 * outcome the UI can summarise back to the operator.
 */
export interface DividendReconciliationOutcome {
  paymentId: string
  /** What the import matched on. */
  matchedBy: 'EXTERNAL_REF' | 'IDEMPOTENCY_KEY' | 'PAYMENT_ID'
  previousStatus: DividendPaymentStatus
  newStatus: DividendPaymentStatus
  reconciledAt: string
}

export interface DividendReconciliationImportSummary {
  batchId: string
  totalEntries: number
  matched: number
  unmatched: number
  alreadyReconciled: number
  errors: number
  outcomes: DividendReconciliationOutcome[]
  unmatchedReferences: string[]
}

export interface DividendTaxWithholding {
  id: string
  dividendEventId: string
  entitlementId: string
  paymentId?: string
  shareholderId: string
  jurisdiction: string
  withholdingPct: string
  taxableAmountCents: number
  withholdingCents: number
  reason?: string
  metadata: Record<string, unknown>
  createdAt: Date
}

export interface DividendStatement {
  id: string
  dividendEventId: string
  entitlementId: string
  shareholderId: string
  accountId: string
  grossAmountCents: number
  withholdingCents: number
  netAmountCents: number
  currency: string
  statementDate: string
  status: DividendStatementStatus
  documentStorageKey?: string
  sentAt?: Date
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export interface DividendReinvestmentInstruction {
  id: string
  issuerId: string
  shareholderId: string
  accountId: string
  securityId: string
  shareClassId?: string
  enabled: boolean
  /** Decimal string, percent of cash entitlement to reinvest (0..100). */
  percentage: string
  effectiveFrom: string
  effectiveTo?: string
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

/* ====================================================================
 * Communications module — board-driven shareholder notices and
 * market announcements that accompany the dividend.
 * ================================================================== */

/**
 * Kind of communication. The platform doesn't render the document itself
 * — it simply tracks status + audit, with `documentRef` pointing at the
 * uploaded artifact (board resolution, tearsheet, press release, etc.).
 */
export type DividendCommunicationKind = 'BOARD_RESOLUTION' | 'SHAREHOLDER_NOTICE' | 'MARKET_ANNOUNCEMENT' | 'ISSUER_ANNOUNCEMENT'

export type DividendCommunicationStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'SENT' | 'CANCELLED'

export interface DividendCommunication {
  id: string
  dividendEventId: string
  issuerId: string
  kind: DividendCommunicationKind
  status: DividendCommunicationStatus
  subject?: string
  body?: string
  audience?: string
  channel?: 'EMAIL' | 'POSTAL' | 'PRESS' | 'PORTAL' | 'EDGAR'
  scheduledAt?: Date
  sentAt?: Date
  approvedAt?: Date
  cancelledAt?: Date
  documentRefs: DividendDocumentRef[]
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

/* ====================================================================
 * Fractional share handling
 * ================================================================== */

/**
 * Configurable rounding policies for fractional share handling.
 * Captured per-entitlement so the audit trail explains why a holder
 * received a particular amount.
 *
 * - `ROUND_DOWN` truncates towards zero (no payout for the fractional remainder).
 * - `ROUND_HALF_UP` rounds 0.5 up (banker's policy A).
 * - `ROUND_HALF_EVEN` rounds half-to-even (banker's policy B).
 * - `CASH_IN_LIEU` keeps the round-down share count and pays the
 *   fractional remainder as cash, valued at a configured price.
 */
export type FractionalSharePolicy = 'ROUND_DOWN' | 'ROUND_HALF_UP' | 'ROUND_HALF_EVEN' | 'CASH_IN_LIEU'

/**
 * Recorded adjustment per holder for a fractional-share dividend.
 * Stored separately from the entitlement so we can replay decisions
 * even if the rate / policy changes between calculations.
 */
export interface DividendFractionalAdjustment {
  id: string
  dividendEventId: string
  entitlementId: string
  shareholderId: string
  policy: FractionalSharePolicy
  /** Original fractional share count before policy applied (decimal string). */
  fractionalShares: string
  /** Whole shares awarded after the policy is applied. */
  wholeSharesIssued: number
  /** Cents added/subtracted from the cash entitlement as a result. */
  adjustmentCents: number
  /** Free-text rationale captured for the audit trail. */
  reason?: string
  metadata: Record<string, unknown>
  createdAt: Date
}

/* ====================================================================
 * DRIP execution records (the *result* of running DRIP, distinct from
 * the long-lived `DividendReinvestmentInstruction` which captures the
 * shareholder's standing election).
 * ================================================================== */

export type DividendReinvestmentStatus = 'DRAFT' | 'CALCULATED' | 'EXECUTED' | 'CANCELLED' | 'FAILED'

export interface DividendReinvestmentRecord {
  id: string
  dividendEventId: string
  entitlementId: string
  shareholderId: string
  accountId: string
  status: DividendReinvestmentStatus
  /** Net cash entitlement diverted into reinvestment (cents). */
  reinvestedAmountCents: number
  /** Reinvestment price per share, decimal string. */
  purchasePrice: string
  /** Whole shares issued. Fractional residual handled per `fractionalShareHandling`. */
  sharesIssued: string
  fractionalShareHandling: FractionalSharePolicy
  /** Cents paid out as residual cash when policy is CASH_IN_LIEU. */
  residualCashCents: number
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

/* ====================================================================
 * Tax workflow extensions
 * ================================================================== */

/** ISO 3166-1 alpha-2 country code (or 'UNKNOWN'). */
export type TaxResidency = string | 'UNKNOWN'

/**
 * Status of the shareholder's tax form on file. Used to decide whether
 * to apply the default jurisdictional withholding or the treaty rate.
 */
export type TaxFormStatus = 'NONE' | 'W9_ON_FILE' | 'W8BEN_ON_FILE' | 'W8BEN_E_ON_FILE' | 'EXPIRED' | 'REJECTED'

/**
 * Reason for the resolved withholding rate. `TREATY` indicates a
 * reduced rate from a tax treaty; `BACKUP` indicates default backup
 * withholding because no valid form is on file.
 */
export type WithholdingReason = 'DOMESTIC_NONE' | 'DOMESTIC_DEFAULT' | 'BACKUP' | 'FOREIGN_DEFAULT' | 'TREATY' | 'EXEMPT'

/* ====================================================================
 * Reconciliation exceptions
 * ================================================================== */

export type DividendReconciliationExceptionType =
  | 'AMOUNT_MISMATCH'
  | 'FAILED_PAYMENT'
  | 'RETURNED_PAYMENT'
  | 'MISSING_PAYMENT_REFERENCE'
  | 'DUPLICATE_PAYMENT'
  | 'SHAREHOLDER_RECORD_MISMATCH'
  | 'TAX_WITHHOLDING_MISMATCH'

export type DividendReconciliationExceptionStatus = 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'WAIVED'

export interface DividendReconciliationException {
  id: string
  dividendEventId: string
  batchId?: string
  paymentId?: string
  type: DividendReconciliationExceptionType
  status: DividendReconciliationExceptionStatus
  description: string
  expectedCents?: number
  observedCents?: number
  resolution?: string
  openedAt: Date
  resolvedAt?: Date
  metadata: Record<string, unknown>
}

/* ====================================================================
 * Workflow stepper — aggregate read API for the operator-facing UI.
 * Each step exposes a deterministic state so the UI can render check /
 * spinner / lock affordances.
 * ================================================================== */

export type DividendWorkflowStepKey =
  | 'BOARD_REVIEW'
  | 'KEY_DATES'
  | 'COMMUNICATIONS'
  | 'REGISTER_REVIEW'
  | 'ELIGIBILITY'
  | 'TAX'
  | 'FRACTIONAL'
  | 'DRIP_OR_CASH'
  | 'PAYMENT_EXECUTION'
  | 'RECONCILIATION'
  | 'ARCHIVE'

export type DividendWorkflowStepState = 'pending' | 'in_progress' | 'done' | 'blocked' | 'skipped'

export interface DividendWorkflowStep {
  key: DividendWorkflowStepKey
  label: string
  state: DividendWorkflowStepState
  /** Short summary the UI can render under the step label. */
  detail?: string
  /** Auditable timestamp the step reached its current state, if any. */
  reachedAt?: Date
  warnings: DividendWarning[]
}

export interface DividendWorkflowStepper {
  dividendEventId: string
  status: DividendStatus
  steps: DividendWorkflowStep[]
  /** Indexes the next step the operator should advance. */
  currentStepKey: DividendWorkflowStepKey | null
  generatedAt: string
}
