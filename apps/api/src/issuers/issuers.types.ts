export type IssuerStatus = 'ACTIVE' | 'ONBOARDING' | 'SUSPENDED' | 'TERMINATED'

export interface Issuer {
  id: string
  name: string
  legalName: string
  cik?: string
  jurisdiction: string
  status: IssuerStatus
  contactEmail?: string
  website?: string
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}
