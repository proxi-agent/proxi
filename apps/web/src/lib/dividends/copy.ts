import type { StatusTone } from '@/components/ui'

import type {
  DividendAction,
  DividendStatus,
  DividendType,
  DividendWarningSeverity,
  EntitlementPaymentStatus,
  PaymentBatchStatus,
  PaymentStatus,
  TaxFormStatus,
  WithholdingReason,
  WorkflowStepKey,
  WorkflowStepState,
} from './types'

export const DIVIDEND_STATUS_LABEL: Record<DividendStatus, string> = {
  APPROVED: 'Approved',
  ARCHIVED: 'Archived',
  CALCULATED: 'Calculated',
  CANCELLED: 'Cancelled',
  CHANGES_REQUESTED: 'Changes requested',
  DRAFT: 'Draft',
  ELIGIBILITY_LOCKED: 'Eligibility locked',
  PAID: 'Paid',
  PARTIALLY_PAID: 'Partially paid',
  PAYMENT_SCHEDULED: 'Payment scheduled',
  PENDING_APPROVAL: 'Pending approval',
  RECONCILED: 'Reconciled',
  REJECTED: 'Rejected',
}

export const DIVIDEND_STATUS_TONE: Record<DividendStatus, StatusTone> = {
  APPROVED: 'positive',
  ARCHIVED: 'neutral',
  CALCULATED: 'info',
  CANCELLED: 'danger',
  CHANGES_REQUESTED: 'warning',
  DRAFT: 'neutral',
  ELIGIBILITY_LOCKED: 'info',
  PAID: 'positive',
  PARTIALLY_PAID: 'warning',
  PAYMENT_SCHEDULED: 'brand',
  PENDING_APPROVAL: 'warning',
  RECONCILED: 'positive',
  REJECTED: 'danger',
}

export const DIVIDEND_TYPE_LABEL: Record<DividendType, string> = {
  CASH: 'Cash',
  RETURN_OF_CAPITAL: 'Return of capital',
  SPECIAL_CASH: 'Special cash',
  STOCK: 'Stock',
}

export const RATE_TYPE_LABEL: Record<string, string> = {
  FIXED_AMOUNT: 'Fixed amount',
  PERCENTAGE: 'Percentage',
  PER_SHARE: 'Per share',
}

export const ACTION_LABEL: Record<DividendAction, string> = {
  approve: 'Approve',
  archive: 'Archive',
  calculate: 'Calculate entitlements',
  cancel: 'Cancel',
  edit: 'Edit draft',
  lockEligibility: 'Lock eligibility',
  reject: 'Reject',
  requestChanges: 'Request changes',
  submit: 'Submit for approval',
}

export const ACTION_ICON: Record<DividendAction, string> = {
  approve: 'check',
  archive: 'lock',
  calculate: 'sparkles',
  cancel: 'x',
  edit: 'pencil',
  lockEligibility: 'shield-check',
  reject: 'x-circle',
  requestChanges: 'message-square',
  submit: 'send',
}

export const STEP_LABEL: Record<WorkflowStepKey, string> = {
  ARCHIVE: 'Archive',
  BOARD_REVIEW: 'Board review',
  COMMUNICATIONS: 'Notices / Announcement',
  DRIP_OR_CASH: 'Cash or DRIP',
  ELIGIBILITY: 'Eligibility',
  FRACTIONAL: 'Fractional adjustments',
  KEY_DATES: 'Key dates',
  PAYMENT_EXECUTION: 'Payment execution',
  RECONCILIATION: 'Reconciliation',
  REGISTER_REVIEW: 'Register review',
  TAX: 'Tax / Withholding',
}

export const STEP_ORDER: WorkflowStepKey[] = [
  'BOARD_REVIEW',
  'KEY_DATES',
  'COMMUNICATIONS',
  'REGISTER_REVIEW',
  'ELIGIBILITY',
  'TAX',
  'FRACTIONAL',
  'DRIP_OR_CASH',
  'PAYMENT_EXECUTION',
  'RECONCILIATION',
  'ARCHIVE',
]

/** Stepper state to the {@link StepProgress} primitive's tri-state vocabulary. */
export const STEP_PRIMITIVE_STATE: Record<WorkflowStepState, 'current' | 'done' | 'upcoming'> = {
  BLOCKED: 'current',
  DONE: 'done',
  IN_PROGRESS: 'current',
  PENDING: 'upcoming',
  SKIPPED: 'upcoming',
}

export const BATCH_STATUS_LABEL: Record<PaymentBatchStatus, string> = {
  APPROVED: 'Approved',
  CANCELLED: 'Cancelled',
  DRAFT: 'Draft',
  PARTIALLY_FAILED: 'Partially failed',
  PARTIALLY_PROCESSED: 'Partially processed',
  PENDING_APPROVAL: 'Pending approval',
  PROCESSED: 'Processed',
  PROCESSING: 'Processing',
  RECONCILED: 'Reconciled',
  SCHEDULED: 'Scheduled',
}

export const BATCH_STATUS_TONE: Record<PaymentBatchStatus, StatusTone> = {
  APPROVED: 'positive',
  CANCELLED: 'danger',
  DRAFT: 'neutral',
  PARTIALLY_FAILED: 'warning',
  PARTIALLY_PROCESSED: 'warning',
  PENDING_APPROVAL: 'warning',
  PROCESSED: 'positive',
  PROCESSING: 'info',
  RECONCILED: 'positive',
  SCHEDULED: 'brand',
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  CANCELLED: 'Cancelled',
  FAILED: 'Failed',
  PAID: 'Paid',
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  RECONCILED: 'Reconciled',
  RETURNED: 'Returned',
  SCHEDULED: 'Scheduled',
}

export const PAYMENT_STATUS_TONE: Record<PaymentStatus, StatusTone> = {
  CANCELLED: 'neutral',
  FAILED: 'danger',
  PAID: 'positive',
  PENDING: 'neutral',
  PROCESSING: 'info',
  RECONCILED: 'positive',
  RETURNED: 'danger',
  SCHEDULED: 'brand',
}

export const ENTITLEMENT_STATUS_LABEL: Record<EntitlementPaymentStatus, string> = PAYMENT_STATUS_LABEL
export const ENTITLEMENT_STATUS_TONE: Record<EntitlementPaymentStatus, StatusTone> = PAYMENT_STATUS_TONE

export const TAX_FORM_LABEL: Record<TaxFormStatus, string> = {
  EXPIRED: 'Form expired',
  MISSING: 'Missing form',
  PENDING: 'Form pending',
  UNKNOWN: 'Unknown',
  W8BEN_ON_FILE: 'W-8BEN on file',
  W9_ON_FILE: 'W-9 on file',
}

export const TAX_FORM_TONE: Record<TaxFormStatus, StatusTone> = {
  EXPIRED: 'danger',
  MISSING: 'warning',
  PENDING: 'info',
  UNKNOWN: 'warning',
  W8BEN_ON_FILE: 'positive',
  W9_ON_FILE: 'positive',
}

export const WITHHOLDING_REASON_LABEL: Record<WithholdingReason, string> = {
  BACKUP: 'Backup withholding',
  DOMESTIC_NONE: 'Domestic — none',
  FOREIGN_DEFAULT: 'Foreign — default rate',
  TREATY: 'Treaty rate',
  UNKNOWN: 'Unknown',
}

export const WARNING_TONE: Record<DividendWarningSeverity, StatusTone> = {
  ERROR: 'danger',
  INFO: 'info',
  WARNING: 'warning',
}

export const WARNING_LABEL: Record<string, string> = {
  HOLDER_BLOCKED: 'Holder is blocked',
  HOLDER_EXCLUDED: 'Holder excluded from snapshot',
  MISSING_PAYMENT_INSTRUCTIONS: 'Missing payment instructions',
  MISSING_TAX_FORM: 'Missing tax form',
  PAYMENT_DATE_BEFORE_RECORD_DATE: 'Payment date before record date',
  PAYMENT_DATE_TOO_SOON: 'Payment date is unusually soon after record date',
  RECORD_DATE_BEFORE_DECLARATION: 'Record date before declaration',
  RECORD_DATE_PAST: 'Record date is in the past',
  UNKNOWN_TAX_RESIDENCY: 'Unknown tax residency',
  UNSUPPORTED_DIVIDEND_TYPE: 'Unsupported dividend type for cash workflow',
  ZERO_OR_NEGATIVE_HOLDINGS: 'Zero or negative holdings',
}

export const RATE_TYPE_OPTIONS: Array<{ label: string; value: 'FIXED_AMOUNT' | 'PERCENTAGE' | 'PER_SHARE' }> = [
  { label: 'Fixed amount', value: 'FIXED_AMOUNT' },
  { label: 'Percentage', value: 'PERCENTAGE' },
  { label: 'Per share', value: 'PER_SHARE' },
]

export const DIVIDEND_TYPE_OPTIONS: Array<{ label: string; value: DividendType }> = [
  { label: 'Cash', value: 'CASH' },
  { label: 'Return of capital', value: 'RETURN_OF_CAPITAL' },
  { label: 'Special cash', value: 'SPECIAL_CASH' },
  { label: 'Stock', value: 'STOCK' },
]

export const STATUS_OPTIONS: Array<{ label: string; value: DividendStatus }> = (Object.keys(DIVIDEND_STATUS_LABEL) as DividendStatus[])
  .sort((a, b) => DIVIDEND_STATUS_LABEL[a].localeCompare(DIVIDEND_STATUS_LABEL[b]))
  .map(value => ({ label: DIVIDEND_STATUS_LABEL[value], value }))

export const TOOLTIPS: Record<string, string> = {
  exDividendDate:
    'The first trading day a buyer of the security is no longer entitled to the upcoming dividend. Typically one business day before the record date.',
  paymentDate: 'The date funds are released to eligible shareholders.',
  perShareRate: 'Cash amount paid per outstanding share on the record date.',
  recordDate: 'Anyone holding shares on this date is eligible to receive this dividend.',
  withholding:
    'Tax withheld from the gross dividend before payment. Domestic shareholders without a W-9 face backup withholding; foreign shareholders are subject to default 30% unless a treaty rate applies.',
}

/** Format a money amount in integer cents into localized currency. */
export function formatCents(cents: number, currency = 'USD'): string {
  const amount = cents / 100
  return new Intl.NumberFormat('en-US', {
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(amount)
}

/** Compact currency formatting (eg. $3.57M, $42.4K, $123). */
export function formatCentsCompact(cents: number, currency = 'USD'): string {
  const amount = cents / 100
  if (Math.abs(amount) >= 1_000_000) return `${currency === 'USD' ? '$' : ''}${(amount / 1_000_000).toFixed(2)}M`
  if (Math.abs(amount) >= 1_000) return `${currency === 'USD' ? '$' : ''}${(amount / 1_000).toFixed(1)}K`
  return formatCents(cents, currency)
}

export function formatShares(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (Number.isNaN(num)) return String(value)
  return num.toLocaleString('en-US', { maximumFractionDigits: 4 })
}

export function formatDate(iso?: string, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', ...opts })
}

export function formatDateTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatRelative(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const delta = d.getTime() - Date.now()
  const days = Math.round(delta / (1000 * 60 * 60 * 24))
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  if (days > 0) return `in ${days}d`
  return `${Math.abs(days)}d ago`
}
