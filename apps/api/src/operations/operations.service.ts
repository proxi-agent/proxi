import { Injectable } from '@nestjs/common'

import { DatabaseService } from '../database/database.service.js'
import { PORTAL_MOCKS, type PortalMockPayload } from '../mock/portal-mocks.js'

export interface AuditTrailEntry {
  id: number
  actor: string
  action: string
  entityType: 'CASE' | 'LEDGER_EVENT' | 'POSITION'
  entityId: string
  timestamp: Date
}

export interface ExceptionItem {
  id: number
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  source: 'CASE_ENGINE' | 'LEDGER' | 'RECONCILIATION'
  message: string
  status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED'
  owner: string
  createdAt: Date
}

export interface HolderProfile {
  holderId: string
  classification: 'FUND' | 'INSTITUTION' | 'RETAIL' | 'TREASURY'
  jurisdiction: string
  riskTier: 'LOW' | 'MEDIUM' | 'HIGH'
  activeSecurities: number
  totalUnits: number
}

export interface ReconciliationBreak {
  id: number
  securityId: string
  holderId: string
  expectedQuantity: number
  ledgerQuantity: number
  delta: number
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED'
  updatedAt: Date
}

export interface ReportsSummary {
  aiJobsFailed: number
  aiJobsQueued: number
  aiJobsSucceeded: number
  exceptionRatePct: number
  openBreaks: number
  reconciliationAccuracyPct: number
  totalCases: number
  totalLedgerEvents: number
}

export interface PortalMockResponse extends PortalMockPayload {
  page: string
}

@Injectable()
export class OperationsService {
  private readonly exceptions: ExceptionItem[] = []
  private readonly holderProfiles: HolderProfile[] = []
  private readonly reconciliationBreaks: ReconciliationBreak[] = []

  constructor(private readonly database: DatabaseService) {
    this.exceptions = this.seedExceptions()
    this.holderProfiles = this.seedHolderProfiles()
    this.reconciliationBreaks = this.seedReconciliationBreaks()
  }

  async getAuditTrail(): Promise<AuditTrailEntry[]> {
    const caseEvents = await this.database.query<{
      actor: string
      created_at: Date
      event_type: string
      id: number
      case_id: number
    }>(
      `SELECT id, case_id, event_type, actor, created_at
       FROM transfer_case_events
       ORDER BY created_at DESC
       LIMIT 200`,
    )
    const ledgerEvents = await this.database.query<{
      id: number
      timestamp: Date
      type: string
      case_id: number | null
    }>(
      `SELECT id, type, case_id, timestamp
       FROM ledger_events
       ORDER BY timestamp DESC
       LIMIT 200`,
    )

    const mappedCaseEvents: AuditTrailEntry[] = caseEvents.rows.map(event => ({
      action: event.event_type,
      actor: event.actor,
      entityId: `CASE-${event.case_id}`,
      entityType: 'CASE',
      id: event.id,
      timestamp: new Date(event.created_at),
    }))
    const mappedLedgerEvents: AuditTrailEntry[] = ledgerEvents.rows.map(event => ({
      action: `LEDGER_${event.type}`,
      actor: 'system',
      entityId: event.case_id ? `CASE-${event.case_id}` : `LEDGER_EVENT-${event.id}`,
      entityType: 'LEDGER_EVENT',
      id: 100000 + event.id,
      timestamp: new Date(event.timestamp),
    }))

    return [...mappedCaseEvents, ...mappedLedgerEvents].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 200)
  }

  getExceptions(): ExceptionItem[] {
    return [...this.exceptions].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }

  getHolderProfiles(): HolderProfile[] {
    return [...this.holderProfiles].sort((a, b) => a.holderId.localeCompare(b.holderId))
  }

  getReconciliationBreaks(): ReconciliationBreak[] {
    return [...this.reconciliationBreaks].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
  }

  async getReportsSummary(): Promise<ReportsSummary> {
    const [cases, ledger, queued, failed, succeeded] = await Promise.all([
      this.database.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM transfer_cases'),
      this.database.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM ledger_events'),
      this.database.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM transfer_jobs WHERE status = 'QUEUED'"),
      this.database.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM transfer_jobs WHERE status = 'FAILED'"),
      this.database.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM transfer_jobs WHERE status = 'SUCCEEDED'"),
    ])

    const totalCases = Number(cases.rows[0]?.count || '0')
    const openBreaks = this.reconciliationBreaks.filter(item => item.status !== 'RESOLVED').length
    return {
      aiJobsFailed: Number(failed.rows[0]?.count || '0'),
      aiJobsQueued: Number(queued.rows[0]?.count || '0'),
      aiJobsSucceeded: Number(succeeded.rows[0]?.count || '0'),
      exceptionRatePct: totalCases ? Number(((openBreaks / totalCases) * 100).toFixed(2)) : 0,
      openBreaks,
      reconciliationAccuracyPct: 98.9,
      totalCases,
      totalLedgerEvents: Number(ledger.rows[0]?.count || '0'),
    }
  }

  getPortalMock(page: string, transferId?: string): PortalMockResponse | null {
    const template = PORTAL_MOCKS[page]
    if (!template) {
      return null
    }

    const tokenized = JSON.stringify(template).replaceAll('{{transferId}}', transferId || 'TRANSFER-1234')
    const payload = JSON.parse(tokenized) as PortalMockPayload
    return {
      page,
      ...payload,
    }
  }

  private seedExceptions(): ExceptionItem[] {
    return [
      {
        id: 1,
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        message: 'Transfer quantity exceeds available holder balance.',
        owner: 'Ops Queue',
        severity: 'HIGH',
        source: 'LEDGER',
        status: 'OPEN',
      },
      {
        id: 2,
        createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
        message: 'Missing medallion guarantee attachment for transfer case.',
        owner: 'Compliance',
        severity: 'MEDIUM',
        source: 'CASE_ENGINE',
        status: 'IN_REVIEW',
      },
      {
        id: 3,
        createdAt: new Date(Date.now() - 7 * 60 * 60 * 1000),
        message: 'Negative reconciliation delta above threshold for PROXI-CLASS-B.',
        owner: 'Reconciliation Desk',
        severity: 'CRITICAL',
        source: 'RECONCILIATION',
        status: 'OPEN',
      },
      {
        id: 4,
        createdAt: new Date(Date.now() - 10 * 60 * 60 * 1000),
        message: 'Duplicate issue request detected and auto-blocked.',
        owner: 'Ops Queue',
        severity: 'LOW',
        source: 'CASE_ENGINE',
        status: 'RESOLVED',
      },
    ]
  }

  private seedHolderProfiles(): HolderProfile[] {
    return [
      {
        activeSecurities: 5,
        classification: 'INSTITUTION',
        holderId: 'ALPHA_CAPITAL',
        jurisdiction: 'US',
        riskTier: 'LOW',
        totalUnits: 620000,
      },
      {
        activeSecurities: 4,
        classification: 'FUND',
        holderId: 'AURORA_FUND',
        jurisdiction: 'UK',
        riskTier: 'MEDIUM',
        totalUnits: 485000,
      },
      {
        activeSecurities: 3,
        classification: 'TREASURY',
        holderId: 'BANYAN_TRUST',
        jurisdiction: 'US',
        riskTier: 'LOW',
        totalUnits: 710000,
      },
      {
        activeSecurities: 2,
        classification: 'RETAIL',
        holderId: 'DELTA_VENTURES',
        jurisdiction: 'SG',
        riskTier: 'HIGH',
        totalUnits: 92000,
      },
      {
        activeSecurities: 3,
        classification: 'INSTITUTION',
        holderId: 'EVEREST_PARTNERS',
        jurisdiction: 'CA',
        riskTier: 'MEDIUM',
        totalUnits: 358000,
      },
    ]
  }

  private seedReconciliationBreaks(): ReconciliationBreak[] {
    return [
      {
        delta: -2200,
        expectedQuantity: 190000,
        holderId: 'AURORA_FUND',
        id: 1,
        ledgerQuantity: 187800,
        securityId: 'PROXI-CLASS-A',
        status: 'OPEN',
        updatedAt: new Date(Date.now() - 75 * 60 * 1000),
      },
      {
        delta: 800,
        expectedQuantity: 124000,
        holderId: 'ALPHA_CAPITAL',
        id: 2,
        ledgerQuantity: 124800,
        securityId: 'PROXI-GROWTH',
        status: 'INVESTIGATING',
        updatedAt: new Date(Date.now() - 2.5 * 60 * 60 * 1000),
      },
      {
        delta: 0,
        expectedQuantity: 91000,
        holderId: 'DELTA_VENTURES',
        id: 3,
        ledgerQuantity: 91000,
        securityId: 'PROXI-INCOME',
        status: 'RESOLVED',
        updatedAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
      },
      {
        delta: -1500,
        expectedQuantity: 340000,
        holderId: 'BANYAN_TRUST',
        id: 4,
        ledgerQuantity: 338500,
        securityId: 'PROXI-CLASS-B',
        status: 'OPEN',
        updatedAt: new Date(Date.now() - 9 * 60 * 60 * 1000),
      },
    ]
  }
}
