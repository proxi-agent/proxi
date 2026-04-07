import { Injectable, NotFoundException } from '@nestjs/common'
import { LedgerService } from '../ledger/ledger.service.js'
import { RulesService } from '../rules/rules.service.js'
import type { RestrictionCheck, RestrictionContext } from '../rules/rules.service.js'

export type CaseType = 'TRANSFER' | 'ISSUE' | 'CANCEL'
export type CaseStatus = 'PENDING' | 'COMPLETED' | 'FAILED'
export type CaseLifecycleStage = 'REQUESTED' | 'EVIDENCE_PENDING' | 'RESTRICTIONS_REVIEW' | 'APPROVED' | 'COMPLETED' | 'REJECTED' | 'FAILED'

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

@Injectable()
export class CasesService {
  private cases: Case[] = []
  private nextId = 1

  constructor(
    private readonly ledgerService: LedgerService,
    private readonly rulesService: RulesService,
  ) {
    this.seedDummyCases()
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
    return Array.from(new Set(docs.map(doc => doc.trim()).filter(doc => Boolean(doc)))).sort((a, b) => a.localeCompare(b))
  }

  private hydrateEvidenceState(entry: Case): void {
    const submitted = this.normalizeEvidence(entry.evidenceSubmitted)
    entry.evidenceSubmitted = submitted
    entry.missingEvidence = entry.evidenceRequired.filter(requiredDoc => !submitted.includes(requiredDoc))
  }

  private executeLedgerStep(entry: Case): void {
    if (entry.type === 'TRANSFER' && entry.fromHolderId && entry.toHolderId) {
      this.ledgerService.transfer(entry.securityId, entry.fromHolderId, entry.toHolderId, entry.quantity)
      return
    }
    if (entry.type === 'ISSUE' && entry.holderId) {
      this.ledgerService.issue(entry.securityId, entry.holderId, entry.quantity)
      return
    }
    if (entry.type === 'CANCEL' && entry.holderId) {
      this.ledgerService.cancel(entry.securityId, entry.holderId, entry.quantity)
    }
  }

  private processCase(entry: Case, context?: RestrictionContext): Case {
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
      return entry
    }

    entry.lifecycleStage = 'RESTRICTIONS_REVIEW'
    if (entry.type === 'TRANSFER') {
      const evaluation = this.rulesService.evaluateTransferEligibility({
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
        return entry
      }
    } else {
      entry.restrictionBlockingReasons = []
      entry.restrictionChecks = []
    }

    entry.lifecycleStage = 'APPROVED'
    try {
      this.executeLedgerStep(entry)
      entry.lifecycleStage = 'COMPLETED'
      entry.status = 'COMPLETED'
      entry.failureReason = undefined
    } catch {
      entry.lifecycleStage = 'FAILED'
      entry.status = 'FAILED'
      entry.failureReason = 'Ledger execution failed.'
    }
    return entry
  }

  private seedDummyCases(): void {
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

      if (type === 'TRANSFER') {
        const fromHolderId = holders[index % holders.length]
        const toHolderId = holders[(index + 3) % holders.length]
        const evidenceRequired = this.getRequiredEvidence(type)
        const evidenceSubmitted = status === 'PENDING' ? evidenceRequired.slice(0, 2) : evidenceRequired
        const lifecycleStage: CaseLifecycleStage =
          status === 'COMPLETED' ? 'COMPLETED' : status === 'FAILED' ? 'REJECTED' : 'EVIDENCE_PENDING'
        this.cases.push({
          id: this.nextId++,
          createdAt,
          evidenceRequired,
          evidenceSubmitted,
          failureReason: status === 'FAILED' ? 'Restriction checks failed: Lock-up restriction check' : undefined,
          fromHolderId,
          lifecycleStage,
          missingEvidence: status === 'PENDING' ? evidenceRequired.slice(2) : [],
          quantity,
          restrictionBlockingReasons: status === 'FAILED' ? ['Lock-up restriction check'] : [],
          restrictionChecks: [],
          restrictionContext: {},
          securityId,
          status,
          toHolderId,
          type,
          updatedAt: createdAt,
        })
        continue
      }

      const holderId = holders[index % holders.length]
      const evidenceRequired = this.getRequiredEvidence(type)
      const evidenceSubmitted = status === 'PENDING' ? evidenceRequired.slice(0, 1) : evidenceRequired
      const lifecycleStage: CaseLifecycleStage = status === 'COMPLETED' ? 'COMPLETED' : status === 'FAILED' ? 'FAILED' : 'EVIDENCE_PENDING'
      this.cases.push({
        id: this.nextId++,
        createdAt,
        evidenceRequired,
        evidenceSubmitted,
        failureReason: status === 'FAILED' ? 'Ledger execution failed.' : undefined,
        holderId,
        lifecycleStage,
        missingEvidence: status === 'PENDING' ? evidenceRequired.slice(1) : [],
        quantity,
        restrictionBlockingReasons: [],
        restrictionChecks: [],
        restrictionContext: {},
        securityId,
        status,
        type,
        updatedAt: createdAt,
      })
    }
  }

  /**
   * List all cases.
   */
  getCases(): Case[] {
    return [...this.cases].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }

  /**
   * Get a case by ID.
   */
  getCaseById(id: number): Case {
    const found = this.cases.find(c => c.id === id)
    if (!found) {
      throw new NotFoundException('Case not found')
    }
    return found
  }

  createCase(input: CreateCaseInput): Case {
    const evidenceRequired = this.getRequiredEvidence(input.type)
    const newCase: Case = {
      id: this.nextId++,
      createdAt: new Date(),
      evidenceRequired,
      evidenceSubmitted: this.normalizeEvidence(input.evidenceDocs),
      fromHolderId: input.fromHolderId,
      holderId: input.holderId,
      lifecycleStage: 'REQUESTED',
      missingEvidence: [],
      quantity: input.quantity,
      restrictionBlockingReasons: [],
      restrictionChecks: [],
      restrictionContext: input.restrictionContext || {},
      securityId: input.securityId,
      status: 'PENDING',
      toHolderId: input.toHolderId,
      type: input.type,
      updatedAt: new Date(),
    }
    this.cases.push(newCase)
    return this.processCase(newCase, input.restrictionContext)
  }

  submitEvidence(caseId: number, docType: string): Case {
    const found = this.getCaseById(caseId)
    if (!found.evidenceSubmitted.includes(docType)) {
      found.evidenceSubmitted.push(docType)
    }
    found.updatedAt = new Date()
    this.hydrateEvidenceState(found)
    return found
  }

  reprocessCase(caseId: number, restrictionContext?: RestrictionContext): Case {
    const found = this.getCaseById(caseId)
    return this.processCase(found, restrictionContext)
  }
}
