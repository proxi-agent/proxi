/**
 * Frontend-facing dividend domain types.
 *
 * These mirror the API contracts exposed by `apps/api/src/dividends/*` so the
 * UI can talk to the canonical workflow without re-deriving shapes per page.
 *
 * Money amounts use integer cents (matches `BigInt` cents on the API).
 * Decimal strings are kept as strings to preserve precision (e.g. share
 * counts, per-share rates, tax/treaty rates).
 */

export type DividendStatus =
  | 'APPROVED'
  | 'ARCHIVED'
  | 'CALCULATED'
  | 'CANCELLED'
  | 'CHANGES_REQUESTED'
  | 'DRAFT'
  | 'ELIGIBILITY_LOCKED'
  | 'PAID'
  | 'PARTIALLY_PAID'
  | 'PAYMENT_SCHEDULED'
  | 'PENDING_APPROVAL'
  | 'RECONCILED'
  | 'REJECTED'

export type DividendType = 'CASH' | 'RETURN_OF_CAPITAL' | 'SPECIAL_CASH' | 'STOCK'

export type DividendRateType = 'FIXED_AMOUNT' | 'PERCENTAGE' | 'PER_SHARE'

export type DividendAction =
  | 'approve'
  | 'archive'
  | 'calculate'
  | 'cancel'
  | 'edit'
  | 'lockEligibility'
  | 'reject'
  | 'requestChanges'
  | 'submit'

export type DividendWarningSeverity = 'ERROR' | 'INFO' | 'WARNING'

export type DividendWarning = {
  code: string
  detail?: string
  severity: DividendWarningSeverity
}

export type WorkflowStepKey =
  | 'ARCHIVE'
  | 'BOARD_REVIEW'
  | 'COMMUNICATIONS'
  | 'DRIP_OR_CASH'
  | 'ELIGIBILITY'
  | 'FRACTIONAL'
  | 'KEY_DATES'
  | 'PAYMENT_EXECUTION'
  | 'RECONCILIATION'
  | 'REGISTER_REVIEW'
  | 'TAX'

export type WorkflowStepState = 'BLOCKED' | 'DONE' | 'IN_PROGRESS' | 'PENDING' | 'SKIPPED'

export type WorkflowStep = {
  detail?: string
  key: WorkflowStepKey
  label: string
  reachedAt?: string
  state: WorkflowStepState
  warnings?: DividendWarning[]
}

export type DividendIssuer = {
  id: string
  name: string
  ticker?: string
}

export type DividendSecurity = {
  classLabel?: string
  cusip?: string
  id: string
  label: string
}

export type CalculatedSummary = {
  eligibleHolderCount: number
  excludedHolderCount: number
  grossAmountCents: number
  netAmountCents: number
  totalEligibleShares: string
  warnings: DividendWarning[]
  withholdingAmountCents: number
}

export type DividendEvent = {
  approvedAt?: string
  archivedAt?: string
  calculatedAt?: string
  calculatedSummary?: CalculatedSummary
  cancelledAt?: string
  changesRequestedAt?: string
  createdAt: string
  createdBy?: string
  currency: string
  declarationDate: string
  dividendType: DividendType
  exDividendDate?: string
  id: string
  issuer: DividendIssuer
  notes?: string
  paymentDate: string
  rateAmount: string
  rateType: DividendRateType
  recordDate: string
  rejectedAt?: string
  security: DividendSecurity
  status: DividendStatus
  totalPayableCents?: number
  updatedAt: string
  version: number
}

export type DividendEventDetail = DividendEvent & {
  allowedActions: DividendAction[]
  approvalHistory: ApprovalRecord[]
  workflow: WorkflowStep[]
  warnings: DividendWarning[]
}

export type ApprovalRecord = {
  actor: string
  at: string
  decision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED' | 'SUBMITTED'
  id: string
  reason?: string
}

export type EligibilityHolder = {
  accountId?: string
  disqualificationReason?: string
  excluded: boolean
  shareholderId: string
  shareholderName: string
  sharesHeld: string
  taxFormStatus?: TaxFormStatus
  taxResidency?: string
}

export type EligibilitySnapshot = {
  createdAt: string
  excludedHolderCount: number
  holders: EligibilityHolder[]
  id: string
  locked: boolean
  recordDate: string
  totalEligibleHolders: number
  totalEligibleShares: string
  warnings: DividendWarning[]
}

export type TaxFormStatus = 'EXPIRED' | 'MISSING' | 'PENDING' | 'UNKNOWN' | 'W8BEN_ON_FILE' | 'W9_ON_FILE'

export type WithholdingReason = 'BACKUP' | 'DOMESTIC_NONE' | 'FOREIGN_DEFAULT' | 'TREATY' | 'UNKNOWN'

export type EntitlementPaymentStatus = 'CANCELLED' | 'FAILED' | 'PAID' | 'PENDING' | 'PROCESSING' | 'RECONCILED' | 'RETURNED' | 'SCHEDULED'

export type Entitlement = {
  calculationVersion: number
  currency: string
  grossAmountCents: number
  id: string
  netAmountCents: number
  paymentMethod?: 'ACH' | 'CHECK' | 'DRIP' | 'WIRE'
  paymentStatus: EntitlementPaymentStatus
  shareholderId: string
  shareholderName: string
  sharesEligible: string
  taxFormStatus?: TaxFormStatus
  taxResidency?: string
  treatyRate?: string
  withholdingAmountCents: number
  withholdingReason?: WithholdingReason
}

export type PaymentBatchStatus =
  | 'APPROVED'
  | 'CANCELLED'
  | 'DRAFT'
  | 'PARTIALLY_FAILED'
  | 'PARTIALLY_PROCESSED'
  | 'PENDING_APPROVAL'
  | 'PROCESSED'
  | 'PROCESSING'
  | 'RECONCILED'
  | 'SCHEDULED'

export type PaymentStatus = 'CANCELLED' | 'FAILED' | 'PAID' | 'PENDING' | 'PROCESSING' | 'RECONCILED' | 'RETURNED' | 'SCHEDULED'

export type PaymentBatch = {
  batchNumber: string
  createdAt: string
  createdBy?: string
  currency: string
  dividendId: string
  grossTotalCents: number
  id: string
  netTotalCents: number
  paymentCount: number
  paymentDate: string
  status: PaymentBatchStatus
  withholdingTotalCents: number
}

export type PaymentRow = {
  currency: string
  entitlementId: string
  externalPaymentReference?: string
  failureReason?: string
  grossAmountCents: number
  id: string
  netAmountCents: number
  paidAt?: string
  paymentMethod: 'ACH' | 'CHECK' | 'DRIP' | 'WIRE'
  paymentStatus: PaymentStatus
  reconciledAt?: string
  shareholderId: string
  shareholderName: string
  withholdingAmountCents: number
}

export type PaymentBatchDetail = PaymentBatch & {
  payments: PaymentRow[]
  statusDistribution: Array<{ count: number; status: PaymentStatus }>
}

export type DividendAuditEvent = {
  action: string
  actor: string
  actorRole?: string
  at: string
  detail?: string
  id: string
  meta?: Record<string, string>
}

export type DividendDashboardData = {
  byStatus: Array<{ count: number; status: DividendStatus }>
  failedReturnedCount: number
  pendingApprovals: number
  recentlyCompleted: DividendEvent[]
  requiringAttention: DividendEvent[]
  totalDeclaredCents: number
  totalPayableCents: number
  upcomingPayments: DividendEvent[]
}

export type DividendFormIssuerOption = {
  id: string
  label: string
}

export type DividendFormSecurityOption = {
  id: string
  issuerId: string
  label: string
}

export type DeclarationsFilter = {
  dividendType?: DividendType
  endDate?: string
  issuerId?: string
  query?: string
  securityId?: string
  startDate?: string
  status?: DividendStatus
}
