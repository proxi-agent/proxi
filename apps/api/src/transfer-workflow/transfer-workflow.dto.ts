import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'

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
}
