import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'
import {
  TransferIntakeMethod,
  TransferKind,
  TransferLifecycleStage,
  TransferPriority,
  TransferState,
} from '@prisma/client'

import { PaginationQueryDto } from '../common/pagination.js'

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
  @IsEnum(TransferKind)
  kind?: TransferKind

  @IsOptional()
  @IsEnum(TransferIntakeMethod)
  intakeMethod?: TransferIntakeMethod

  @IsOptional()
  @IsEnum(TransferPriority)
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
  @IsEnum(TransferState)
  state?: TransferState

  @IsOptional()
  @IsEnum(TransferLifecycleStage)
  lifecycleStage?: TransferLifecycleStage

  @IsOptional()
  @IsEnum(TransferKind)
  kind?: TransferKind

  @IsOptional()
  @IsEnum(TransferPriority)
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
  onlyOpen?: boolean
}
