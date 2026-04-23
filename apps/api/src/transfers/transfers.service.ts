import { Injectable } from '@nestjs/common'

import type { CaseType } from '../cases/cases.service.js'
import { CasesService } from '../cases/cases.service.js'
import type { PaginatedResponse } from '../common/pagination.js'
import { buildPaginated, pageOffset, resolveSort } from '../common/pagination.js'
import { DatabaseService } from '../database/database.service.js'

import type { TransferListQuery } from './transfers.dto.js'
import type { TransferState, TransferStats, TransferSummary } from './transfers.types.js'
import { deriveTransferState, mapCaseToTransferSummary, TRANSFER_STATES } from './transfers.types.js'

const SORTABLE: Record<string, string> = {
  createdAt: 'created_at',
  quantity: 'quantity',
  securityId: 'security_id',
  status: 'status',
  type: 'type',
  updatedAt: 'updated_at',
}

type CaseSummaryRow = {
  ai_confidence: number | null
  ai_summary: string | null
  assigned_reviewer_id: string | null
  created_at: Date
  evidence_required: string[]
  evidence_submitted: string[]
  from_holder_id: string | null
  holder_id: string | null
  id: number
  intake_method: 'DOCUMENT_UPLOAD' | 'GUIDED_ENTRY'
  last_ai_job_id: number | null
  ledger_event_id: number | null
  lifecycle_stage:
    | 'AI_PROCESSING'
    | 'AI_REVIEW_REQUIRED'
    | 'APPROVED'
    | 'COMPLETED'
    | 'DRAFT'
    | 'EVIDENCE_PENDING'
    | 'EXCEPTION'
    | 'INTAKE_SUBMITTED'
    | 'LEDGER_POSTED'
    | 'REJECTED'
    | 'REVIEW_PENDING'
  missing_evidence: string[]
  quantity: number
  restriction_blocking_reasons: string[]
  security_id: string
  status: 'APPROVED' | 'COMPLETED' | 'EXCEPTION' | 'IN_REVIEW' | 'PENDING' | 'REJECTED'
  to_holder_id: string | null
  type: CaseType
  updated_at: Date
}

const LIFECYCLE_BY_STATE: Record<TransferState, string[]> = {
  APPROVED: ['APPROVED'],
  EVIDENCE_PENDING: ['EVIDENCE_PENDING'],
  EXCEPTION: ['EXCEPTION'],
  IN_REVIEW: ['AI_REVIEW_REQUIRED', 'REVIEW_PENDING'],
  PROCESSING: ['AI_PROCESSING'],
  REJECTED: ['REJECTED'],
  SETTLED: ['COMPLETED', 'LEDGER_POSTED'],
  SUBMITTED: ['DRAFT', 'INTAKE_SUBMITTED'],
}

@Injectable()
export class TransfersService {
  constructor(
    private readonly casesService: CasesService,
    private readonly database: DatabaseService,
  ) {}

  async list(query: TransferListQuery): Promise<PaginatedResponse<TransferSummary>> {
    const where: string[] = []
    const params: unknown[] = []

    if (query.state) {
      params.push(LIFECYCLE_BY_STATE[query.state])
      where.push(`lifecycle_stage = ANY($${params.length}::text[])`)
    }
    if (query.type) {
      params.push(query.type)
      where.push(`type = $${params.length}`)
    }
    if (query.securityId) {
      params.push(query.securityId)
      where.push(`security_id = $${params.length}`)
    }
    if (query.holderId) {
      params.push(query.holderId)
      where.push(`(holder_id = $${params.length} OR from_holder_id = $${params.length} OR to_holder_id = $${params.length})`)
    }
    if (query.assignedReviewerId) {
      params.push(query.assignedReviewerId)
      where.push(`assigned_reviewer_id = $${params.length}`)
    }
    if (query.q) {
      params.push(`%${query.q.toLowerCase()}%`)
      where.push(
        `(LOWER(security_id) LIKE $${params.length}
         OR LOWER(COALESCE(holder_id, '')) LIKE $${params.length}
         OR LOWER(COALESCE(from_holder_id, '')) LIKE $${params.length}
         OR LOWER(COALESCE(to_holder_id, '')) LIKE $${params.length})`,
      )
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const sort = resolveSort(query, SORTABLE, { column: 'created_at', dir: 'desc' })

    const countResult = await this.database.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM transfer_cases ${whereSql}`,
      params,
    )
    const total = Number(countResult.rows[0]?.count || '0')

    params.push(query.pageSize)
    const limitParam = params.length
    params.push(pageOffset(query))
    const offsetParam = params.length

    const rows = await this.database.query<CaseSummaryRow>(
      `SELECT id, type, security_id, quantity, from_holder_id, to_holder_id, holder_id, status, lifecycle_stage,
              intake_method, assigned_reviewer_id, ai_confidence, ai_summary, ledger_event_id, last_ai_job_id,
              evidence_required, evidence_submitted, missing_evidence, restriction_blocking_reasons, created_at, updated_at
       FROM transfer_cases ${whereSql}
       ORDER BY ${sort.column} ${sort.dir.toUpperCase()}
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params,
    )

    const items = rows.rows.map(mapRowToTransferSummary)
    return buildPaginated(items, total, query)
  }

  async getById(id: number): Promise<TransferSummary & { raw: Awaited<ReturnType<CasesService['getCaseById']>> }> {
    const caseData = await this.casesService.getCaseById(id)
    return { ...mapCaseToTransferSummary(caseData), raw: caseData }
  }

  async stats(): Promise<TransferStats> {
    const result = await this.database.query<{ type: CaseType; lifecycle_stage: string; count: string }>(
      `SELECT type, lifecycle_stage, COUNT(*)::text AS count
       FROM transfer_cases
       GROUP BY type, lifecycle_stage`,
    )

    const byState = TRANSFER_STATES.reduce<Record<TransferState, number>>(
      (accumulator, state) => {
        accumulator[state] = 0
        return accumulator
      },
      {} as Record<TransferState, number>,
    )
    const byType: Record<CaseType, number> = { CANCEL: 0, ISSUE: 0, TRANSFER: 0 }
    let total = 0

    for (const row of result.rows) {
      const count = Number(row.count)
      total += count
      const state = deriveTransferState({
        lifecycleStage: row.lifecycle_stage as CaseSummaryRow['lifecycle_stage'],
        status: 'PENDING',
      })
      byState[state] = (byState[state] || 0) + count
      byType[row.type] = (byType[row.type] || 0) + count
    }

    return { byState, byType, total }
  }
}

function mapRowToTransferSummary(row: CaseSummaryRow): TransferSummary {
  const missingEvidence = (row.missing_evidence || []).length
  const state = deriveTransferState({ lifecycleStage: row.lifecycle_stage, status: row.status })
  return {
    aiConfidence: row.ai_confidence === null ? undefined : Number(row.ai_confidence),
    aiSummary: row.ai_summary || undefined,
    assignedReviewerId: row.assigned_reviewer_id || undefined,
    createdAt: new Date(row.created_at),
    evidenceComplete: missingEvidence === 0,
    fromHolderId: row.from_holder_id || undefined,
    hasBlockingRestrictions: (row.restriction_blocking_reasons || []).length > 0,
    holderId: row.holder_id || undefined,
    id: row.id,
    intakeMethod: row.intake_method,
    lastAiJobId: row.last_ai_job_id || undefined,
    ledgerEventId: row.ledger_event_id || undefined,
    lifecycleStage: row.lifecycle_stage,
    missingEvidenceCount: missingEvidence,
    quantity: Number(row.quantity),
    securityId: row.security_id,
    sourceCaseStatus: row.status,
    state,
    toHolderId: row.to_holder_id || undefined,
    type: row.type,
    updatedAt: new Date(row.updated_at),
  }
}
