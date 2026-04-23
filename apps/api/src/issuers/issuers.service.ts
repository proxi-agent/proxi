import { Injectable, NotFoundException } from '@nestjs/common'

import type { ActorContext } from '../common/actor.js'
import { AuditService } from '../audit/audit.service.js'
import type { PaginatedResponse } from '../common/pagination.js'
import { buildPaginated, pageOffset, resolveSort } from '../common/pagination.js'
import { shortId } from '../common/uid.js'
import { DatabaseService } from '../database/database.service.js'

import type { CreateIssuerDto, IssuerListQuery, UpdateIssuerDto } from './issuers.dto.js'
import type { Issuer, IssuerStatus } from './issuers.types.js'

type IssuerRow = {
  id: string
  name: string
  legal_name: string
  cik: string | null
  jurisdiction: string
  status: IssuerStatus
  contact_email: string | null
  website: string | null
  metadata: Record<string, unknown>
  created_at: Date
  updated_at: Date
}

const SORTABLE: Record<string, string> = {
  createdAt: 'created_at',
  name: 'name',
  status: 'status',
}

@Injectable()
export class IssuersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly auditService: AuditService,
  ) {}

  async list(query: IssuerListQuery): Promise<PaginatedResponse<Issuer>> {
    const where: string[] = []
    const params: unknown[] = []
    if (query.status) {
      params.push(query.status)
      where.push(`status = $${params.length}`)
    }
    if (query.jurisdiction) {
      params.push(query.jurisdiction)
      where.push(`jurisdiction = $${params.length}`)
    }
    if (query.q) {
      params.push(`%${query.q.toLowerCase()}%`)
      where.push(`(LOWER(name) LIKE $${params.length} OR LOWER(legal_name) LIKE $${params.length})`)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const sort = resolveSort(query, SORTABLE, { column: 'created_at', dir: 'desc' })

    const countResult = await this.database.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM issuers ${whereSql}`,
      params,
    )
    const total = Number(countResult.rows[0]?.count || '0')

    params.push(query.pageSize)
    const limitParam = params.length
    params.push(pageOffset(query))
    const offsetParam = params.length

    const rows = await this.database.query<IssuerRow>(
      `SELECT * FROM issuers ${whereSql}
       ORDER BY ${sort.column} ${sort.dir.toUpperCase()}
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params,
    )
    return buildPaginated(rows.rows.map(mapIssuer), total, query)
  }

  async getById(id: string): Promise<Issuer> {
    const result = await this.database.query<IssuerRow>(`SELECT * FROM issuers WHERE id = $1`, [id])
    if (!result.rows.length) {
      throw new NotFoundException(`Issuer ${id} not found`)
    }
    return mapIssuer(result.rows[0])
  }

  async create(input: CreateIssuerDto, actor: ActorContext): Promise<Issuer> {
    const id = shortId('iss')
    const result = await this.database.tx(async client => {
      const inserted = await client.query<IssuerRow>(
        `INSERT INTO issuers (id, name, legal_name, cik, jurisdiction, status, contact_email, website, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING *`,
        [
          id,
          input.name,
          input.legalName,
          input.cik || null,
          input.jurisdiction || 'US',
          input.status || 'ONBOARDING',
          input.contactEmail || null,
          input.website || null,
          JSON.stringify(input.metadata || {}),
        ],
      )
      const issuer = mapIssuer(inserted.rows[0])
      await this.auditService.record(
        {
          action: 'ISSUER_CREATED',
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: issuer.id,
          entityType: 'ISSUER',
          issuerId: issuer.id,
          metadata: { name: issuer.name, status: issuer.status },
        },
        client,
      )
      return issuer
    })
    return result
  }

  async update(id: string, input: UpdateIssuerDto, actor: ActorContext): Promise<Issuer> {
    return this.database.tx(async client => {
      const existing = await client.query<IssuerRow>(`SELECT * FROM issuers WHERE id = $1 FOR UPDATE`, [id])
      if (!existing.rows.length) {
        throw new NotFoundException(`Issuer ${id} not found`)
      }
      const current = mapIssuer(existing.rows[0])

      const result = await client.query<IssuerRow>(
        `UPDATE issuers SET
           name = $2, legal_name = $3, cik = $4, jurisdiction = $5, status = $6,
           contact_email = $7, website = $8, metadata = $9::jsonb, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [
          id,
          input.name ?? current.name,
          input.legalName ?? current.legalName,
          input.cik ?? current.cik ?? null,
          input.jurisdiction ?? current.jurisdiction,
          input.status ?? current.status,
          input.contactEmail ?? current.contactEmail ?? null,
          input.website ?? current.website ?? null,
          JSON.stringify({ ...current.metadata, ...(input.metadata || {}) }),
        ],
      )
      const updated = mapIssuer(result.rows[0])
      await this.auditService.record(
        {
          action: 'ISSUER_UPDATED',
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: id,
          entityType: 'ISSUER',
          issuerId: id,
          metadata: { changes: diff(current, updated) },
        },
        client,
      )
      return updated
    })
  }
}

function mapIssuer(row: IssuerRow): Issuer {
  return {
    cik: row.cik || undefined,
    contactEmail: row.contact_email || undefined,
    createdAt: new Date(row.created_at),
    id: row.id,
    jurisdiction: row.jurisdiction,
    legalName: row.legal_name,
    metadata: row.metadata || {},
    name: row.name,
    status: row.status,
    updatedAt: new Date(row.updated_at),
    website: row.website || undefined,
  }
}

function diff<T extends object>(before: T, after: T): Record<string, { before: unknown; after: unknown }> {
  const result: Record<string, { before: unknown; after: unknown }> = {}
  for (const key of Object.keys(after) as Array<keyof T>) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      result[key as string] = { after: after[key], before: before[key] }
    }
  }
  return result
}
