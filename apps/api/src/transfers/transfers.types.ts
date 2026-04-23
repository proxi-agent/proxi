import type { Case, CaseLifecycleStage, CaseStatus, CaseType, IntakeMethod } from '../cases/cases.service.js'

/**
 * Consolidated transfer state, derived from case lifecycle + status.
 * Aligns with the product-visible PENDING -> REVIEWED -> APPROVED/REJECTED -> SETTLED flow
 * while keeping the richer operational states available via `lifecycleStage`.
 */
export type TransferState =
  | 'APPROVED'
  | 'EVIDENCE_PENDING'
  | 'EXCEPTION'
  | 'IN_REVIEW'
  | 'PROCESSING'
  | 'REJECTED'
  | 'SETTLED'
  | 'SUBMITTED'

export interface TransferSummary {
  aiConfidence?: number
  aiSummary?: string
  assignedReviewerId?: string
  createdAt: Date
  evidenceComplete: boolean
  fromHolderId?: string
  hasBlockingRestrictions: boolean
  holderId?: string
  id: number
  intakeMethod: IntakeMethod
  lastAiJobId?: number
  ledgerEventId?: number
  lifecycleStage: CaseLifecycleStage
  missingEvidenceCount: number
  quantity: number
  securityId: string
  sourceCaseStatus: CaseStatus
  state: TransferState
  toHolderId?: string
  type: CaseType
  updatedAt: Date
}

export interface TransferStats {
  byState: Record<TransferState, number>
  byType: Record<CaseType, number>
  total: number
}

export function deriveTransferState(caseData: Pick<Case, 'lifecycleStage' | 'status'>): TransferState {
  switch (caseData.lifecycleStage) {
    case 'AI_PROCESSING':
      return 'PROCESSING'
    case 'AI_REVIEW_REQUIRED':
    case 'REVIEW_PENDING':
      return 'IN_REVIEW'
    case 'APPROVED':
      return 'APPROVED'
    case 'COMPLETED':
    case 'LEDGER_POSTED':
      return 'SETTLED'
    case 'DRAFT':
    case 'INTAKE_SUBMITTED':
      return 'SUBMITTED'
    case 'EVIDENCE_PENDING':
      return 'EVIDENCE_PENDING'
    case 'EXCEPTION':
      return 'EXCEPTION'
    case 'REJECTED':
      return 'REJECTED'
    default:
      return caseData.status === 'COMPLETED' ? 'SETTLED' : 'SUBMITTED'
  }
}

export const TRANSFER_STATES: readonly TransferState[] = [
  'APPROVED',
  'EVIDENCE_PENDING',
  'EXCEPTION',
  'IN_REVIEW',
  'PROCESSING',
  'REJECTED',
  'SETTLED',
  'SUBMITTED',
] as const

export function mapCaseToTransferSummary(caseData: Case): TransferSummary {
  return {
    aiConfidence: caseData.aiConfidence,
    aiSummary: caseData.aiSummary,
    assignedReviewerId: caseData.assignedReviewerId,
    createdAt: caseData.createdAt,
    evidenceComplete: caseData.missingEvidence.length === 0,
    fromHolderId: caseData.fromHolderId,
    hasBlockingRestrictions: caseData.restrictionBlockingReasons.length > 0,
    holderId: caseData.holderId,
    id: caseData.id,
    intakeMethod: caseData.intakeMethod,
    lastAiJobId: caseData.lastAiJobId,
    ledgerEventId: caseData.ledgerEventId,
    lifecycleStage: caseData.lifecycleStage,
    missingEvidenceCount: caseData.missingEvidence.length,
    quantity: caseData.quantity,
    securityId: caseData.securityId,
    sourceCaseStatus: caseData.status,
    state: deriveTransferState(caseData),
    toHolderId: caseData.toHolderId,
    type: caseData.type,
    updatedAt: caseData.updatedAt,
  }
}
