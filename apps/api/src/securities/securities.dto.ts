import { Type } from 'class-transformer'
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator'

import { PaginationQueryDto } from '../common/pagination.js'

import type { SecurityStatus } from './securities.types.js'

const STATUSES: SecurityStatus[] = ['ACTIVE', 'DELISTED', 'DRAFT', 'SUSPENDED']

export class ShareClassInputDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  code!: string

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string

  @IsOptional()
  @IsInt()
  @Min(0)
  parValueCents?: number

  @IsOptional()
  @Type(() => Number)
  votesPerShare?: number

  @IsOptional()
  @IsBoolean()
  dividendEligible?: boolean

  @IsOptional()
  @IsBoolean()
  transferRestricted?: boolean

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class CreateSecurityDto {
  @IsString()
  issuerId!: string

  @IsOptional()
  @IsString()
  @MaxLength(20)
  ticker?: string

  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string

  @IsOptional()
  @IsString()
  cusip?: string

  @IsOptional()
  @IsString()
  isin?: string

  @IsOptional()
  @IsIn(STATUSES)
  status?: SecurityStatus

  @IsOptional()
  @IsString()
  currency?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  authorizedShares?: number

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ShareClassInputDto)
  shareClasses?: ShareClassInputDto[]
}

export class UpdateSecurityDto {
  @IsOptional()
  @IsString()
  ticker?: string

  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  cusip?: string

  @IsOptional()
  @IsString()
  isin?: string

  @IsOptional()
  @IsIn(STATUSES)
  status?: SecurityStatus

  @IsOptional()
  @IsString()
  currency?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  authorizedShares?: number

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class SecurityListQuery extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  issuerId?: string

  @IsOptional()
  @IsIn(STATUSES)
  status?: SecurityStatus
}
