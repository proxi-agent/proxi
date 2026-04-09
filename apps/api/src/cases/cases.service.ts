import type { OnModuleInit } from '@nestjs/common'
import { Injectable, NotFoundException } from '@nestjs/common'

import { DatabaseService } from '../database/database.service.js'
import { LedgerService } from '../ledger/ledger.service.js'
import type { RestrictionCheck, RestrictionContext } from '../rules/rules.service.js'
import { RulesService } from '../rules/rules.service.js'

export type CaseLifecycleStage = 'APPROVED' | 'COMPLETED' | 'EVIDENCE_PENDING' | 'FAILED' | 'REJECTED' | 'REQUESTED' | 'RESTRICTIONS_REVIEW'
export type CaseStatus = 'COMPLETED' | 'FAILED' | 'PENDING'
export type CaseType = 'CANCEL' | 'ISSUE' | 'TRANSFER'

export interface CreateCaseInput {
  evidenceDocs?: string[]
  fromHolderId?: string
  holderId?: string
  quantity: number
  restrictionContext?: RestrictionContext
  securityId: string
  toHolderId?: string
  type: CaseType
}

export interface Case {
  createdAt: Date
  evidenceRequired: string[]
  evidenceSubmitted: string[]
  failureReason?: string
  id: number
  lifecycleStage: CaseLifecycleStage
  missingEvidence: string[]
  restrictionBlockingReasons: string[]
  restrictionContext: RestrictionContext
  restrictionChecks: Array<{ detail: string; name: string; passed: boolean }>
  status: CaseStatus
  updatedAt: Date
  type: CaseType
  securityId: string
  fromHolderId?: string
  toHolderId?: string
  holderId?: string
  quantity: number
}

type CaseRow = {
  id: number
  created_at: Date
  updated_at: Date
  type: CaseType
  security_id: string
  quantity: number
  from_holder_id: string | null
  to_holder_id: string | null
  holder_id: string | null
  status: CaseStatus
  lifecycle_stage: CaseLifecycleStage
  evidence_required: string[]
  evidence_submitted: string[]
  missing_evidence: string[]
  restriction_blocking_reasons: string[]
  restriction_checks: Array<{ detail: string; name: string; passed: boolean }>
  restriction_context: RestrictionContext
  failure_reason: string | null
}

@Injectable()
export class CasesService implements OnModuleInit {
  constructor(
    private readonly database: DatabaseService,
    private readonly ledgerService: LedgerService,
    private readonly rulesService: RulesService,
  ) {}

  async onModuleInit() {
    const count = await this.database.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM transfer_cases')
    if (Number(count.rows[0]?.count || '0') === 0) {
      await this.seedDummyCases()
    }
  }

  private getRequiredEvidence(type: CaseType): string[] {
    if (type === 'TRANSFER') {
      return ['Identity verification', 'Medallion signature guarantee', 'Stock power document', 'Transfer instruction letter']
    }
    if (type === 'ISSUE') {
      return ['Board resolution approving issuance', 'Issuance instruction notice']
    }
    return ['Cancellation authorization', 'Supporting legal/tax release (if applicable)']
  }

  private normalizeEvidence(docs: string[] = []): string[] {
    return Array.from(new Set(docs.map(doc => doc.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  }

  private hydrateEvidenceState(entry: Case): void {
    const submitted = this.normalizeEvidence(entry.evidenceSubmitted)
    entry.evidenceSubmitted = submitted
    entry.missingEvidence = entry.evidenceRequired.filter(requiredDoc => !submitted.includes(requiredDoc))
  }

  private async executeLedgerStep(entry: Case): Promise<void> {
    if (entry.type === 'TRANSFER' && entry.fromHolderId && entry.toHolderId) {
      await this.ledgerService.transfer(entry.securityId, entry.fromHolderId, entry.toHolderId, entry.quantity)
      return
    }
    if (entry.type === 'ISSUE' && entry.holderId) {
      await this.ledgerService.issue(entry.securityId, entry.holderId, entry.quantity)
      return
    }
    if (entry.type === 'CANCEL' && entry.holderId) {
      await this.ledgerService.cancel(entry.securityId, entry.holderId, entry.quantity)
    }
  }

  private async processCase(entry: Case, context?: RestrictionContext): Promise<Case> {
    entry.updatedAt = new Date()
    entry.lifecycleStage = 'REQUESTED'
    if (context) {
      entry.restrictionContext = { ...entry.restrictionContext, ...context }
    }

    this.hydrateEvidenceState(entry)
    if (entry.missingEvidence.length > 0) {
      entry.lifecycleStage = 'EVIDENCE_PENDING'
      entry.status = 'PENDING'
      entry.failureReason = `Missing evidence: ${entry.missingEvidence.join(', ')}`
      entry.restrictionBlockingReasons = []
      entry.restrictionChecks = []
      return this.persistCase(entry)
    }

    entry.lifecycleStage = 'RESTRICTIONS_REVIEW'
    if (entry.type === 'TRANSFER') {
      const evaluation = await this.rulesService.evaluateTransferEligibility({
        ...entry.restrictionContext,
        fromHolderId: entry.fromHolderId,
        quantity: entry.quantity,
        securityId: entry.securityId,
        toHolderId: entry.toHolderId,
        type: entry.type,
      })
      entry.restrictionBlockingReasons = evaluation.blockingReasons
      entry.restrictionChecks = evaluation.checks.map((check: RestrictionCheck) => ({
        detail: check.detail,
        name: check.name,
        passed: check.passed,
      }))
      if (!evaluation.eligible) {
        entry.lifecycleStage = 'REJECTED'
        entry.status = 'FAILED'
        entry.failureReason = `Restriction checks failed: ${evaluation.blockingReasons.join(', ')}`
        return this.persistCase(entry)
      }
    } else {
      entry.restrictionBlockingReasons = []
      entry.restrictionChecks = []
    }

    entry.lifecycleStage = 'APPROVED'
    try {
      await this.executeLedgerStep(entry)
      entry.lifecycleStage = 'COMPLETED'
      entry.status = 'COMPLETED'
      entry.failureReason = undefined
    } catch {
      entry.lifecycleStage = 'FAILED'
      entry.status = 'FAILED'
      entry.failureReason = 'Ledger execution failed.'
    }
    return this.persistCase(entry)
  }

  private async seedDummyCases() {
    const holders = [
      'ALPHA_CAPITAL',
      'AURORA_FUND',
      'BANYAN_TRUST',
      'CEDAR_BANK',
      'DELTA_VENTURES',
      'EVEREST_PARTNERS',
      'GARNET_HOLDINGS',
      'HARBOR_INVEST',
    ]
    const securities = ['PROXI-CLASS-A', 'PROXI-CLASS-B', 'PROXI-GROWTH', 'PROXI-INCOME', 'PROXI-LP-2026']
    const types: CaseType[] = ['TRANSFER', 'ISSUE', 'CANCEL']

    for (let index = 0; index < 36; index += 1) {
      const type = types[index % types.length]
      const securityId = securities[index % securities.length]
      const quantity = ((index % 8) + 1) * 2500
      const createdAt = new Date(Date.now() - index * 4 * 60 * 60 * 1000)
      const status: CaseStatus = index % 11 === 0 ? 'FAILED' : index % 5 === 0 ? 'PENDING' : 'COMPLETED'
      const evidenceRequired = this.getRequiredEvidence(type)
      const evidenceSubmitted =
        status === 'PENDING' ? evidenceRequired.slice(0, Math.max(1, evidenceRequired.length - 2)) : evidenceRequired
      const missingEvidence = evidenceRequired.filter(item => !evidenceSubmitted.includes(item))

      await this.database.query(
        `INSERT INTO transfer_cases (
          type, security_id, quantity, from_holder_id, to_holder_id, holder_id, status, lifecycle_stage,
          evidence_required, evidence_submitted, missing_evidence, restriction_blocking_reasons, restriction_checks,
          restriction_context, failure_reason, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::text[],$10::text[],$11::text[],$12::text[],$13::jsonb,$14::jsonb,$15,$16,$17)`,
        [
          type,
          securityId,
          quantity,
          type === 'TRANSFER' ? holders[index % holders.length] : null,
          type === 'TRANSFER' ? holders[(index + 3) % holders.length] : null,
          type !== 'TRANSFER' ? holders[index % holders.length] : null,
          status,
          status === 'COMPLETED' ? 'COMPLETED' : status === 'FAILED' ? (type === 'TRANSFER' ? 'REJECTED' : 'FAILED') : 'EVIDENCE_PENDING',
          evidenceRequired,
          evidenceSubmitted,
          missingEvidence,
          status === 'FAILED' && type === 'TRANSFER' ? ['Lock-up restriction check'] : [],
          JSON.stringify([]),
          JSON.stringify({}),
          status === 'FAILED'
            ? type === 'TRANSFER'
              ? 'Restriction checks failed: Lock-up restriction check'
              : 'Ledger execution failed.'
            : null,
          createdAt,
          createdAt,
        ],
      )
    }
  }

  async getCases(): Promise<Case[]> {
    const result = await this.database.query<CaseRow>(
      `SELECT id, created_at, updated_at, type, security_id, quantity, from_holder_id, to_holder_id, holder_id, status, lifecycle_stage,
              evidence_required, evidence_submitted, missing_evidence, restriction_blocking_reasons, restriction_checks, restriction_context, failure_reason
       FROM transfer_cases
       ORDER BY created_at DESC`,
    )
    return result.rows.map(mapCase)
  }

  async getCaseById(id: number): Promise<Case> {
    const result = await this.database.query<CaseRow>(
      `SELECT id, created_at, updated_at, type, security_id, quantity, from_holder_id, to_holder_id, holder_id, status, lifecycle_stage,
              evidence_required, evidence_submitted, missing_evidence, restriction_blocking_reasons, restriction_checks, restriction_context, failure_reason
       FROM transfer_cases
       WHERE id = $1`,
      [id],
    )
    if (!result.rows.length) {
      throw new NotFoundException('Case not found')
    }
    return mapCase(result.rows[0])
  }

  async createCase(input: CreateCaseInput): Promise<Case> {
    const evidenceRequired = this.getRequiredEvidence(input.type)
    const insert = await this.database.query<CaseRow>(
      `INSERT INTO transfer_cases (
        type, security_id, quantity, from_holder_id, to_holder_id, holder_id, status, lifecycle_stage,
        evidence_required, evidence_submitted, missing_evidence, restriction_blocking_reasons, restriction_checks, restriction_context, failure_reason
      ) VALUES ($1,$2,$3,$4,$5,$6,'PENDING','REQUESTED',$7::text[],$8::text[],$9::text[],$10::text[],$11::jsonb,$12::jsonb,$13)
      RETURNING id, created_at, updated_at, type, security_id, quantity, from_holder_id, to_holder_id, holder_id, status, lifecycle_stage,
                evidence_required, evidence_submitted, missing_evidence, restriction_blocking_reasons, restriction_checks, restriction_context, failure_reason`,
      [
        input.type,
        input.securityId,
        input.quantity,
        input.fromHolderId || null,
        input.toHolderId || null,
        input.holderId || null,
        evidenceRequired,
        this.normalizeEvidence(input.evidenceDocs),
        [],
        [],
        JSON.stringify([]),
        JSON.stringify(input.restrictionContext || {}),
        null,
      ],
    )
    return this.processCase(mapCase(insert.rows[0]), input.restrictionContext)
  }

  async submitEvidence(caseId: number, docType: string): Promise<Case> {
    const found = await this.getCaseById(caseId)
    if (!found.evidenceSubmitted.includes(docType)) {
      found.evidenceSubmitted.push(docType)
    }
    this.hydrateEvidenceState(found)
    return this.persistCase(found)
  }

  async reprocessCase(caseId: number, restrictionContext?: RestrictionContext): Promise<Case> {
    const found = await this.getCaseById(caseId)
    return this.processCase(found, restrictionContext)
  }

  private async persistCase(entry: Case): Promise<Case> {
    const result = await this.database.query<CaseRow>(
      `UPDATE transfer_cases
       SET status = $2,
           lifecycle_stage = $3,
           evidence_submitted = $4::text[],
           missing_evidence = $5::text[],
           restriction_blocking_reasons = $6::text[],
           restriction_checks = $7::jsonb,
           restriction_context = $8::jsonb,
           failure_reason = $9,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, created_at, updated_at, type, security_id, quantity, from_holder_id, to_holder_id, holder_id, status, lifecycle_stage,
                 evidence_required, evidence_submitted, missing_evidence, restriction_blocking_reasons, restriction_checks, restriction_context, failure_reason`,
      [
        entry.id,
        entry.status,
        entry.lifecycleStage,
        entry.evidenceSubmitted,
        entry.missingEvidence,
        entry.restrictionBlockingReasons,
        JSON.stringify(entry.restrictionChecks),
        JSON.stringify(entry.restrictionContext),
        entry.failureReason || null,
      ],
    )
    return mapCase(result.rows[0])
  }
}

function mapCase(row: CaseRow): Case {
  return {
    createdAt: new Date(row.created_at),
    evidenceRequired: row.evidence_required || [],
    evidenceSubmitted: row.evidence_submitted || [],
    failureReason: row.failure_reason || undefined,
    fromHolderId: row.from_holder_id || undefined,
    holderId: row.holder_id || undefined,
    id: row.id,
    lifecycleStage: row.lifecycle_stage,
    missingEvidence: row.missing_evidence || [],
    quantity: row.quantity,
    restrictionBlockingReasons: row.restriction_blocking_reasons || [],
    restrictionChecks: (row.restriction_checks as Array<{ detail: string; name: string; passed: boolean }>) || [],
    restrictionContext: (row.restriction_context as RestrictionContext) || {},
    securityId: row.security_id,
    status: row.status,
    toHolderId: row.to_holder_id || undefined,
    type: row.type,
    updatedAt: new Date(row.updated_at),
  }
}
