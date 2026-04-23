export type HolderKind = 'BENEFICIAL' | 'REGISTERED' | 'STREET_NAME'
export type HolderClassification = 'FUND' | 'INSIDER' | 'INSTITUTION' | 'RETAIL' | 'TREASURY'
export type RiskTier = 'HIGH' | 'LOW' | 'MEDIUM'
export type KycStatus = 'APPROVED' | 'PENDING' | 'REJECTED' | 'REVIEW'
export type ShareholderStatus = 'ACTIVE' | 'ARCHIVED' | 'SUSPENDED'

export interface Shareholder {
  id: string
  issuerId: string
  holderKind: HolderKind
  legalName: string
  classification: HolderClassification
  jurisdiction?: string
  riskTier: RiskTier
  email?: string
  phone?: string
  taxIdLast4?: string
  status: ShareholderStatus
  kycStatus: KycStatus
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
  accounts?: ShareholderAccount[]
}

export type AccountStatus = 'ACTIVE' | 'CLOSED' | 'RESTRICTED'
export type RegistrationType = 'CUSTODIAN' | 'ENTITY' | 'INDIVIDUAL' | 'JOINT' | 'TRUST'

export interface ShareholderAccount {
  id: string
  shareholderId: string
  issuerId: string
  accountNumber: string
  registrationType: RegistrationType
  status: AccountStatus
  primaryEmail?: string
  address: Record<string, unknown>
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}
