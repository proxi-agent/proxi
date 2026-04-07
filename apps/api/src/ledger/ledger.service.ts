import { Injectable } from '@nestjs/common'

export type LedgerEventType = 'ISSUE' | 'TRANSFER' | 'CANCEL'

export interface LedgerEvent {
  id: number
  type: LedgerEventType
  securityId: string
  fromHolderId?: string
  toHolderId?: string
  holderId?: string // for ISSUE or CANCEL
  quantity: number
  timestamp: Date
}

export interface Position {
  securityId: string
  holderId: string
  quantity: number
}

@Injectable()
export class LedgerService {
  private events: LedgerEvent[] = []
  private nextId = 1

  /**
   * Return all ledger events.  In a production system you would page these results.
   */
  getEvents(): LedgerEvent[] {
    return this.events
  }

  /**
   * Issue new shares of a security to a holder.
   */
  issue(securityId: string, holderId: string, quantity: number): LedgerEvent {
    const event: LedgerEvent = {
      id: this.nextId++,
      type: 'ISSUE',
      securityId,
      holderId,
      quantity,
      timestamp: new Date(),
    }
    this.events.push(event)
    return event
  }

  /**
   * Transfer shares from one holder to another.
   */
  transfer(securityId: string, fromHolderId: string, toHolderId: string, quantity: number): LedgerEvent {
    const event: LedgerEvent = {
      id: this.nextId++,
      type: 'TRANSFER',
      securityId,
      fromHolderId,
      toHolderId,
      quantity,
      timestamp: new Date(),
    }
    this.events.push(event)
    return event
  }

  /**
   * Cancel shares from a holder (e.g. retirement).  Not used in the MVP but provided for completeness.
   */
  cancel(securityId: string, holderId: string, quantity: number): LedgerEvent {
    const event: LedgerEvent = {
      id: this.nextId++,
      type: 'CANCEL',
      securityId,
      holderId,
      quantity,
      timestamp: new Date(),
    }
    this.events.push(event)
    return event
  }

  /**
   * Compute current positions by replaying events.  This is a simple projection; in a real system you
   * would maintain positions in the database.
   */
  getPositions(): Position[] {
    const positions = new Map<string, number>()
    for (const event of this.events) {
      switch (event.type) {
        case 'ISSUE': {
          const key = `${event.securityId}::${event.holderId}`
          positions.set(key, (positions.get(key) || 0) + event.quantity)
          break
        }
        case 'TRANSFER': {
          const fromKey = `${event.securityId}::${event.fromHolderId}`
          positions.set(fromKey, (positions.get(fromKey) || 0) - event.quantity)
          const toKey = `${event.securityId}::${event.toHolderId}`
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
    return Array.from(positions.entries()).map(([key, qty]) => {
      const [securityId, holderId] = key.split('::')
      return { securityId, holderId, quantity: qty } as Position
    })
  }
}
