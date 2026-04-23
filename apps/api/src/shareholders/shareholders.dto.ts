import { IsEmail, IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

import { PaginationQueryDto } from '../common/pagination.js'

import type {
  AccountStatus,
  HolderClassification,
  HolderKind,
  KycStatus,
  RegistrationType,
  RiskTier,
  ShareholderStatus,
} from './shareholders.types.js'

const HOLDER_KINDS: HolderKind[] = ['BENEFICIAL', 'REGISTERED', 'STREET_NAME']
const CLASSIFICATIONS: HolderClassification[] = ['FUND', 'INSIDER', 'INSTITUTION', 'RETAIL', 'TREASURY']
const RISK_TIERS: RiskTier[] = ['HIGH', 'LOW', 'MEDIUM']
const KYC_STATUSES: KycStatus[] = ['APPROVED', 'PENDING', 'REJECTED', 'REVIEW']
const STATUSES: ShareholderStatus[] = ['ACTIVE', 'ARCHIVED', 'SUSPENDED']
const REGISTRATION_TYPES: RegistrationType[] = ['CUSTODIAN', 'ENTITY', 'INDIVIDUAL', 'JOINT', 'TRUST']
const ACCOUNT_STATUSES: AccountStatus[] = ['ACTIVE', 'CLOSED', 'RESTRICTED']

export class CreateShareholderDto {
  @IsString()
  issuerId!: string

  @IsOptional()
  @IsIn(HOLDER_KINDS)
  holderKind?: HolderKind

  @IsString()
  @MinLength(2)
  @MaxLength(180)
  legalName!: string

  @IsOptional()
  @IsIn(CLASSIFICATIONS)
  classification?: HolderClassification

  @IsOptional()
  @IsString()
  jurisdiction?: string

  @IsOptional()
  @IsIn(RISK_TIERS)
  riskTier?: RiskTier

  @IsOptional()
  @IsEmail()
  email?: string

  @IsOptional()
  @IsString()
  phone?: string

  @IsOptional()
  @IsString()
  @MaxLength(4)
  taxIdLast4?: string

  @IsOptional()
  @IsIn(KYC_STATUSES)
  kycStatus?: KycStatus

  @IsOptional()
  @IsIn(STATUSES)
  status?: ShareholderStatus

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class UpdateShareholderDto {
  @IsOptional()
  @IsIn(HOLDER_KINDS)
  holderKind?: HolderKind

  @IsOptional()
  @IsString()
  legalName?: string

  @IsOptional()
  @IsIn(CLASSIFICATIONS)
  classification?: HolderClassification

  @IsOptional()
  @IsString()
  jurisdiction?: string

  @IsOptional()
  @IsIn(RISK_TIERS)
  riskTier?: RiskTier

  @IsOptional()
  @IsEmail()
  email?: string

  @IsOptional()
  @IsString()
  phone?: string

  @IsOptional()
  @IsString()
  taxIdLast4?: string

  @IsOptional()
  @IsIn(KYC_STATUSES)
  kycStatus?: KycStatus

  @IsOptional()
  @IsIn(STATUSES)
  status?: ShareholderStatus

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class CreateAccountDto {
  @IsString()
  shareholderId!: string

  @IsString()
  accountNumber!: string

  @IsOptional()
  @IsIn(REGISTRATION_TYPES)
  registrationType?: RegistrationType

  @IsOptional()
  @IsIn(ACCOUNT_STATUSES)
  status?: AccountStatus

  @IsOptional()
  @IsEmail()
  primaryEmail?: string

  @IsOptional()
  @IsObject()
  address?: Record<string, unknown>

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class UpdateAccountDto {
  @IsOptional()
  @IsIn(REGISTRATION_TYPES)
  registrationType?: RegistrationType

  @IsOptional()
  @IsIn(ACCOUNT_STATUSES)
  status?: AccountStatus

  @IsOptional()
  @IsEmail()
  primaryEmail?: string

  @IsOptional()
  @IsObject()
  address?: Record<string, unknown>

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class ShareholderListQuery extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  issuerId?: string

  @IsOptional()
  @IsIn(HOLDER_KINDS)
  holderKind?: HolderKind

  @IsOptional()
  @IsIn(CLASSIFICATIONS)
  classification?: HolderClassification

  @IsOptional()
  @IsIn(STATUSES)
  status?: ShareholderStatus

  @IsOptional()
  @IsIn(RISK_TIERS)
  riskTier?: RiskTier

  @IsOptional()
  @IsIn(KYC_STATUSES)
  kycStatus?: KycStatus
}
