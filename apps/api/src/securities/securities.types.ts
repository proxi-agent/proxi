export type SecurityStatus = 'ACTIVE' | 'DELISTED' | 'DRAFT' | 'SUSPENDED'

export interface ShareClass {
  id: string
  securityId: string
  code: string
  name: string
  parValueCents: number
  votesPerShare: number
  dividendEligible: boolean
  transferRestricted: boolean
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export interface Security {
  id: string
  issuerId: string
  ticker?: string
  name: string
  cusip?: string
  isin?: string
  status: SecurityStatus
  currency: string
  authorizedShares: number
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
  shareClasses: ShareClass[]
  outstandingShares: number
}
