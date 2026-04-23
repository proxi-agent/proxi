import { Injectable, NotFoundException } from '@nestjs/common'
import type { PoolClient } from 'pg'

import { AuditService } from '../audit/audit.service.js'
import type { ActorContext } from '../common/actor.js'
import type { PaginatedResponse } from '../common/pagination.js'
import { buildPaginated, pageOffset, resolveSort } from '../common/pagination.js'
import { shortId } from '../common/uid.js'
import { DatabaseService } from '../database/database.service.js'

import type { CreateSecurityDto, SecurityListQuery, ShareClassInputDto, UpdateSecurityDto } from './securities.dto.js'
import type { Security, SecurityStatus, ShareClass } from './securities.types.js'

type SecurityRow = {
  id: string
  issuer_id: string
  ticker: string | null
  name: string
  cusip: string | null
  isin: string | null
  status: SecurityStatus
  currency: string
  authorized_shares: string
  metadata: Record<string, unknown>
  created_at: Date
  updated_at: Date
}

type ShareClassRow = {
  id: string
  security_id: string
  code: string
  name: string
  par_value_cents: number
  votes_per_share: string
  dividend_eligible: boolean
  transfer_restricted: boolean
  metadata: Record<string, unknown>
  created_at: Date
  updated_at: Date
}

const SORTABLE: Record<string, string> = {
  createdAt: 'created_at',
  name: 'name',
  status: 'status',
  ticker: 'ticker',
}

@Injectable()
export class SecuritiesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly auditService: AuditService,
  ) {}

  async list(query: SecurityListQuery): Promise<PaginatedResponse<Security>> {
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
    if (query.q) {
      params.push(`%${query.q.toLowerCase()}%`)
      where.push(`(LOWER(name) LIKE $${params.length} OR LOWER(COALESCE(ticker, '')) LIKE $${params.length})`)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const sort = resolveSort(query, SORTABLE, { column: 'created_at', dir: 'desc' })

    const countResult = await this.database.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM securities ${whereSql}`, params)
    const total = Number(countResult.rows[0]?.count || '0')

    params.push(query.pageSize)
    const limitParam = params.length
    params.push(pageOffset(query))
    const offsetParam = params.length

    const rows = await this.database.query<SecurityRow>(
      `SELECT * FROM securities ${whereSql}
       ORDER BY ${sort.column} ${sort.dir.toUpperCase()}
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params,
    )
    if (rows.rows.length === 0) {
      return buildPaginated([], total, query)
    }
    const ids = rows.rows.map(row => row.id)
    const classes = await this.database.query<ShareClassRow>(
      `SELECT * FROM share_classes WHERE security_id = ANY($1::text[]) ORDER BY code ASC`,
      [ids],
    )
    const outstanding = await this.computeOutstanding(ids)

    const byId = new Map(ids.map(id => [id, { classes: [] as ShareClassRow[], outstanding: outstanding.get(id) ?? 0 }]))
    for (const cls of classes.rows) {
      byId.get(cls.security_id)?.classes.push(cls)
    }

    const items = rows.rows.map(row => mapSecurity(row, byId.get(row.id)?.classes || [], byId.get(row.id)?.outstanding || 0))
    return buildPaginated(items, total, query)
  }

  async getById(id: string): Promise<Security> {
    const result = await this.database.query<SecurityRow>(`SELECT * FROM securities WHERE id = $1`, [id])
    if (!result.rows.length) {
      throw new NotFoundException(`Security ${id} not found`)
    }
    const classes = await this.database.query<ShareClassRow>(`SELECT * FROM share_classes WHERE security_id = $1 ORDER BY code ASC`, [id])
    const outstanding = (await this.computeOutstanding([id])).get(id) || 0
    return mapSecurity(result.rows[0], classes.rows, outstanding)
  }

  async create(input: CreateSecurityDto, actor: ActorContext): Promise<Security> {
    const id = shortId('sec')
    return this.database.tx(async client => {
      const issuer = await client.query(`SELECT id FROM issuers WHERE id = $1`, [input.issuerId])
      if (!issuer.rows.length) {
        throw new NotFoundException(`Issuer ${input.issuerId} not found`)
      }
      const result = await client.query<SecurityRow>(
        `INSERT INTO securities (id, issuer_id, ticker, name, cusip, isin, status, currency, authorized_shares, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) RETURNING *`,
        [
          id,
          input.issuerId,
          input.ticker || null,
          input.name,
          input.cusip || null,
          input.isin || null,
          input.status || 'ACTIVE',
          input.currency || 'USD',
          input.authorizedShares || 0,
          JSON.stringify(input.metadata || {}),
        ],
      )
      const classes = await this.upsertShareClasses(client, id, input.shareClasses || [])
      await this.auditService.record(
        {
          action: 'SECURITY_CREATED',
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: id,
          entityType: 'SECURITY',
          issuerId: input.issuerId,
          metadata: { classes: classes.map(cls => cls.code), name: input.name, ticker: input.ticker },
        },
        client,
      )
      return mapSecurityWithClasses(result.rows[0], classes, 0)
    })
  }

  async update(id: string, input: UpdateSecurityDto, actor: ActorContext): Promise<Security> {
    return this.database.tx(async client => {
      const existing = await client.query<SecurityRow>(`SELECT * FROM securities WHERE id = $1 FOR UPDATE`, [id])
      if (!existing.rows.length) {
        throw new NotFoundException(`Security ${id} not found`)
      }
      const current = existing.rows[0]
      const result = await client.query<SecurityRow>(
        `UPDATE securities SET
           ticker = $2, name = $3, cusip = $4, isin = $5, status = $6,
           currency = $7, authorized_shares = $8, metadata = $9::jsonb, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [
          id,
          input.ticker ?? current.ticker,
          input.name ?? current.name,
          input.cusip ?? current.cusip,
          input.isin ?? current.isin,
          input.status ?? current.status,
          input.currency ?? current.currency,
          input.authorizedShares ?? Number(current.authorized_shares),
          JSON.stringify({ ...current.metadata, ...(input.metadata || {}) }),
        ],
      )
      const classes = await client.query<ShareClassRow>(`SELECT * FROM share_classes WHERE security_id = $1 ORDER BY code ASC`, [id])
      await this.auditService.record(
        {
          action: 'SECURITY_UPDATED',
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: id,
          entityType: 'SECURITY',
          issuerId: current.issuer_id,
          metadata: {},
        },
        client,
      )
      const outstanding = (await this.computeOutstanding([id])).get(id) || 0
      return mapSecurity(result.rows[0], classes.rows, outstanding)
    })
  }

  async upsertShareClass(securityId: string, input: ShareClassInputDto, actor: ActorContext): Promise<ShareClass> {
    return this.database.tx(async client => {
      const security = await client.query(`SELECT issuer_id FROM securities WHERE id = $1`, [securityId])
      if (!security.rows.length) {
        throw new NotFoundException(`Security ${securityId} not found`)
      }
      const [inserted] = await this.upsertShareClasses(client, securityId, [input])
      await this.auditService.record(
        {
          action: 'SHARE_CLASS_UPSERTED',
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: inserted.id,
          entityType: 'SECURITY',
          issuerId: security.rows[0].issuer_id,
          metadata: { code: inserted.code },
        },
        client,
      )
      return inserted
    })
  }

  private async upsertShareClasses(client: PoolClient, securityId: string, inputs: ShareClassInputDto[]): Promise<ShareClass[]> {
    const results: ShareClass[] = []
    for (const input of inputs) {
      const existing = await client.query<ShareClassRow>(`SELECT * FROM share_classes WHERE security_id = $1 AND code = $2`, [
        securityId,
        input.code,
      ])
      if (existing.rows.length) {
        const row = existing.rows[0]
        const updated = await client.query<ShareClassRow>(
          `UPDATE share_classes SET
             name = $3, par_value_cents = $4, votes_per_share = $5, dividend_eligible = $6,
             transfer_restricted = $7, metadata = $8::jsonb, updated_at = NOW()
           WHERE id = $1 AND security_id = $2
           RETURNING *`,
          [
            row.id,
            securityId,
            input.name,
            input.parValueCents ?? row.par_value_cents,
            input.votesPerShare ?? Number(row.votes_per_share),
            input.dividendEligible ?? row.dividend_eligible,
            input.transferRestricted ?? row.transfer_restricted,
            JSON.stringify({ ...row.metadata, ...(input.metadata || {}) }),
          ],
        )
        results.push(mapShareClass(updated.rows[0]))
        continue
      }
      const id = shortId('cls')
      const created = await client.query<ShareClassRow>(
        `INSERT INTO share_classes (id, security_id, code, name, par_value_cents, votes_per_share, dividend_eligible, transfer_restricted, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING *`,
        [
          id,
          securityId,
          input.code,
          input.name,
          input.parValueCents ?? 0,
          input.votesPerShare ?? 1,
          input.dividendEligible ?? true,
          input.transferRestricted ?? false,
          JSON.stringify(input.metadata || {}),
        ],
      )
      results.push(mapShareClass(created.rows[0]))
    }
    return results
  }

  private async computeOutstanding(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) {
      return new Map()
    }
    const result = await this.database.query<{ security_id: string; total: string }>(
      `SELECT security_id, COALESCE(SUM(quantity), 0)::text AS total
       FROM v_holdings
       WHERE security_id = ANY($1::text[])
       GROUP BY security_id`,
      [ids],
    )
    const map = new Map<string, number>()
    for (const row of result.rows) {
      map.set(row.security_id, Number(row.total))
    }
    return map
  }
}

function mapSecurity(row: SecurityRow, classes: ShareClassRow[], outstanding: number): Security {
  return mapSecurityWithClasses(row, classes.map(mapShareClass), outstanding)
}

function mapSecurityWithClasses(row: SecurityRow, classes: ShareClass[], outstanding: number): Security {
  return {
    authorizedShares: Number(row.authorized_shares),
    createdAt: new Date(row.created_at),
    currency: row.currency,
    cusip: row.cusip || undefined,
    id: row.id,
    isin: row.isin || undefined,
    issuerId: row.issuer_id,
    metadata: row.metadata || {},
    name: row.name,
    outstandingShares: outstanding,
    shareClasses: classes,
    status: row.status,
    ticker: row.ticker || undefined,
    updatedAt: new Date(row.updated_at),
  }
}

function mapShareClass(row: ShareClassRow): ShareClass {
  return {
    code: row.code,
    createdAt: new Date(row.created_at),
    dividendEligible: row.dividend_eligible,
    id: row.id,
    metadata: row.metadata || {},
    name: row.name,
    parValueCents: Number(row.par_value_cents),
    securityId: row.security_id,
    transferRestricted: row.transfer_restricted,
    updatedAt: new Date(row.updated_at),
    votesPerShare: Number(row.votes_per_share),
  }
}
