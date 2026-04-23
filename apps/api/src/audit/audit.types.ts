export type AuditSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export type AuditEntityType =
  | 'BALLOT'
  | 'DIVIDEND_ENTITLEMENT'
  | 'DIVIDEND_EVENT'
  | 'ISSUER'
  | 'LEDGER_ENTRY'
  | 'LEDGER_EVENT'
  | 'MEETING'
  | 'NOTICE'
  | 'PROPOSAL'
  | 'SECURITY'
  | 'SHAREHOLDER'
  | 'SHAREHOLDER_ACCOUNT'
  | 'TASK'
  | 'TRANSFER_CASE'
  | 'TRANSFER_REQUEST'
  | 'USER'
  | 'VOTE'

/**
 * Structured origin metadata attached to an audit row. This is merged into
 * the event's `metadata` under a `_source` key so downstream consumers can
 * reliably distinguish human vs. automated vs. integration actors without
 * needing to parse the action name.
 */
export interface AuditSourceContext {
  /** High-level source system — `HTTP_API`, `JOB`, `MIGRATION`, `SEED`, etc. */
  system?: string
  /** Logical component within the source (e.g. `transfer-workflow`, `dividend-runner`). */
  component?: string
  /** Upstream request/correlation id, if any. */
  correlationId?: string
  /** Upstream idempotency key, if any. */
  idempotencyKey?: string
  /** Free-form note explaining why this action was taken (rarely used). */
  note?: string
}

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
  sourceContext?: AuditSourceContext
}
