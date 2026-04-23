import { Injectable } from '@nestjs/common'
import { Type } from 'class-transformer'
import { IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator'

import type { PaginatedResponse } from '../common/pagination.js'
import { buildPaginated, pageOffset, PaginationQueryDto, resolveSort } from '../common/pagination.js'
import { DatabaseService } from '../database/database.service.js'

export class HoldingsQuery extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  issuerId?: string

  @IsOptional()
  @IsString()
  securityId?: string

  @IsOptional()
  @IsString()
  holderId?: string

  @IsOptional()
  @IsString()
  shareholderId?: string

  @IsOptional()
  @IsDateString()
  asOf?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minQuantity?: number
}

export interface HoldingRow {
  issuerId?: string
  securityId: string
  securityName?: string
  holderId: string
  shareholderId?: string
  shareholderName?: string
  accountId?: string
  quantity: number
  asOf?: string
}

const SORTABLE: Record<string, string> = {
  holderId: 'holder_id',
  quantity: 'quantity',
  securityId: 'security_id',
}

@Injectable()
export class HoldingsService {
  constructor(private readonly database: DatabaseService) {}

  async list(query: HoldingsQuery): Promise<PaginatedResponse<HoldingRow>> {
    const where: string[] = []
    const params: unknown[] = []
    const usingAsOf = Boolean(query.asOf)

    const baseQuery = usingAsOf
      ? this.buildAsOfQuery(query.asOf as string)
      : `SELECT v.security_id, v.holder_id, v.quantity::text
         FROM v_holdings v
         WHERE v.quantity <> 0`

    if (query.securityId) {
      params.push(query.securityId)
      where.push(`v.security_id = $${params.length}`)
    }
    if (query.holderId) {
      params.push(query.holderId)
      where.push(`v.holder_id = $${params.length}`)
    }
    if (query.minQuantity !== undefined) {
      params.push(query.minQuantity)
      where.push(`v.quantity >= $${params.length}`)
    }

    const innerSql = `${baseQuery}${where.length ? ` AND ${where.join(' AND ')}` : ''}`

    const enriched = `
      WITH holdings AS (${innerSql})
      SELECT h.security_id,
             h.holder_id,
             h.quantity::text AS quantity,
             s.id AS security_id_meta,
             s.name AS security_name,
             s.issuer_id,
             acc.id AS account_id,
             acc.shareholder_id,
             sh.legal_name AS shareholder_name
      FROM holdings h
      LEFT JOIN securities s ON s.id = h.security_id
      LEFT JOIN shareholder_accounts acc
        ON acc.issuer_id = s.issuer_id AND acc.account_number = h.holder_id
      LEFT JOIN shareholders sh ON sh.id = acc.shareholder_id
    `

    const issuerFilter: string[] = []
    const totalParams = [...params]
    if (query.issuerId) {
      totalParams.push(query.issuerId)
      issuerFilter.push(`s.issuer_id = $${totalParams.length}`)
    }
    if (query.shareholderId) {
      totalParams.push(query.shareholderId)
      issuerFilter.push(`acc.shareholder_id = $${totalParams.length}`)
    }
    if (query.q) {
      totalParams.push(`%${query.q.toLowerCase()}%`)
      issuerFilter.push(`(LOWER(h.holder_id) LIKE $${totalParams.length} OR LOWER(COALESCE(sh.legal_name,'')) LIKE $${totalParams.length})`)
    }
    const wherePost = issuerFilter.length ? `WHERE ${issuerFilter.join(' AND ')}` : ''

    const sort = resolveSort(query, SORTABLE, { column: 'quantity', dir: 'desc' })

    const countResult = await this.database.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM (${enriched}) enriched ${wherePost}`,
      totalParams,
    )
    const total = Number(countResult.rows[0]?.count || '0')

    totalParams.push(query.pageSize)
    const limitParam = totalParams.length
    totalParams.push(pageOffset(query))
    const offsetParam = totalParams.length

    const rows = await this.database.query<{
      security_id: string
      holder_id: string
      quantity: string
      security_name: string | null
      issuer_id: string | null
      account_id: string | null
      shareholder_id: string | null
      shareholder_name: string | null
    }>(
      `SELECT security_id, holder_id, quantity, security_name, issuer_id, account_id, shareholder_id, shareholder_name
       FROM (${enriched}) enriched
       ${wherePost}
       ORDER BY ${sort.column} ${sort.dir.toUpperCase()}
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      totalParams,
    )

    const items: HoldingRow[] = rows.rows.map(row => ({
      accountId: row.account_id || undefined,
      asOf: query.asOf,
      holderId: row.holder_id,
      issuerId: row.issuer_id || undefined,
      quantity: Number(row.quantity),
      securityId: row.security_id,
      securityName: row.security_name || undefined,
      shareholderId: row.shareholder_id || undefined,
      shareholderName: row.shareholder_name || undefined,
    }))

    return buildPaginated(items, total, query)
  }

  async getTotals(securityId: string): Promise<{ holders: number; outstanding: number }> {
    const result = await this.database.query<{ holders: string; outstanding: string }>(
      `SELECT COUNT(*)::text AS holders, COALESCE(SUM(quantity), 0)::text AS outstanding
       FROM v_holdings
       WHERE security_id = $1 AND quantity > 0`,
      [securityId],
    )
    return {
      holders: Number(result.rows[0]?.holders || '0'),
      outstanding: Number(result.rows[0]?.outstanding || '0'),
    }
  }

  private buildAsOfQuery(recordDateIso: string): string {
    const cutoff = `'${recordDateIso}T23:59:59.999Z'::timestamptz`
    return `
      SELECT security_id, holder_id, quantity
      FROM (
        WITH base AS (
          SELECT * FROM ledger_events WHERE timestamp <= ${cutoff}
        ),
        issuance AS (SELECT security_id, holder_id, SUM(quantity)::BIGINT AS qty FROM base WHERE type='ISSUE' AND holder_id IS NOT NULL GROUP BY security_id, holder_id),
        cancellations AS (SELECT security_id, holder_id, SUM(quantity)::BIGINT AS qty FROM base WHERE type='CANCEL' AND holder_id IS NOT NULL GROUP BY security_id, holder_id),
        adjustments AS (SELECT security_id, holder_id, SUM(quantity)::BIGINT AS qty FROM base WHERE type='ADJUSTMENT' AND holder_id IS NOT NULL GROUP BY security_id, holder_id),
        transfers_in AS (SELECT security_id, to_holder_id AS holder_id, SUM(quantity)::BIGINT AS qty FROM base WHERE type='TRANSFER' AND to_holder_id IS NOT NULL GROUP BY security_id, to_holder_id),
        transfers_out AS (SELECT security_id, from_holder_id AS holder_id, SUM(quantity)::BIGINT AS qty FROM base WHERE type='TRANSFER' AND from_holder_id IS NOT NULL GROUP BY security_id, from_holder_id),
        all_holders AS (
          SELECT security_id, holder_id FROM issuance
          UNION SELECT security_id, holder_id FROM cancellations
          UNION SELECT security_id, holder_id FROM adjustments
          UNION SELECT security_id, holder_id FROM transfers_in
          UNION SELECT security_id, holder_id FROM transfers_out
        )
        SELECT h.security_id, h.holder_id,
               COALESCE(i.qty,0) - COALESCE(c.qty,0) + COALESCE(a.qty,0) + COALESCE(ti.qty,0) - COALESCE(tout.qty,0) AS quantity
        FROM all_holders h
        LEFT JOIN issuance i ON i.security_id=h.security_id AND i.holder_id=h.holder_id
        LEFT JOIN cancellations c ON c.security_id=h.security_id AND c.holder_id=h.holder_id
        LEFT JOIN adjustments a ON a.security_id=h.security_id AND a.holder_id=h.holder_id
        LEFT JOIN transfers_in ti ON ti.security_id=h.security_id AND ti.holder_id=h.holder_id
        LEFT JOIN transfers_out tout ON tout.security_id=h.security_id AND tout.holder_id=h.holder_id
      ) AS derived
      WHERE quantity <> 0
    `
  }
}
