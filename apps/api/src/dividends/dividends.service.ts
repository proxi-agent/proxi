import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { PoolClient } from 'pg'

import { AuditService } from '../audit/audit.service.js'
import type { ActorContext } from '../common/actor.js'
import type { PaginatedResponse } from '../common/pagination.js'
import { buildPaginated, pageOffset, resolveSort } from '../common/pagination.js'
import { shortId } from '../common/uid.js'
import { DatabaseService } from '../database/database.service.js'
import { LedgerService } from '../ledger/ledger.service.js'
import { ShareholdersService } from '../shareholders/shareholders.service.js'

import type { CreateDividendDto, DividendListQuery, EntitlementListQuery, MarkPaidDto, UpdateDividendDto } from './dividends.dto.js'
import { computeEntitlements, isValidRecordDate, totalDistributionCents } from './dividends.math.js'
import type { DividendEntitlement, DividendEvent, DividendKind, DividendStatus, EntitlementStatus } from './dividends.types.js'

type DividendRow = {
  id: string
  issuer_id: string
  security_id: string
  share_class_id: string | null
  status: DividendStatus
  kind: DividendKind
  rate_per_share_cents: number
  currency: string
  declaration_date: string
  record_date: string
  payment_date: string
  total_distribution_cents: string
  description: string | null
  metadata: Record<string, unknown>
  created_at: Date
  updated_at: Date
}

type EntitlementRow = {
  id: string
  dividend_event_id: string
  account_id: string
  shareholder_id: string
  shares_held: string
  amount_cents: string
  status: EntitlementStatus
  paid_at: Date | null
  payment_reference: string | null
  metadata: Record<string, unknown>
  created_at: Date
  updated_at: Date
}

const EVENT_SORT: Record<string, string> = {
  createdAt: 'created_at',
  paymentDate: 'payment_date',
  recordDate: 'record_date',
  status: 'status',
}

const ENTITLEMENT_SORT: Record<string, string> = {
  amountCents: 'amount_cents',
  createdAt: 'created_at',
  sharesHeld: 'shares_held',
  status: 'status',
}

@Injectable()
export class DividendsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly auditService: AuditService,
    private readonly ledgerService: LedgerService,
    private readonly shareholdersService: ShareholdersService,
  ) {}

  async list(query: DividendListQuery): Promise<PaginatedResponse<DividendEvent>> {
    const where: string[] = []
    const params: unknown[] = []
    if (query.issuerId) {
      params.push(query.issuerId)
      where.push(`issuer_id = $${params.length}`)
    }
    if (query.securityId) {
      params.push(query.securityId)
      where.push(`security_id = $${params.length}`)
    }
    if (query.status) {
      params.push(query.status)
      where.push(`status = $${params.length}`)
    }
    if (query.q) {
      params.push(`%${query.q.toLowerCase()}%`)
      where.push(`LOWER(COALESCE(description, '')) LIKE $${params.length}`)
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const sort = resolveSort(query, EVENT_SORT, { column: 'payment_date', dir: 'desc' })
    const countResult = await this.database.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM dividend_events ${whereSql}`,
      params,
    )
    const total = Number(countResult.rows[0]?.count || '0')

    params.push(query.pageSize)
    const limitParam = params.length
    params.push(pageOffset(query))
    const offsetParam = params.length

    const rows = await this.database.query<DividendRow>(
      `SELECT * FROM dividend_events ${whereSql}
       ORDER BY ${sort.column} ${sort.dir.toUpperCase()}
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params,
    )
    return buildPaginated(rows.rows.map(mapDividend), total, query)
  }

  async getById(id: string): Promise<DividendEvent> {
    const result = await this.database.query<DividendRow>(`SELECT * FROM dividend_events WHERE id = $1`, [id])
    if (!result.rows.length) {
      throw new NotFoundException(`Dividend ${id} not found`)
    }
    return mapDividend(result.rows[0])
  }

  async create(input: CreateDividendDto, actor: ActorContext): Promise<DividendEvent> {
    if (!isValidRecordDate(input.recordDate, input.paymentDate, input.declarationDate)) {
      throw new BadRequestException('declarationDate <= recordDate <= paymentDate is required')
    }
    const id = shortId('div')
    return this.database.tx(async client => {
      const security = await client.query<{ issuer_id: string }>(
        `SELECT issuer_id FROM securities WHERE id = $1`,
        [input.securityId],
      )
      if (!security.rows.length) {
        throw new NotFoundException(`Security ${input.securityId} not found`)
      }
      if (security.rows[0].issuer_id !== input.issuerId) {
        throw new BadRequestException('Security does not belong to issuer')
      }
      const result = await client.query<DividendRow>(
        `INSERT INTO dividend_events (id, issuer_id, security_id, share_class_id, status, kind, rate_per_share_cents, currency,
                                      declaration_date, record_date, payment_date, description, metadata)
         VALUES ($1,$2,$3,$4,'DRAFT',$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
         RETURNING *`,
        [
          id,
          input.issuerId,
          input.securityId,
          input.shareClassId || null,
          input.kind || 'CASH',
          input.ratePerShareCents,
          input.currency || 'USD',
          input.declarationDate,
          input.recordDate,
          input.paymentDate,
          input.description || null,
          JSON.stringify(input.metadata || {}),
        ],
      )
      const event = mapDividend(result.rows[0])
      await this.auditService.record(
        {
          action: 'DIVIDEND_CREATED',
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: event.id,
          entityType: 'DIVIDEND_EVENT',
          issuerId: event.issuerId,
          metadata: { ratePerShareCents: event.ratePerShareCents, recordDate: event.recordDate },
        },
        client,
      )
      return event
    })
  }

  async update(id: string, input: UpdateDividendDto, actor: ActorContext): Promise<DividendEvent> {
    return this.database.tx(async client => {
      const existing = await this.findForUpdate(client, id)
      if (existing.status !== 'DRAFT') {
        throw new ConflictException('Only DRAFT dividends can be edited')
      }
      const result = await client.query<DividendRow>(
        `UPDATE dividend_events SET
           kind = $2, rate_per_share_cents = $3, currency = $4, declaration_date = $5, record_date = $6,
           payment_date = $7, description = $8, metadata = $9::jsonb, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [
          id,
          input.kind ?? existing.kind,
          input.ratePerShareCents ?? existing.rate_per_share_cents,
          input.currency ?? existing.currency,
          input.declarationDate ?? existing.declaration_date,
          input.recordDate ?? existing.record_date,
          input.paymentDate ?? existing.payment_date,
          input.description ?? existing.description,
          JSON.stringify({ ...existing.metadata, ...(input.metadata || {}) }),
        ],
      )
      await this.auditService.record(
        {
          action: 'DIVIDEND_UPDATED',
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: id,
          entityType: 'DIVIDEND_EVENT',
          issuerId: existing.issuer_id,
          metadata: {},
        },
        client,
      )
      return mapDividend(result.rows[0])
    })
  }

  async declare(id: string, actor: ActorContext): Promise<DividendEvent> {
    return this.database.tx(async client => {
      const existing = await this.findForUpdate(client, id)
      if (existing.status !== 'DRAFT') {
        throw new ConflictException(`Cannot declare dividend in status ${existing.status}`)
      }
      const result = await client.query<DividendRow>(
        `UPDATE dividend_events SET status = 'DECLARED', updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id],
      )
      await this.auditService.record(
        {
          action: 'DIVIDEND_DECLARED',
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: id,
          entityType: 'DIVIDEND_EVENT',
          issuerId: existing.issuer_id,
          metadata: {},
          severity: 'MEDIUM',
        },
        client,
      )
      return mapDividend(result.rows[0])
    })
  }

  async snapshot(id: string, actor: ActorContext): Promise<{ event: DividendEvent; entitlements: DividendEntitlement[] }> {
    return this.database.tx(async client => {
      const existing = await this.findForUpdate(client, id)
      if (existing.status !== 'DECLARED') {
        throw new ConflictException(`Cannot snapshot dividend in status ${existing.status}`)
      }

      await client.query(`DELETE FROM dividend_entitlements WHERE dividend_event_id = $1`, [id])

      const positions = await this.ledgerService.getPositionsAsOf(existing.security_id, existing.record_date)
      const drafts = computeEntitlements(positions, existing.rate_per_share_cents)

      const rows: DividendEntitlement[] = []
      for (const draft of drafts) {
        const accountResult = await client.query<{ id: string; shareholder_id: string }>(
          `SELECT id, shareholder_id FROM shareholder_accounts
           WHERE issuer_id = $1 AND account_number = $2`,
          [existing.issuer_id, draft.holderId],
        )
        if (!accountResult.rows.length) {
          // Skip unknown holder ids (e.g. treasury pre-seed). They stay outside entitlement table.
          continue
        }
        const account = accountResult.rows[0]
        const entitlementId = shortId('ent')
        const inserted = await client.query<EntitlementRow>(
          `INSERT INTO dividend_entitlements (id, dividend_event_id, account_id, shareholder_id, shares_held, amount_cents, status, metadata)
           VALUES ($1,$2,$3,$4,$5,$6,'PENDING','{}'::jsonb) RETURNING *`,
          [entitlementId, id, account.id, account.shareholder_id, draft.sharesHeld, draft.amountCents],
        )
        rows.push(mapEntitlement(inserted.rows[0]))
      }

      const total = totalDistributionCents(rows.map(row => ({ amountCents: row.amountCents })))
      const result = await client.query<DividendRow>(
        `UPDATE dividend_events SET status = 'SNAPSHOTTED', total_distribution_cents = $2, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [id, total],
      )
      await this.auditService.record(
        {
          action: 'DIVIDEND_SNAPSHOTTED',
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: id,
          entityType: 'DIVIDEND_EVENT',
          issuerId: existing.issuer_id,
          metadata: { entitlementCount: rows.length, totalDistributionCents: total },
          severity: 'MEDIUM',
        },
        client,
      )
      return { entitlements: rows, event: mapDividend(result.rows[0]) }
    })
  }

  async markEntitlementPaid(input: MarkPaidDto, actor: ActorContext): Promise<DividendEntitlement> {
    return this.database.tx(async client => {
      const existing = await client.query<EntitlementRow>(
        `SELECT * FROM dividend_entitlements WHERE id = $1 FOR UPDATE`,
        [input.entitlementId],
      )
      if (!existing.rows.length) {
        throw new NotFoundException(`Entitlement ${input.entitlementId} not found`)
      }
      const current = existing.rows[0]
      if (current.status === 'PAID') {
        return mapEntitlement(current)
      }
      if (current.status === 'VOIDED') {
        throw new ConflictException('Cannot mark voided entitlement as paid')
      }

      const updated = await client.query<EntitlementRow>(
        `UPDATE dividend_entitlements SET status = 'PAID', paid_at = NOW(), payment_reference = $2,
                                        metadata = $3::jsonb, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [
          input.entitlementId,
          input.paymentReference || null,
          JSON.stringify({ ...current.metadata, ...(input.metadata || {}) }),
        ],
      )

      const allRows = await client.query<{ total: string; unpaid: string }>(
        `SELECT COUNT(*)::text AS total,
                SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END)::text AS unpaid
         FROM dividend_entitlements WHERE dividend_event_id = $1`,
        [current.dividend_event_id],
      )

      if (Number(allRows.rows[0]?.unpaid || '0') === 0 && Number(allRows.rows[0]?.total || '0') > 0) {
        await client.query(
          `UPDATE dividend_events SET status = 'PAID', updated_at = NOW()
           WHERE id = $1 AND status = 'SNAPSHOTTED'`,
          [current.dividend_event_id],
        )
      }

      await this.auditService.record(
        {
          action: 'DIVIDEND_ENTITLEMENT_PAID',
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: input.entitlementId,
          entityType: 'DIVIDEND_ENTITLEMENT',
          metadata: { dividendEventId: current.dividend_event_id, paymentReference: input.paymentReference },
        },
        client,
      )
      return mapEntitlement(updated.rows[0])
    })
  }

  async cancel(id: string, actor: ActorContext, reason: string): Promise<DividendEvent> {
    return this.database.tx(async client => {
      const existing = await this.findForUpdate(client, id)
      if (existing.status === 'PAID') {
        throw new ConflictException('Cannot cancel paid dividend')
      }
      const result = await client.query<DividendRow>(
        `UPDATE dividend_events SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id],
      )
      await client.query(
        `UPDATE dividend_entitlements SET status = 'VOIDED', updated_at = NOW() WHERE dividend_event_id = $1 AND status = 'PENDING'`,
        [id],
      )
      await this.auditService.record(
        {
          action: 'DIVIDEND_CANCELLED',
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: id,
          entityType: 'DIVIDEND_EVENT',
          issuerId: existing.issuer_id,
          metadata: { reason },
          severity: 'HIGH',
        },
        client,
      )
      return mapDividend(result.rows[0])
    })
  }

  async listEntitlements(dividendId: string, query: EntitlementListQuery): Promise<PaginatedResponse<DividendEntitlement>> {
    const where: string[] = [`dividend_event_id = $1`]
    const params: unknown[] = [dividendId]
    if (query.status) {
      params.push(query.status)
      where.push(`status = $${params.length}`)
    }
    if (query.accountId) {
      params.push(query.accountId)
      where.push(`account_id = $${params.length}`)
    }
    if (query.shareholderId) {
      params.push(query.shareholderId)
      where.push(`shareholder_id = $${params.length}`)
    }
    const whereSql = `WHERE ${where.join(' AND ')}`
    const sort = resolveSort(query, ENTITLEMENT_SORT, { column: 'amount_cents', dir: 'desc' })

    const countResult = await this.database.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM dividend_entitlements ${whereSql}`,
      params,
    )
    const total = Number(countResult.rows[0]?.count || '0')

    params.push(query.pageSize)
    const limitParam = params.length
    params.push(pageOffset(query))
    const offsetParam = params.length

    const rows = await this.database.query<EntitlementRow>(
      `SELECT * FROM dividend_entitlements ${whereSql}
       ORDER BY ${sort.column} ${sort.dir.toUpperCase()}
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params,
    )
    return buildPaginated(rows.rows.map(mapEntitlement), total, query)
  }

  async listEntitlementsForShareholder(shareholderId: string, query: EntitlementListQuery): Promise<PaginatedResponse<DividendEntitlement>> {
    const q = { ...query, shareholderId }
    const where: string[] = [`shareholder_id = $1`]
    const params: unknown[] = [shareholderId]
    if (q.status) {
      params.push(q.status)
      where.push(`status = $${params.length}`)
    }
    if (q.accountId) {
      params.push(q.accountId)
      where.push(`account_id = $${params.length}`)
    }
    const whereSql = `WHERE ${where.join(' AND ')}`
    const sort = resolveSort(q, ENTITLEMENT_SORT, { column: 'created_at', dir: 'desc' })

    const countResult = await this.database.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM dividend_entitlements ${whereSql}`,
      params,
    )
    const total = Number(countResult.rows[0]?.count || '0')

    params.push(q.pageSize)
    const limitParam = params.length
    params.push(pageOffset(q))
    const offsetParam = params.length

    const rows = await this.database.query<EntitlementRow>(
      `SELECT * FROM dividend_entitlements ${whereSql}
       ORDER BY ${sort.column} ${sort.dir.toUpperCase()}
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params,
    )
    return buildPaginated(rows.rows.map(mapEntitlement), total, q)
  }

  private async findForUpdate(client: PoolClient, id: string): Promise<DividendRow> {
    const result = await client.query<DividendRow>(`SELECT * FROM dividend_events WHERE id = $1 FOR UPDATE`, [id])
    if (!result.rows.length) {
      throw new NotFoundException(`Dividend ${id} not found`)
    }
    return result.rows[0]
  }
}

function mapDividend(row: DividendRow): DividendEvent {
  return {
    createdAt: new Date(row.created_at),
    currency: row.currency,
    declarationDate: formatDate(row.declaration_date),
    description: row.description || undefined,
    id: row.id,
    issuerId: row.issuer_id,
    kind: row.kind,
    metadata: row.metadata || {},
    paymentDate: formatDate(row.payment_date),
    ratePerShareCents: Number(row.rate_per_share_cents),
    recordDate: formatDate(row.record_date),
    securityId: row.security_id,
    shareClassId: row.share_class_id || undefined,
    status: row.status,
    totalDistributionCents: Number(row.total_distribution_cents),
    updatedAt: new Date(row.updated_at),
  }
}

function mapEntitlement(row: EntitlementRow): DividendEntitlement {
  return {
    accountId: row.account_id,
    amountCents: Number(row.amount_cents),
    createdAt: new Date(row.created_at),
    dividendEventId: row.dividend_event_id,
    id: row.id,
    metadata: row.metadata || {},
    paidAt: row.paid_at ? new Date(row.paid_at) : undefined,
    paymentReference: row.payment_reference || undefined,
    shareholderId: row.shareholder_id,
    sharesHeld: Number(row.shares_held),
    status: row.status,
    updatedAt: new Date(row.updated_at),
  }
}

function formatDate(raw: string | Date): string {
  if (raw instanceof Date) {
    return raw.toISOString().slice(0, 10)
  }
  return String(raw).slice(0, 10)
}
