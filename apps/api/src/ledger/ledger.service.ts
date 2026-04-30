import { BadRequestException, Injectable } from '@nestjs/common'
import type { PoolClient } from 'pg'

import { AuditService } from '../audit/audit.service.js'
import type { ActorContext } from '../common/actor.js'
import { DatabaseService, type Queryable } from '../database/database.service.js'

export type LedgerEventType = 'ADJUSTMENT' | 'CANCEL' | 'ISSUE' | 'TRANSFER'

export interface LedgerEvent {
  caseId?: number
  id: number
  type: LedgerEventType
  securityId: string
  fromHolderId?: string
  toHolderId?: string
  holderId?: string
  quantity: number
  timestamp: Date
  reason?: string
  metadata: Record<string, unknown>
}

export interface Position {
  securityId: string
  holderId: string
  quantity: number
}

type LedgerEventRow = {
  case_id: number | null
  id: number
  type: LedgerEventType
  security_id: string
  from_holder_id: string | null
  to_holder_id: string | null
  holder_id: string | null
  quantity: number | string
  timestamp: Date
  reason: string | null
  metadata: Record<string, unknown>
}

export interface IssueInput {
  securityId: string
  holderId: string
  quantity: number
  caseId?: number
  reason?: string
  metadata?: Record<string, unknown>
}

export interface TransferInput {
  securityId: string
  fromHolderId: string
  toHolderId: string
  quantity: number
  caseId?: number
  reason?: string
  metadata?: Record<string, unknown>
}

export interface CancelInput {
  securityId: string
  holderId: string
  quantity: number
  caseId?: number
  reason?: string
  metadata?: Record<string, unknown>
}

export interface AdjustmentInput {
  securityId: string
  holderId: string
  /** Positive to increase, negative to decrease. */
  delta: number
  reason: string
  caseId?: number
  metadata?: Record<string, unknown>
}

@Injectable()
export class LedgerService {
  constructor(
    private readonly database: DatabaseService,
    private readonly auditService: AuditService,
  ) {}

  async getEvents(limit = 500): Promise<LedgerEvent[]> {
    const result = await this.database.query<LedgerEventRow>(
      `SELECT id, type, case_id, security_id, from_holder_id, to_holder_id, holder_id, quantity, timestamp, reason, metadata
       FROM ledger_events
       ORDER BY timestamp DESC
       LIMIT $1`,
      [limit],
    )
    return result.rows.map(mapLedgerEvent)
  }

  async issue(input: IssueInput, actor: ActorContext): Promise<LedgerEvent> {
    if (input.quantity <= 0) {
      throw new BadRequestException('quantity must be positive')
    }
    return this.database.tx(async client => {
      const event = await this.insertIssue(client, input)
      await this.recordAudit(client, event, actor, 'LEDGER_ISSUE')
      return event
    })
  }

  async transfer(input: TransferInput, actor: ActorContext): Promise<LedgerEvent> {
    if (input.quantity <= 0) {
      throw new BadRequestException('quantity must be positive')
    }
    if (input.fromHolderId === input.toHolderId) {
      throw new BadRequestException('fromHolderId must differ from toHolderId')
    }
    return this.database.tx(async client => {
      const balance = await this.holderBalance(client, input.securityId, input.fromHolderId)
      if (balance < input.quantity) {
        throw new BadRequestException(
          `Holder ${input.fromHolderId} has ${balance} units of ${input.securityId}; cannot transfer ${input.quantity}`,
        )
      }
      const event = await this.insertTransfer(client, input)
      await this.recordAudit(client, event, actor, 'LEDGER_TRANSFER')
      return event
    })
  }

  async cancel(input: CancelInput, actor: ActorContext): Promise<LedgerEvent> {
    if (input.quantity <= 0) {
      throw new BadRequestException('quantity must be positive')
    }
    return this.database.tx(async client => {
      const balance = await this.holderBalance(client, input.securityId, input.holderId)
      if (balance < input.quantity) {
        throw new BadRequestException(`Holder ${input.holderId} has ${balance} units; cannot cancel ${input.quantity}`)
      }
      const event = await this.insertCancel(client, input)
      await this.recordAudit(client, event, actor, 'LEDGER_CANCEL')
      return event
    })
  }

  async adjust(input: AdjustmentInput, actor: ActorContext): Promise<LedgerEvent> {
    if (!input.reason || input.reason.trim().length < 4) {
      throw new BadRequestException('reason is required for ledger adjustments')
    }
    if (!Number.isFinite(input.delta) || input.delta === 0) {
      throw new BadRequestException('delta must be a non-zero finite number')
    }
    return this.database.tx(async client => {
      if (input.delta < 0) {
        const balance = await this.holderBalance(client, input.securityId, input.holderId)
        if (balance + input.delta < 0) {
          throw new BadRequestException(`Adjustment would produce negative balance (current=${balance}, delta=${input.delta})`)
        }
      }
      const result = await client.query<LedgerEventRow>(
        `INSERT INTO ledger_events (type, case_id, security_id, holder_id, quantity, timestamp, reason, metadata)
         VALUES ('ADJUSTMENT', $1, $2, $3, $4, NOW(), $5, $6::jsonb)
         RETURNING id, type, case_id, security_id, from_holder_id, to_holder_id, holder_id, quantity, timestamp, reason, metadata`,
        [input.caseId || null, input.securityId, input.holderId, input.delta, input.reason, JSON.stringify(input.metadata || {})],
      )
      const event = mapLedgerEvent(result.rows[0])
      await this.recordAudit(client, event, actor, 'LEDGER_ADJUSTMENT')
      return event
    })
  }

  /**
   * Low-level insert helpers used by higher-level services running inside their own transaction.
   * These DO NOT perform balance validation or audit recording on their own.
   */
  async insertIssue(client: Queryable, input: IssueInput): Promise<LedgerEvent> {
    const result = await client.query<LedgerEventRow>(
      `INSERT INTO ledger_events (type, case_id, security_id, holder_id, quantity, timestamp, reason, metadata)
       VALUES ('ISSUE', $1, $2, $3, $4, NOW(), $5, $6::jsonb)
       RETURNING id, type, case_id, security_id, from_holder_id, to_holder_id, holder_id, quantity, timestamp, reason, metadata`,
      [input.caseId || null, input.securityId, input.holderId, input.quantity, input.reason || null, JSON.stringify(input.metadata || {})],
    )
    return mapLedgerEvent(result.rows[0])
  }

  async insertTransfer(client: Queryable, input: TransferInput): Promise<LedgerEvent> {
    const result = await client.query<LedgerEventRow>(
      `INSERT INTO ledger_events (type, case_id, security_id, from_holder_id, to_holder_id, quantity, timestamp, reason, metadata)
       VALUES ('TRANSFER', $1, $2, $3, $4, $5, NOW(), $6, $7::jsonb)
       RETURNING id, type, case_id, security_id, from_holder_id, to_holder_id, holder_id, quantity, timestamp, reason, metadata`,
      [
        input.caseId || null,
        input.securityId,
        input.fromHolderId,
        input.toHolderId,
        input.quantity,
        input.reason || null,
        JSON.stringify(input.metadata || {}),
      ],
    )
    return mapLedgerEvent(result.rows[0])
  }

  async insertCancel(client: Queryable, input: CancelInput): Promise<LedgerEvent> {
    const result = await client.query<LedgerEventRow>(
      `INSERT INTO ledger_events (type, case_id, security_id, holder_id, quantity, timestamp, reason, metadata)
       VALUES ('CANCEL', $1, $2, $3, $4, NOW(), $5, $6::jsonb)
       RETURNING id, type, case_id, security_id, from_holder_id, to_holder_id, holder_id, quantity, timestamp, reason, metadata`,
      [input.caseId || null, input.securityId, input.holderId, input.quantity, input.reason || null, JSON.stringify(input.metadata || {})],
    )
    return mapLedgerEvent(result.rows[0])
  }

  async getPositions(): Promise<Position[]> {
    const result = await this.database.query<{ security_id: string; holder_id: string; quantity: string }>(
      `SELECT security_id, holder_id, quantity FROM v_holdings WHERE quantity <> 0 ORDER BY security_id, holder_id`,
    )
    return result.rows.map(row => ({
      holderId: row.holder_id,
      quantity: Number(row.quantity),
      securityId: row.security_id,
    }))
  }

  async getPositionsFor(securityId: string): Promise<Position[]> {
    const result = await this.database.query<{ holder_id: string; quantity: string }>(
      `SELECT holder_id, quantity FROM v_holdings WHERE security_id = $1 AND quantity <> 0 ORDER BY holder_id`,
      [securityId],
    )
    return result.rows.map(row => ({
      holderId: row.holder_id,
      quantity: Number(row.quantity),
      securityId,
    }))
  }

  async holderBalance(client: Queryable, securityId: string, holderId: string): Promise<number> {
    const result = await client.query<{ balance: string | null }>(
      `SELECT (
         COALESCE(SUM(CASE WHEN type = 'ISSUE' AND holder_id = $2 THEN quantity ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN type = 'CANCEL' AND holder_id = $2 THEN quantity ELSE 0 END), 0)
         + COALESCE(SUM(CASE WHEN type = 'ADJUSTMENT' AND holder_id = $2 THEN quantity ELSE 0 END), 0)
         + COALESCE(SUM(CASE WHEN type = 'TRANSFER' AND to_holder_id = $2 THEN quantity ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN type = 'TRANSFER' AND from_holder_id = $2 THEN quantity ELSE 0 END), 0)
       )::text AS balance
       FROM ledger_events
       WHERE security_id = $1`,
      [securityId, holderId],
    )
    return Number(result.rows[0]?.balance || 0)
  }

  /**
   * Compute holdings as of a record-date cutoff (inclusive end-of-day UTC).
   * Used by dividends and voting eligibility.
   */
  async getPositionsAsOf(securityId: string, recordDateIso: string): Promise<Position[]> {
    const recordDate = normalizeRecordDate(recordDateIso)
    const cutoff = `${recordDate}T23:59:59.999Z`
    const result = await this.database.query<{ holder_id: string; quantity: string }>(
      `WITH base AS (
         SELECT * FROM ledger_events WHERE security_id = $1 AND timestamp <= $2
       ),
       issuance AS (
         SELECT holder_id, SUM(quantity)::BIGINT AS qty FROM base WHERE type = 'ISSUE' AND holder_id IS NOT NULL GROUP BY holder_id
       ),
       cancellations AS (
         SELECT holder_id, SUM(quantity)::BIGINT AS qty FROM base WHERE type = 'CANCEL' AND holder_id IS NOT NULL GROUP BY holder_id
       ),
       adjustments AS (
         SELECT holder_id, SUM(quantity)::BIGINT AS qty FROM base WHERE type = 'ADJUSTMENT' AND holder_id IS NOT NULL GROUP BY holder_id
       ),
       transfers_in AS (
         SELECT to_holder_id AS holder_id, SUM(quantity)::BIGINT AS qty FROM base WHERE type = 'TRANSFER' AND to_holder_id IS NOT NULL GROUP BY to_holder_id
       ),
       transfers_out AS (
         SELECT from_holder_id AS holder_id, SUM(quantity)::BIGINT AS qty FROM base WHERE type = 'TRANSFER' AND from_holder_id IS NOT NULL GROUP BY from_holder_id
       ),
       all_holders AS (
         SELECT holder_id FROM issuance
         UNION SELECT holder_id FROM cancellations
         UNION SELECT holder_id FROM adjustments
         UNION SELECT holder_id FROM transfers_in
         UNION SELECT holder_id FROM transfers_out
       )
       SELECT h.holder_id,
              (COALESCE(i.qty,0) - COALESCE(c.qty,0) + COALESCE(a.qty,0) + COALESCE(ti.qty,0) - COALESCE(tout.qty,0))::text AS quantity
       FROM all_holders h
       LEFT JOIN issuance i ON i.holder_id = h.holder_id
       LEFT JOIN cancellations c ON c.holder_id = h.holder_id
       LEFT JOIN adjustments a ON a.holder_id = h.holder_id
       LEFT JOIN transfers_in ti ON ti.holder_id = h.holder_id
       LEFT JOIN transfers_out tout ON tout.holder_id = h.holder_id
       WHERE h.holder_id IS NOT NULL`,
      [securityId, cutoff],
    )
    return result.rows
      .map(row => ({ holderId: row.holder_id, quantity: Number(row.quantity), securityId }))
      .filter(position => position.quantity > 0)
  }

  private async recordAudit(client: PoolClient, event: LedgerEvent, actor: ActorContext, action: string) {
    await this.auditService.record(
      {
        action,
        actorId: actor.actorId,
        actorRole: actor.actorRole,
        entityId: String(event.id),
        entityType: 'LEDGER_EVENT',
        ip: actor.ip,
        metadata: {
          fromHolderId: event.fromHolderId,
          holderId: event.holderId,
          quantity: event.quantity,
          reason: event.reason,
          securityId: event.securityId,
          toHolderId: event.toHolderId,
          type: event.type,
        },
        userAgent: actor.userAgent,
      },
      client,
    )
  }
}

function normalizeRecordDate(input: string): string {
  const trimmed = input.trim()
  const ymd = /^\d{4}-\d{2}-\d{2}$/
  if (ymd.test(trimmed)) return trimmed

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`Invalid recordDate "${input}"`)
  }
  return parsed.toISOString().slice(0, 10)
}

function mapLedgerEvent(row: LedgerEventRow): LedgerEvent {
  return {
    caseId: row.case_id || undefined,
    fromHolderId: row.from_holder_id || undefined,
    holderId: row.holder_id || undefined,
    id: row.id,
    metadata: row.metadata || {},
    quantity: Number(row.quantity),
    reason: row.reason || undefined,
    securityId: row.security_id,
    timestamp: new Date(row.timestamp),
    toHolderId: row.to_holder_id || undefined,
    type: row.type,
  }
}
