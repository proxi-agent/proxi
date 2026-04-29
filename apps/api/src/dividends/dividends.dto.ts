import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'

import { PaginationQueryDto } from '../common/pagination.js'

import type {
  DividendApprovalAction,
  DividendBatchStatus,
  DividendKind,
  DividendPaymentMethod,
  DividendPaymentStatus,
  DividendRateType,
  DividendStatementStatus,
  DividendStatus,
  EntitlementStatus,
} from './dividends.types.js'

const STATUSES: DividendStatus[] = [
  'APPROVED',
  'ARCHIVED',
  'CALCULATED',
  'CANCELLED',
  'CHANGES_REQUESTED',
  'DECLARED',
  'DRAFT',
  'ELIGIBILITY_LOCKED',
  'PAID',
  'PARTIALLY_PAID',
  'PAYABLE',
  'PAYMENT_SCHEDULED',
  'PENDING_APPROVAL',
  'RECONCILED',
  'RECORD_DATE_SET',
  'REJECTED',
  'SNAPSHOTTED',
]

const KINDS: DividendKind[] = ['CASH', 'RETURN_OF_CAPITAL', 'SCRIP', 'SPECIAL', 'STOCK']
const RATE_TYPES: DividendRateType[] = ['FIXED_AMOUNT', 'PERCENTAGE', 'PER_SHARE']
const ENTITLEMENT_STATUSES: EntitlementStatus[] = ['CALCULATED', 'FAILED', 'HELD', 'PAID', 'PENDING', 'REVERSED', 'VOIDED']
const PAYMENT_METHODS: DividendPaymentMethod[] = ['ACH', 'CHECK', 'INTERNAL_CREDIT', 'STOCK', 'WIRE']
const PAYMENT_STATUSES: DividendPaymentStatus[] = [
  'CANCELLED',
  'FAILED',
  'PAID',
  'PENDING',
  'PROCESSING',
  'RECONCILED',
  'RETURNED',
  'SCHEDULED',
  'SENT',
  'SETTLED',
]
const BATCH_STATUSES: DividendBatchStatus[] = [
  'APPROVED',
  'CANCELLED',
  'COMPLETED',
  'DRAFT',
  'FAILED',
  'PARTIALLY_FAILED',
  'PARTIALLY_PROCESSED',
  'PENDING_APPROVAL',
  'PROCESSED',
  'PROCESSING',
  'RECONCILED',
  'SCHEDULED',
]
/** Statuses an operator can record on a single payment via `recordPayment`. */
const RECORDABLE_PAYMENT_STATUSES: DividendPaymentStatus[] = [
  'CANCELLED',
  'FAILED',
  'PAID',
  'PROCESSING',
  'RETURNED',
  'SCHEDULED',
  'SENT',
  'SETTLED',
]
const STATEMENT_STATUSES: DividendStatementStatus[] = ['DRAFT', 'READY', 'SENT', 'VOIDED']
const APPROVAL_ACTIONS: DividendApprovalAction[] = ['APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'REQUESTED', 'REVOKED']

const DECIMAL_REGEX = /^-?\d+(\.\d+)?$/
const NON_NEGATIVE_DECIMAL_REGEX = /^\d+(\.\d+)?$/

export class DividendDocumentRefDto {
  @IsString()
  @MinLength(1)
  storageKey!: string

  @IsOptional()
  @IsString()
  fileName?: string

  @IsOptional()
  @IsString()
  contentType?: string

  @IsOptional()
  @IsString()
  description?: string
}

export class CreateDividendDto {
  @IsString()
  issuerId!: string

  @IsString()
  securityId!: string

  @IsOptional()
  @IsString()
  shareClassId?: string

  @IsOptional()
  @IsIn(KINDS)
  kind?: DividendKind

  @IsOptional()
  @IsIn(RATE_TYPES)
  rateType?: DividendRateType

  /**
   * Decimal-string rate amount (e.g. "0.25"). Interpretation depends on
   * `rateType`. Use a string so we don't lose precision through `Number`.
   */
  @IsOptional()
  @IsString()
  @Matches(NON_NEGATIVE_DECIMAL_REGEX, { message: 'rateAmount must be a non-negative decimal string' })
  rateAmount?: string

  /**
   * Legacy convenience: if provided and `rateType` is `PER_SHARE` (or
   * unset), `rateAmount` is computed from cents.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  ratePerShareCents?: number

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string

  @IsOptional()
  @IsString()
  @Matches(NON_NEGATIVE_DECIMAL_REGEX, { message: 'withholdingDefaultPct must be a non-negative decimal string' })
  withholdingDefaultPct?: string

  @IsDateString()
  declarationDate!: string

  @IsDateString()
  recordDate!: string

  @IsOptional()
  @IsDateString()
  exDividendDate?: string

  @IsDateString()
  paymentDate!: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description?: string

  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  notes?: string

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => DividendDocumentRefDto)
  supportingDocuments?: DividendDocumentRefDto[]

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class UpdateDividendDto {
  /**
   * Optimistic concurrency token. When supplied, the update is rejected
   * with HTTP 409 if the row's `version` no longer matches — protecting
   * against lost updates when two reviewers edit the same draft.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  expectedVersion?: number

  @IsOptional()
  @IsIn(KINDS)
  kind?: DividendKind

  @IsOptional()
  @IsIn(RATE_TYPES)
  rateType?: DividendRateType

  @IsOptional()
  @IsString()
  @Matches(NON_NEGATIVE_DECIMAL_REGEX)
  rateAmount?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  ratePerShareCents?: number

  @IsOptional()
  @IsString()
  currency?: string

  @IsOptional()
  @IsString()
  @Matches(NON_NEGATIVE_DECIMAL_REGEX)
  withholdingDefaultPct?: string

  @IsOptional()
  @IsDateString()
  declarationDate?: string

  @IsOptional()
  @IsDateString()
  recordDate?: string

  @IsOptional()
  @IsDateString()
  exDividendDate?: string

  @IsOptional()
  @IsDateString()
  paymentDate?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  notes?: string

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => DividendDocumentRefDto)
  supportingDocuments?: DividendDocumentRefDto[]

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class SubmitForApprovalDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  expectedVersion?: number

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  decisionNotes?: string

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class ApproveDividendDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  expectedVersion?: number

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  decisionNotes?: string

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class RejectDividendDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2_000)
  reason!: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  expectedVersion?: number

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class RequestChangesDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2_000)
  reason!: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  expectedVersion?: number

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class CalculateEntitlementsDto {
  /**
   * Optional override map of `{ holderAccountNumber: pct }` so issuers
   * can apply jurisdiction-specific withholding without changing the
   * default in the declaration.
   */
  @IsOptional()
  @IsObject()
  withholdingOverrides?: Record<string, string>

  /**
   * Internal-admin override. Required (along with `reason`) to
   * recalculate after the dividend has reached `PAYMENT_SCHEDULED`.
   * Ignored otherwise.
   */
  @IsOptional()
  @IsBoolean()
  force?: boolean

  /** Required when `force` is true; recorded on the audit event. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2_000)
  reason?: string

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class CreatePaymentBatchDto {
  @IsOptional()
  @IsIn(PAYMENT_METHODS)
  method?: DividendPaymentMethod

  /** Override the dividend's payment date for this batch. */
  @IsOptional()
  @IsDateString()
  paymentDate?: string

  @IsOptional()
  @IsDateString()
  scheduledAt?: string

  /**
   * Restrict the batch to a subset of entitlement ids. Useful when
   * splitting a run by region/method. Required when creating a
   * second batch for the same dividend (otherwise the service
   * refuses to create it because the entitlements are already
   * assigned to a non-terminal batch).
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10_000)
  @IsString({ each: true })
  entitlementIds?: string[]

  /**
   * Optional UI-supplied label. The service issues `BATCH-NNN` if
   * not provided, scoped to the dividend.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  batchNumber?: string

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  notes?: string

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

/** Submits a `DRAFT` batch to `PENDING_APPROVAL`. */
export class SubmitBatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  decisionNotes?: string

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

/** Approves or rejects a batch in `PENDING_APPROVAL`. */
export class ApproveBatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  decisionNotes?: string

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class RejectBatchDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2_000)
  reason!: string

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class ScheduleBatchDto {
  @IsOptional()
  @IsDateString()
  scheduledAt?: string

  /**
   * Set when an internal admin needs to schedule despite warnings
   * (e.g. missing payment instructions on some payments). A reason
   * is required so the override is auditable.
   */
  @IsOptional()
  @IsBoolean()
  force?: boolean

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2_000)
  reason?: string
}

export class MarkBatchProcessingDto {
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class CancelBatchDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2_000)
  reason?: string

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class RecordPaymentDto {
  @IsString()
  paymentId!: string

  @IsIn(RECORDABLE_PAYMENT_STATUSES)
  status!: DividendPaymentStatus

  @IsOptional()
  @IsString()
  @MaxLength(256)
  externalRef?: string

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  failureReason?: string

  /**
   * Caller-supplied dedupe key. Re-applying the same key with the
   * same status is a no-op; conflicting status under the same key
   * raises a `ConflictException`. Mirrors the convention used by
   * payment providers (Stripe-style) so we can pass it through.
   */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class BulkRecordPaymentsDto {
  @IsArray()
  @ArrayMaxSize(10_000)
  @ValidateNested({ each: true })
  @Type(() => RecordPaymentDto)
  results!: RecordPaymentDto[]

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class ReconcileBatchDto {
  /**
   * Per-payment reconciliation entries. Each entry should reference
   * the payment by id, external_ref, or idempotency_key. Entries
   * marked `success: true` move the payment to RECONCILED; failures
   * surface in the import summary so an operator can resolve them.
   */
  @IsArray()
  @ArrayMaxSize(10_000)
  @ValidateNested({ each: true })
  @Type(() => ReconciliationEntryDto)
  entries!: ReconciliationEntryDto[]

  @IsOptional()
  @IsString()
  @MaxLength(256)
  source?: string

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  notes?: string
}

export class ReconciliationEntryDto {
  @IsOptional()
  @IsString()
  paymentId?: string

  @IsOptional()
  @IsString()
  externalRef?: string

  @IsOptional()
  @IsString()
  idempotencyKey?: string

  @IsBoolean()
  success!: boolean

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  failureReason?: string

  @IsOptional()
  @IsString()
  @MaxLength(128)
  reconciledAmount?: string

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class MarkPaidDto {
  @IsString()
  entitlementId!: string

  @IsOptional()
  @IsString()
  paymentReference?: string

  @IsOptional()
  @IsIn(PAYMENT_METHODS)
  method?: DividendPaymentMethod

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class CancelDividendDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2_000)
  reason!: string

  /**
   * Required when cancelling a dividend that has already entered payment
   * processing (PAYMENT_SCHEDULED / PARTIALLY_PAID). The actor must also
   * hold the `agent.admin` permission; otherwise the request is rejected
   * regardless of this flag.
   */
  @IsOptional()
  @IsBoolean()
  force?: boolean

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  expectedVersion?: number

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class UpsertReinvestmentInstructionDto {
  @IsString()
  issuerId!: string

  @IsString()
  shareholderId!: string

  @IsString()
  accountId!: string

  @IsString()
  securityId!: string

  @IsOptional()
  @IsString()
  shareClassId?: string

  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  percentage?: number

  @IsDateString()
  effectiveFrom!: string

  @IsOptional()
  @IsDateString()
  effectiveTo?: string

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class GenerateStatementsDto {
  /** When omitted, generates statements for every PAID entitlement. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  entitlementIds?: string[]

  @IsOptional()
  @IsDateString()
  statementDate?: string

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

// ----- query DTOs -----

export class DividendListQuery extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  issuerId?: string

  @IsOptional()
  @IsString()
  securityId?: string

  @IsOptional()
  @IsIn(STATUSES)
  status?: DividendStatus

  @IsOptional()
  @IsIn(KINDS)
  kind?: DividendKind

  @IsOptional()
  @IsDateString()
  fromPaymentDate?: string

  @IsOptional()
  @IsDateString()
  toPaymentDate?: string
}

export class EntitlementListQuery extends PaginationQueryDto {
  @IsOptional()
  @IsIn(ENTITLEMENT_STATUSES)
  status?: EntitlementStatus

  @IsOptional()
  @IsString()
  accountId?: string

  @IsOptional()
  @IsString()
  shareholderId?: string
}

export class PaymentListQuery extends PaginationQueryDto {
  @IsOptional()
  @IsIn(PAYMENT_STATUSES)
  status?: DividendPaymentStatus

  @IsOptional()
  @IsString()
  batchId?: string

  @IsOptional()
  @IsString()
  shareholderId?: string

  @IsOptional()
  @IsString()
  accountId?: string
}

export class BatchListQuery extends PaginationQueryDto {
  @IsOptional()
  @IsIn(BATCH_STATUSES)
  status?: DividendBatchStatus
}

export class StatementListQuery extends PaginationQueryDto {
  @IsOptional()
  @IsIn(STATEMENT_STATUSES)
  status?: DividendStatementStatus

  @IsOptional()
  @IsString()
  shareholderId?: string
}

export class ApprovalListQuery extends PaginationQueryDto {
  @IsOptional()
  @IsIn(APPROVAL_ACTIONS)
  action?: DividendApprovalAction
}

// ----------------------------------------------------------------------
// Communications module
// ----------------------------------------------------------------------

const COMMUNICATION_KINDS = ['BOARD_RESOLUTION', 'ISSUER_ANNOUNCEMENT', 'MARKET_ANNOUNCEMENT', 'SHAREHOLDER_NOTICE'] as const
const COMMUNICATION_CHANNELS = ['EDGAR', 'EMAIL', 'PORTAL', 'POSTAL', 'PRESS'] as const

export class CommunicationDocumentRefDto {
  @IsString()
  storageKey!: string

  @IsString()
  fileName!: string

  @IsOptional()
  @IsString()
  contentType?: string

  @IsOptional()
  @IsString()
  description?: string
}

export class CreateCommunicationDto {
  @IsIn(COMMUNICATION_KINDS as unknown as string[])
  kind!: (typeof COMMUNICATION_KINDS)[number]

  @IsOptional()
  @IsString()
  @MaxLength(255)
  subject?: string

  @IsOptional()
  @IsString()
  body?: string

  @IsOptional()
  @IsString()
  audience?: string

  @IsOptional()
  @IsIn(COMMUNICATION_CHANNELS as unknown as string[])
  channel?: (typeof COMMUNICATION_CHANNELS)[number]

  @IsOptional()
  @IsDateString()
  scheduledAt?: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommunicationDocumentRefDto)
  documentRefs?: CommunicationDocumentRefDto[]

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class UpdateCommunicationDto {
  @IsOptional() @IsString() @MaxLength(255) subject?: string
  @IsOptional() @IsString() body?: string
  @IsOptional() @IsString() audience?: string
  @IsOptional() @IsIn(COMMUNICATION_CHANNELS as unknown as string[]) channel?: (typeof COMMUNICATION_CHANNELS)[number]
  @IsOptional() @IsDateString() scheduledAt?: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommunicationDocumentRefDto)
  documentRefs?: CommunicationDocumentRefDto[]

  @IsOptional() @IsObject() metadata?: Record<string, unknown>
}

export class SubmitCommunicationDto {
  @IsOptional() @IsString() reason?: string
}

export class ApproveCommunicationDto {
  @IsOptional() @IsString() decisionNotes?: string
}

export class SendCommunicationDto {
  @IsOptional() @IsDateString() sentAt?: string
  @IsOptional() @IsString() reference?: string
}

export class CancelCommunicationDto {
  @IsString() @MinLength(3) reason!: string
}

// ----------------------------------------------------------------------
// Fractional adjustments
// ----------------------------------------------------------------------

const FRACTIONAL_POLICIES = ['CASH_IN_LIEU', 'ROUND_DOWN', 'ROUND_HALF_EVEN', 'ROUND_HALF_UP'] as const

export class ApplyFractionalAdjustmentsDto {
  @IsIn(FRACTIONAL_POLICIES as unknown as string[])
  policy!: (typeof FRACTIONAL_POLICIES)[number]

  /** Required for CASH_IN_LIEU. Cents per share used to value the residual. */
  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number

  @IsOptional()
  @IsString()
  reason?: string
}

// ----------------------------------------------------------------------
// DRIP execution
// ----------------------------------------------------------------------

export class ExecuteDripDto {
  /**
   * Reinvestment price per share, decimal string. The DRIP will divide
   * each electing holder's net entitlement by this price to determine
   * the share count.
   */
  @IsString()
  @Matches(DECIMAL_REGEX, { message: 'purchasePrice must be a decimal string' })
  purchasePrice!: string

  /** Same fractional policy as cash dividends. Defaults to CASH_IN_LIEU. */
  @IsOptional()
  @IsIn(FRACTIONAL_POLICIES as unknown as string[])
  fractionalShareHandling?: (typeof FRACTIONAL_POLICIES)[number]
}

// ----------------------------------------------------------------------
// Reconciliation exceptions
// ----------------------------------------------------------------------

const EXCEPTION_TYPES = [
  'AMOUNT_MISMATCH',
  'DUPLICATE_PAYMENT',
  'FAILED_PAYMENT',
  'MISSING_PAYMENT_REFERENCE',
  'RETURNED_PAYMENT',
  'SHAREHOLDER_RECORD_MISMATCH',
  'TAX_WITHHOLDING_MISMATCH',
] as const

export class OpenReconciliationExceptionDto {
  @IsIn(EXCEPTION_TYPES as unknown as string[])
  type!: (typeof EXCEPTION_TYPES)[number]

  @IsString() @MinLength(3) description!: string

  @IsOptional() @IsString() batchId?: string
  @IsOptional() @IsString() paymentId?: string

  @IsOptional() @IsInt() expectedCents?: number
  @IsOptional() @IsInt() observedCents?: number

  @IsOptional() @IsObject() metadata?: Record<string, unknown>
}

export class ResolveReconciliationExceptionDto {
  @IsIn(['INVESTIGATING', 'RESOLVED', 'WAIVED'] as unknown as string[])
  status!: 'INVESTIGATING' | 'RESOLVED' | 'WAIVED'

  @IsOptional() @IsString() resolution?: string
  @IsOptional() @IsObject() metadata?: Record<string, unknown>
}

// ----------------------------------------------------------------------
// Archive
// ----------------------------------------------------------------------

export class ArchiveDividendDto {
  @IsOptional() @IsString() reason?: string
}
