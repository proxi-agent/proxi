import { Injectable } from '@nestjs/common'

import type { Queryable } from '../database/database.service.js'
import { DatabaseService } from '../database/database.service.js'
import type { PaginatedResponse } from '../common/pagination.js'
import { buildPaginated, pageOffset, PaginationQueryDto, resolveSort } from '../common/pagination.js'

import type { AuditEntityType, AuditEvent, AuditSeverity, RecordAuditInput } from './audit.types.js'

type AuditRow = {
  id: number
  occurred_at: Date
  actor_id: string
  actor_role: string | null
  action: string
  severity: AuditSeverity
  entity_type: AuditEntityType
  entity_id: string
  issuer_id: string | null
  ip: string | null
  user_agent: string | null
  metadata: Record<string, unknown>
}

export interface AuditListFilter extends PaginationQueryDto {
  entityType?: AuditEntityType
  entityId?: string
  issuerId?: string
  actorId?: string
  action?: string
  severity?: AuditSeverity
  since?: string
  until?: string
}

const SORTABLE_COLUMNS: Record<string, string> = {
  action: 'action',
  occurredAt: 'occurred_at',
  severity: 'severity',
}

@Injectable()
export class AuditService {
  constructor(private readonly database: DatabaseService) {}

  async record(input: RecordAuditInput, client?: Queryable): Promise<AuditEvent> {
    const runner = client ?? this.database
    const result = await runner.query<AuditRow>(
      `INSERT INTO audit_events (actor_id, actor_role, action, severity, entity_type, entity_id, issuer_id, ip, user_agent, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
       RETURNING id, occurred_at, actor_id, actor_role, action, severity, entity_type, entity_id, issuer_id, ip, user_agent, metadata`,
      [
        input.actorId,
        input.actorRole || null,
        input.action,
        input.severity || 'INFO',
        input.entityType,
        input.entityId,
        input.issuerId || null,
        input.ip || null,
        input.userAgent || null,
        JSON.stringify(input.metadata || {}),
      ],
    )
    return mapAudit(result.rows[0])
  }

  async list(filter: AuditListFilter): Promise<PaginatedResponse<AuditEvent>> {
    const where: string[] = []
    const params: unknown[] = []

    if (filter.entityType) {
      params.push(filter.entityType)
      where.push(`entity_type = $${params.length}`)
    }
    if (filter.entityId) {
      params.push(filter.entityId)
      where.push(`entity_id = $${params.length}`)
    }
    if (filter.issuerId) {
      params.push(filter.issuerId)
      where.push(`issuer_id = $${params.length}`)
    }
    if (filter.actorId) {
      params.push(filter.actorId)
      where.push(`actor_id = $${params.length}`)
    }
    if (filter.action) {
      params.push(filter.action)
      where.push(`action = $${params.length}`)
    }
    if (filter.severity) {
      params.push(filter.severity)
      where.push(`severity = $${params.length}`)
    }
    if (filter.since) {
      params.push(filter.since)
      where.push(`occurred_at >= $${params.length}`)
    }
    if (filter.until) {
      params.push(filter.until)
      where.push(`occurred_at <= $${params.length}`)
    }
    if (filter.q) {
      params.push(`%${filter.q.toLowerCase()}%`)
      where.push(`(LOWER(action) LIKE $${params.length} OR LOWER(entity_id) LIKE $${params.length})`)
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const sort = resolveSort(filter, SORTABLE_COLUMNS, { column: 'occurred_at', dir: 'desc' })
    const countResult = await this.database.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM audit_events ${whereSql}`,
      params,
    )
    const total = Number(countResult.rows[0]?.count || '0')

    params.push(filter.pageSize || 25)
    const limitParam = params.length
    params.push(pageOffset(filter))
    const offsetParam = params.length

    const rows = await this.database.query<AuditRow>(
      `SELECT id, occurred_at, actor_id, actor_role, action, severity, entity_type, entity_id, issuer_id, ip, user_agent, metadata
       FROM audit_events
       ${whereSql}
       ORDER BY ${sort.column} ${sort.dir.toUpperCase()}
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params,
    )

    return buildPaginated(rows.rows.map(mapAudit), total, filter)
  }
}

function mapAudit(row: AuditRow): AuditEvent {
  return {
    action: row.action,
    actorId: row.actor_id,
    actorRole: row.actor_role || undefined,
    entityId: row.entity_id,
    entityType: row.entity_type,
    id: row.id,
    ip: row.ip || undefined,
    issuerId: row.issuer_id || undefined,
    metadata: row.metadata || {},
    occurredAt: new Date(row.occurred_at),
    severity: row.severity,
    userAgent: row.user_agent || undefined,
  }
}
