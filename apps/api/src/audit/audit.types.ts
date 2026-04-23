export type AuditSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export type AuditEntityType =
  | 'BALLOT'
  | 'DIVIDEND_ENTITLEMENT'
  | 'DIVIDEND_EVENT'
  | 'ISSUER'
  | 'LEDGER_EVENT'
  | 'MEETING'
  | 'NOTICE'
  | 'PROPOSAL'
  | 'SECURITY'
  | 'SHAREHOLDER'
  | 'SHAREHOLDER_ACCOUNT'
  | 'TASK'
  | 'TRANSFER_CASE'
  | 'USER'
  | 'VOTE'

export interface AuditEvent {
  id: number
  occurredAt: Date
  actorId: string
  actorRole?: string
  action: string
  severity: AuditSeverity
  entityType: AuditEntityType
  entityId: string
  issuerId?: string
  ip?: string
  userAgent?: string
  metadata: Record<string, unknown>
}

export interface RecordAuditInput {
  actorId: string
  actorRole?: string
  action: string
  severity?: AuditSeverity
  entityType: AuditEntityType
  entityId: string
  issuerId?: string
  ip?: string
  userAgent?: string
  metadata?: Record<string, unknown>
}
