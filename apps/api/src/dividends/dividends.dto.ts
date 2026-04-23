import { Type } from 'class-transformer'
import { IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator'

import { PaginationQueryDto } from '../common/pagination.js'

import type { DividendKind, DividendStatus, EntitlementStatus } from './dividends.types.js'

const STATUSES: DividendStatus[] = ['CANCELLED', 'DECLARED', 'DRAFT', 'PAID', 'SNAPSHOTTED']
const KINDS: DividendKind[] = ['CASH', 'SCRIP', 'STOCK']
const ENTITLEMENT_STATUSES: EntitlementStatus[] = ['PAID', 'PENDING', 'VOIDED']

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

  @Type(() => Number)
  @IsInt()
  @Min(0)
  ratePerShareCents!: number

  @IsOptional()
  @IsString()
  currency?: string

  @IsDateString()
  declarationDate!: string

  @IsDateString()
  recordDate!: string

  @IsDateString()
  paymentDate!: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description?: string

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class UpdateDividendDto {
  @IsOptional()
  @IsIn(KINDS)
  kind?: DividendKind

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  ratePerShareCents?: number

  @IsOptional()
  @IsString()
  currency?: string

  @IsOptional()
  @IsDateString()
  declarationDate?: string

  @IsOptional()
  @IsDateString()
  recordDate?: string

  @IsOptional()
  @IsDateString()
  paymentDate?: string

  @IsOptional()
  @IsString()
  description?: string

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
  @IsObject()
  metadata?: Record<string, unknown>
}

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
