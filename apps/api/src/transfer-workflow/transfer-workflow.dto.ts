import { Type } from 'class-transformer'
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator'

import { PaginationQueryDto } from '../common/pagination.js'

const TRANSFER_INTAKE_METHODS = ['API', 'DOCUMENT_UPLOAD', 'GUIDED_ENTRY', 'LEGACY_IMPORT'] as const
const TRANSFER_KINDS = ['ADJUSTMENT', 'CANCELLATION', 'ISSUANCE', 'TRANSFER'] as const
const TRANSFER_LIFECYCLE_STAGES = ['APPROVAL', 'CLOSED', 'INTAKE', 'REVIEW', 'SETTLEMENT'] as const
const TRANSFER_PRIORITIES = ['HIGH', 'LOW', 'STANDARD', 'URGENT'] as const
const TRANSFER_STATES = ['APPROVED', 'CANCELLED', 'DRAFT', 'NEEDS_INFO', 'REJECTED', 'SETTLED', 'SUBMITTED', 'UNDER_REVIEW'] as const

type TransferIntakeMethod = (typeof TRANSFER_INTAKE_METHODS)[number]
type TransferKind = (typeof TRANSFER_KINDS)[number]
type TransferLifecycleStage = (typeof TRANSFER_LIFECYCLE_STAGES)[number]
type TransferPriority = (typeof TRANSFER_PRIORITIES)[number]
type TransferState = (typeof TRANSFER_STATES)[number]

export class CreateTransferRequestDto {
  @IsString()
  issuerId!: string

  @IsString()
  securityId!: string

  @IsString()
  shareClassId!: string

  @IsOptional()
  @IsString()
  fromAccountId?: string

  @IsOptional()
  @IsString()
  toAccountId?: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number

  @IsOptional()
  @IsIn(TRANSFER_KINDS)
  kind?: TransferKind

  @IsOptional()
  @IsIn(TRANSFER_INTAKE_METHODS)
  intakeMethod?: TransferIntakeMethod

  @IsOptional()
  @IsIn(TRANSFER_PRIORITIES)
  priority?: TransferPriority

  @IsOptional()
  @IsString()
  idempotencyKey?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(32)
  evidenceRequired?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(32)
  evidenceSubmitted?: string[]

  /**
   * If true, the request is created in SUBMITTED rather than DRAFT state.
   * Convenience for portal flows that file and submit in one step.
   */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  submit?: boolean
}

export class StartReviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  assignedReviewerId?: string

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string
}

export class RequestInfoDto {
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  reason!: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(32)
  missingEvidence?: string[]

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string
}

export class ResubmitDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(32)
  evidenceSubmitted?: string[]

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string
}

export class ApproveTransferDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string
}

export class RejectTransferDto {
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  reason!: string

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string
}

export class SettleTransferDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string
}

export class CancelTransferDto {
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  reason!: string
}

const CASE_TYPES = [
  'adjustment',
  'cancellation',
  'estate',
  'fiduciary',
  'gift',
  'issuance',
  'restricted_shares',
  'special_situation',
  'standard_individual',
] as const
const BRANCHES = [
  'adverse_claim',
  'deceased_owner',
  'issuer_legal_review',
  'normal',
  'restriction_review',
  'stop_transfer_order',
  'supplemental_info',
] as const
const RESTRICTION_CATEGORIES = ['legend', 'lock_up', 'other', 'representation_letter', 'rule_144'] as const
const SETTLEMENT_STEP_CODES = [
  'cancel_old_position',
  'confirm_prior_cancellation',
  'generate_drs_statement',
  'issue_new_position',
  'record_tax_withholding',
  'update_fast_position',
  'validate_registration',
  'validate_tax_docs',
] as const

export class IntakeTransferDto {
  @IsOptional()
  @IsIn(CASE_TYPES)
  caseType?: (typeof CASE_TYPES)[number]

  @IsOptional()
  @IsIn(['api', 'form_upload', 'manual', 'portal'])
  intakeSource?: 'api' | 'form_upload' | 'manual' | 'portal'

  @IsOptional()
  @IsString()
  @MaxLength(200)
  destinationKind?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedValueUsd?: number

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  needsInheritanceWaiver?: boolean

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(32)
  submittedDocumentCodes?: string[]

  @IsOptional()
  extractedFields?: Record<string, unknown>

  @IsOptional()
  @IsString()
  @MaxLength(200)
  registeredHolderName?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  registeredAccountOwner?: string
}

export class SubmitDocumentsDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(32)
  submitted!: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(32)
  accepted?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(32)
  rejected?: string[]

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string
}

export class RunAutomatedReviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  registeredHolderName?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  registeredAccountOwner?: string
}

export class RaiseStopOrderDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceCode?: string
}

export class ClearStopOrderDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string
}

export class RaiseAdverseClaimDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  claimantName?: string
}

export class ClearAdverseClaimDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string
}

export class RaiseDeceasedFlagDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  dateOfDeath?: string

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  waiverRequired?: boolean
}

export class ClearDeceasedFlagDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string
}

export class RaiseRestrictionDto {
  @IsIn(RESTRICTION_CATEGORIES)
  category!: (typeof RESTRICTION_CATEGORIES)[number]

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string
}

export class ClearRestrictionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string
}

export class RequestLegalOpinionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  provider?: string
}

export class ProvideLegalOpinionDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  opinionDocId?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  provider?: string
}

export class RequestIssuerReviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string
}

export class IssuerReviewResponseDto {
  @IsIn(['approved', 'info_requested', 'rejected'])
  decision!: 'approved' | 'info_requested' | 'rejected'

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string
}

export class AdvanceSettlementStepDto {
  @IsIn(SETTLEMENT_STEP_CODES)
  step!: (typeof SETTLEMENT_STEP_CODES)[number]

  @IsIn(['completed', 'failed', 'in_progress', 'skipped'])
  status!: 'completed' | 'failed' | 'in_progress' | 'skipped'

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string
}

export class FailTransferDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string

  @IsOptional()
  @IsIn(['documents_timeout', 'legal_block', 'other', 'regulatory_block'])
  code?: 'documents_timeout' | 'legal_block' | 'other' | 'regulatory_block'
}

export class TransferQueueQuery extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  issuerId?: string

  @IsOptional()
  @IsIn(TRANSFER_STATES)
  state?: TransferState

  @IsOptional()
  @IsIn(TRANSFER_LIFECYCLE_STAGES)
  lifecycleStage?: TransferLifecycleStage

  @IsOptional()
  @IsIn(TRANSFER_KINDS)
  kind?: TransferKind

  @IsOptional()
  @IsIn(TRANSFER_PRIORITIES)
  priority?: TransferPriority

  @IsOptional()
  @IsString()
  securityId?: string

  @IsOptional()
  @IsString()
  shareClassId?: string

  @IsOptional()
  @IsString()
  accountId?: string

  @IsOptional()
  @IsString()
  assignedReviewerId?: string

  /**
   * When true, only show requests that currently need reviewer attention
   * (UNDER_REVIEW + NEEDS_INFO + SUBMITTED). Convenience for queue views.
   */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  onlyOpen?: boolean

  @IsOptional()
  @IsIn(CASE_TYPES)
  caseType?: (typeof CASE_TYPES)[number]

  @IsOptional()
  @IsIn(BRANCHES)
  branch?: (typeof BRANCHES)[number]
}
