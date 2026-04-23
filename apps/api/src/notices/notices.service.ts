import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'

import { AuditService } from '../audit/audit.service.js'
import type { ActorContext } from '../common/actor.js'
import type { PaginatedResponse } from '../common/pagination.js'
import { buildPaginated, pageOffset, resolveSort } from '../common/pagination.js'
import { shortId } from '../common/uid.js'
import { DatabaseService } from '../database/database.service.js'

import type { CreateNoticeDto, NoticeListQuery, UpdateNoticeDto } from './notices.dto.js'
import type { Notice, NoticeAudience, NoticeKind, NoticeStatus } from './notices.types.js'

type NoticeRow = {
  id: string
  issuer_id: string
  kind: NoticeKind
  subject: string
  body: string
  audience: NoticeAudience
  status: NoticeStatus
  related_entity_type: string | null
  related_entity_id: string | null
  published_at: Date | null
  metadata: Record<string, unknown>
  created_at: Date
  updated_at: Date
}

const SORT: Record<string, string> = {
  createdAt: 'created_at',
  publishedAt: 'published_at',
  subject: 'subject',
}

@Injectable()
export class NoticesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly auditService: AuditService,
  ) {}

  async list(query: NoticeListQuery): Promise<PaginatedResponse<Notice>> {
    const where: string[] = []
    const params: unknown[] = []
    if (query.issuerId) {
      params.push(query.issuerId)
      where.push(`issuer_id = $${params.length}`)
    }
    if (query.status) {
      params.push(query.status)
      where.push(`status = $${params.length}`)
    }
    if (query.kind) {
      params.push(query.kind)
      where.push(`kind = $${params.length}`)
    }
    if (query.relatedEntityId) {
      params.push(query.relatedEntityId)
      where.push(`related_entity_id = $${params.length}`)
    }
    if (query.q) {
      params.push(`%${query.q.toLowerCase()}%`)
      where.push(`(LOWER(subject) LIKE $${params.length} OR LOWER(body) LIKE $${params.length})`)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const sort = resolveSort(query, SORT, { column: 'created_at', dir: 'desc' })

    const countResult = await this.database.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM notices ${whereSql}`, params)
    const total = Number(countResult.rows[0]?.count || '0')

    params.push(query.pageSize)
    const limitParam = params.length
    params.push(pageOffset(query))
    const offsetParam = params.length

    const rows = await this.database.query<NoticeRow>(
      `SELECT * FROM notices ${whereSql}
       ORDER BY ${sort.column} ${sort.dir.toUpperCase()} NULLS LAST
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params,
    )
    return buildPaginated(rows.rows.map(mapNotice), total, query)
  }

  async get(id: string): Promise<Notice> {
    const result = await this.database.query<NoticeRow>(`SELECT * FROM notices WHERE id = $1`, [id])
    if (!result.rows.length) {
      throw new NotFoundException(`Notice ${id} not found`)
    }
    return mapNotice(result.rows[0])
  }

  async create(input: CreateNoticeDto, actor: ActorContext): Promise<Notice> {
    const id = shortId('ntc')
    return this.database.tx(async client => {
      const issuer = await client.query(`SELECT id FROM issuers WHERE id = $1`, [input.issuerId])
      if (!issuer.rows.length) {
        throw new NotFoundException(`Issuer ${input.issuerId} not found`)
      }
      const result = await client.query<NoticeRow>(
        `INSERT INTO notices (id, issuer_id, kind, subject, body, audience, status, related_entity_type, related_entity_id, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,'DRAFT',$7,$8,$9::jsonb) RETURNING *`,
        [
          id,
          input.issuerId,
          input.kind || 'GENERAL',
          input.subject,
          input.body,
          input.audience || 'ALL',
          input.relatedEntityType || null,
          input.relatedEntityId || null,
          JSON.stringify(input.metadata || {}),
        ],
      )
      await this.auditService.record(
        {
          action: 'NOTICE_CREATED',
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: id,
          entityType: 'NOTICE',
          issuerId: input.issuerId,
          metadata: { audience: input.audience, kind: input.kind },
        },
        client,
      )
      return mapNotice(result.rows[0])
    })
  }

  async update(id: string, input: UpdateNoticeDto, actor: ActorContext): Promise<Notice> {
    return this.database.tx(async client => {
      const existing = await client.query<NoticeRow>(`SELECT * FROM notices WHERE id = $1 FOR UPDATE`, [id])
      if (!existing.rows.length) {
        throw new NotFoundException(`Notice ${id} not found`)
      }
      const row = existing.rows[0]
      if (row.status === 'PUBLISHED' && input.status && input.status !== 'ARCHIVED') {
        throw new ConflictException('Published notice can only be archived')
      }
      const result = await client.query<NoticeRow>(
        `UPDATE notices SET
           kind = $2, subject = $3, body = $4, audience = $5, status = $6,
           metadata = $7::jsonb, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [
          id,
          input.kind ?? row.kind,
          input.subject ?? row.subject,
          input.body ?? row.body,
          input.audience ?? row.audience,
          input.status ?? row.status,
          JSON.stringify({ ...row.metadata, ...(input.metadata || {}) }),
        ],
      )
      await this.auditService.record(
        {
          action: 'NOTICE_UPDATED',
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: id,
          entityType: 'NOTICE',
          issuerId: row.issuer_id,
          metadata: { status: input.status },
        },
        client,
      )
      return mapNotice(result.rows[0])
    })
  }

  async publish(id: string, actor: ActorContext): Promise<Notice> {
    return this.database.tx(async client => {
      const existing = await client.query<NoticeRow>(`SELECT * FROM notices WHERE id = $1 FOR UPDATE`, [id])
      if (!existing.rows.length) {
        throw new NotFoundException(`Notice ${id} not found`)
      }
      if (existing.rows[0].status !== 'DRAFT') {
        throw new ConflictException('Only draft notices can be published')
      }
      const result = await client.query<NoticeRow>(
        `UPDATE notices SET status = 'PUBLISHED', published_at = NOW(), updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [id],
      )
      await this.auditService.record(
        {
          action: 'NOTICE_PUBLISHED',
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: id,
          entityType: 'NOTICE',
          issuerId: existing.rows[0].issuer_id,
          metadata: {},
          severity: 'MEDIUM',
        },
        client,
      )
      return mapNotice(result.rows[0])
    })
  }

  async archive(id: string, actor: ActorContext): Promise<Notice> {
    return this.database.tx(async client => {
      const existing = await client.query<NoticeRow>(`SELECT * FROM notices WHERE id = $1 FOR UPDATE`, [id])
      if (!existing.rows.length) {
        throw new NotFoundException(`Notice ${id} not found`)
      }
      const result = await client.query<NoticeRow>(`UPDATE notices SET status = 'ARCHIVED', updated_at = NOW() WHERE id = $1 RETURNING *`, [
        id,
      ])
      await this.auditService.record(
        {
          action: 'NOTICE_ARCHIVED',
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: id,
          entityType: 'NOTICE',
          issuerId: existing.rows[0].issuer_id,
          metadata: {},
        },
        client,
      )
      return mapNotice(result.rows[0])
    })
  }
}

function mapNotice(row: NoticeRow): Notice {
  return {
    audience: row.audience,
    body: row.body,
    createdAt: new Date(row.created_at),
    id: row.id,
    issuerId: row.issuer_id,
    kind: row.kind,
    metadata: row.metadata || {},
    publishedAt: row.published_at ? new Date(row.published_at) : undefined,
    relatedEntityId: row.related_entity_id || undefined,
    relatedEntityType: row.related_entity_type || undefined,
    status: row.status,
    subject: row.subject,
    updatedAt: new Date(row.updated_at),
  }
}
