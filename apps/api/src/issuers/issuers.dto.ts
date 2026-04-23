import { IsEmail, IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

import { PaginationQueryDto } from '../common/pagination.js'

import type { IssuerStatus } from './issuers.types.js'

const STATUSES: IssuerStatus[] = ['ACTIVE', 'ONBOARDING', 'SUSPENDED', 'TERMINATED']

export class CreateIssuerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string

  @IsString()
  @MinLength(2)
  @MaxLength(180)
  legalName!: string

  @IsOptional()
  @IsString()
  cik?: string

  @IsOptional()
  @IsString()
  jurisdiction?: string

  @IsOptional()
  @IsIn(STATUSES)
  status?: IssuerStatus

  @IsOptional()
  @IsEmail()
  contactEmail?: string

  @IsOptional()
  @IsString()
  website?: string

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class UpdateIssuerDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  legalName?: string

  @IsOptional()
  @IsString()
  cik?: string

  @IsOptional()
  @IsString()
  jurisdiction?: string

  @IsOptional()
  @IsIn(STATUSES)
  status?: IssuerStatus

  @IsOptional()
  @IsEmail()
  contactEmail?: string

  @IsOptional()
  @IsString()
  website?: string

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class IssuerListQuery extends PaginationQueryDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: IssuerStatus

  @IsOptional()
  @IsString()
  jurisdiction?: string
}
