import { Injectable } from '@nestjs/common'

import { DatabaseService } from '../database/database.service.js'

export type LedgerEventType = 'ISSUE' | 'TRANSFER' | 'CANCEL'

export interface LedgerEvent {
  id: number
  type: LedgerEventType
  securityId: string
  fromHolderId?: string
  toHolderId?: string
  holderId?: string
  quantity: number
  timestamp: Date
}

export interface Position {
  securityId: string
  holderId: string
  quantity: number
}

type LedgerEventRow = {
  id: number
  type: LedgerEventType
  security_id: string
  from_holder_id: string | null
  to_holder_id: string | null
  holder_id: string | null
  quantity: number
  timestamp: Date
}

@Injectable()
export class LedgerService {
  constructor(private readonly database: DatabaseService) {}

  async getEvents(): Promise<LedgerEvent[]> {
    const result = await this.database.query<LedgerEventRow>(
      `SELECT id, type, security_id, from_holder_id, to_holder_id, holder_id, quantity, timestamp
       FROM ledger_events
       ORDER BY timestamp DESC`,
    )
    return result.rows.map(mapLedgerEvent)
  }

  async issue(securityId: string, holderId: string, quantity: number): Promise<LedgerEvent> {
    const result = await this.database.query<LedgerEventRow>(
      `INSERT INTO ledger_events (type, security_id, holder_id, quantity, timestamp)
       VALUES ('ISSUE', $1, $2, $3, NOW())
       RETURNING id, type, security_id, from_holder_id, to_holder_id, holder_id, quantity, timestamp`,
      [securityId, holderId, quantity],
    )
    return mapLedgerEvent(result.rows[0])
  }

  async transfer(securityId: string, fromHolderId: string, toHolderId: string, quantity: number): Promise<LedgerEvent> {
    const result = await this.database.query<LedgerEventRow>(
      `INSERT INTO ledger_events (type, security_id, from_holder_id, to_holder_id, quantity, timestamp)
       VALUES ('TRANSFER', $1, $2, $3, $4, NOW())
       RETURNING id, type, security_id, from_holder_id, to_holder_id, holder_id, quantity, timestamp`,
      [securityId, fromHolderId, toHolderId, quantity],
    )
    return mapLedgerEvent(result.rows[0])
  }

  async cancel(securityId: string, holderId: string, quantity: number): Promise<LedgerEvent> {
    const result = await this.database.query<LedgerEventRow>(
      `INSERT INTO ledger_events (type, security_id, holder_id, quantity, timestamp)
       VALUES ('CANCEL', $1, $2, $3, NOW())
       RETURNING id, type, security_id, from_holder_id, to_holder_id, holder_id, quantity, timestamp`,
      [securityId, holderId, quantity],
    )
    return mapLedgerEvent(result.rows[0])
  }

  async getPositions(): Promise<Position[]> {
    const events = await this.getEvents()
    const positions = new Map<string, number>()
    for (const event of events) {
      switch (event.type) {
        case 'ISSUE': {
          const key = `${event.securityId}::${event.holderId}`
          positions.set(key, (positions.get(key) || 0) + event.quantity)
          break
        }
        case 'TRANSFER': {
          const fromKey = `${event.securityId}::${event.fromHolderId}`
          const toKey = `${event.securityId}::${event.toHolderId}`
          positions.set(fromKey, (positions.get(fromKey) || 0) - event.quantity)
          positions.set(toKey, (positions.get(toKey) || 0) + event.quantity)
          break
        }
        case 'CANCEL': {
          const key = `${event.securityId}::${event.holderId}`
          positions.set(key, (positions.get(key) || 0) - event.quantity)
          break
        }
      }
    }

    return Array.from(positions.entries())
      .filter(([, quantity]) => quantity !== 0)
      .map(([key, quantity]) => {
        const [securityId, holderId] = key.split('::')
        return { holderId: holderId || 'unknown', quantity, securityId }
      })
  }
}

function mapLedgerEvent(row: LedgerEventRow): LedgerEvent {
  return {
    fromHolderId: row.from_holder_id || undefined,
    holderId: row.holder_id || undefined,
    id: row.id,
    quantity: row.quantity,
    securityId: row.security_id,
    timestamp: row.timestamp,
    toHolderId: row.to_holder_id || undefined,
    type: row.type,
  }
}
