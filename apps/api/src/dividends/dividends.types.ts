export type DividendStatus = 'CANCELLED' | 'DECLARED' | 'DRAFT' | 'PAID' | 'SNAPSHOTTED'
export type DividendKind = 'CASH' | 'SCRIP' | 'STOCK'
export type EntitlementStatus = 'PAID' | 'PENDING' | 'VOIDED'

export interface DividendEvent {
  id: string
  issuerId: string
  securityId: string
  shareClassId?: string
  status: DividendStatus
  kind: DividendKind
  ratePerShareCents: number
  currency: string
  declarationDate: string
  recordDate: string
  paymentDate: string
  totalDistributionCents: number
  description?: string
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export interface DividendEntitlement {
  id: string
  dividendEventId: string
  accountId: string
  shareholderId: string
  sharesHeld: number
  amountCents: number
  status: EntitlementStatus
  paidAt?: Date
  paymentReference?: string
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}
