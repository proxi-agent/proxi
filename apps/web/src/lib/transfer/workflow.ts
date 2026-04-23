import type { TransferRequest } from './types'

/**
 * Mirrors the backend `Branch` enum in `apps/api/src/transfer-workflow/case/case-types.ts`.
 * Kept in sync manually for MVP — a shared schema package will absorb this later.
 */
export type WorkflowBranch =
  | 'adverse_claim'
  | 'deceased_owner'
  | 'estate_succession'
  | 'fiduciary_review'
  | 'issuer_legal_opinion'
  | 'restriction_review'
  | 'standard'
  | 'stop_transfer_order'

export type WorkflowCaseType =
  | 'estate'
  | 'fiduciary'
  | 'gift'
  | 'issuance'
  | 'restricted_shares'
  | 'special_situation'
  | 'standard_individual'

export type WorkflowPhase =
  | 'approved'
  | 'automated_review'
  | 'awaiting_documents'
  | 'cancelled'
  | 'draft'
  | 'failed'
  | 'intake'
  | 'manual_review'
  | 'pending_adverse_claim'
  | 'pending_deceased_validation'
  | 'pending_issuer_legal_review'
  | 'pending_restriction_review'
  | 'pending_stop_order_resolution'
  | 'ready_for_review'
  | 'ready_for_settlement'
  | 'rejected'
  | 'settled'
  | 'submitted'

export const BRANCH_LABEL: Record<WorkflowBranch, string> = {
  adverse_claim: 'Adverse claim',
  deceased_owner: 'Deceased owner',
  estate_succession: 'Estate succession',
  fiduciary_review: 'Fiduciary review',
  issuer_legal_opinion: 'Issuer legal opinion',
  restriction_review: 'Restricted shares',
  standard: 'Standard flow',
  stop_transfer_order: 'Stop transfer order',
}

export const BRANCH_TONE: Record<WorkflowBranch, 'brand' | 'danger' | 'info' | 'neutral' | 'warning'> = {
  adverse_claim: 'danger',
  deceased_owner: 'warning',
  estate_succession: 'warning',
  fiduciary_review: 'info',
  issuer_legal_opinion: 'warning',
  restriction_review: 'warning',
  standard: 'neutral',
  stop_transfer_order: 'danger',
}

export const CASE_TYPE_LABEL: Record<WorkflowCaseType, string> = {
  estate: 'Estate',
  fiduciary: 'Fiduciary',
  gift: 'Gift',
  issuance: 'Issuance',
  restricted_shares: 'Restricted shares',
  special_situation: 'Special situation',
  standard_individual: 'Standard individual',
}

export const PHASE_LABEL: Record<WorkflowPhase, string> = {
  approved: 'Approved',
  automated_review: 'Automated review',
  awaiting_documents: 'Awaiting documents',
  cancelled: 'Cancelled',
  draft: 'Draft',
  failed: 'Failed',
  intake: 'Intake in progress',
  manual_review: 'Manual review required',
  pending_adverse_claim: 'Adverse claim review',
  pending_deceased_validation: 'Deceased / estate validation',
  pending_issuer_legal_review: 'Issuer legal review',
  pending_restriction_review: 'Restriction review',
  pending_stop_order_resolution: 'Stop-order resolution',
  ready_for_review: 'Ready for review',
  ready_for_settlement: 'Ready for settlement',
  rejected: 'Rejected',
  settled: 'Settled',
  submitted: 'Submitted',
}

/**
 * Heuristic classifier that maps the existing mock shape onto the new
 * workflow taxonomy. When the admin UI is wired to the real API this
 * becomes a thin adapter over the `WorkflowCaseEnvelope`.
 */
export function classifyWorkflow(t: TransferRequest): { branch: WorkflowBranch; caseType: WorkflowCaseType; phase: WorkflowPhase } {
  const exceptionCodes = t.exceptions.map(e => e.code.toLowerCase()).join(' ')
  const restrictionNote = (t.holding.restrictionNote ?? '').toLowerCase()

  let branch: WorkflowBranch = 'standard'
  if (exceptionCodes.includes('stop')) branch = 'stop_transfer_order'
  else if (exceptionCodes.includes('claim')) branch = 'adverse_claim'
  else if (exceptionCodes.includes('decease') || exceptionCodes.includes('estate')) branch = 'estate_succession'
  else if (t.transferType === 'restricted-removal' || restrictionNote.includes('144') || restrictionNote.includes('legend'))
    branch = 'restriction_review'
  else if (exceptionCodes.includes('legal') || exceptionCodes.includes('opinion')) branch = 'issuer_legal_opinion'
  else if (t.destination.kind === 'trust') branch = 'fiduciary_review'

  let caseType: WorkflowCaseType = 'standard_individual'
  if (t.transferType === 'internal-family') caseType = 'gift'
  else if (t.transferType === 'restricted-removal') caseType = 'restricted_shares'
  else if (branch === 'estate_succession') caseType = 'estate'
  else if (branch === 'fiduciary_review') caseType = 'fiduciary'
  else if (t.exceptions.some(e => e.severity === 'high')) caseType = 'special_situation'

  let phase: WorkflowPhase
  switch (t.status) {
    case 'ai-review':
      phase = 'automated_review'
      break
    case 'approved':
      phase = 'approved'
      break
    case 'blocked':
    case 'escalated':
      phase = branchToPhase(branch)
      break
    case 'cancelled':
      phase = 'cancelled'
      break
    case 'draft':
      phase = 'draft'
      break
    case 'failed':
      phase = 'failed'
      break
    case 'in-review':
      phase = 'manual_review'
      break
    case 'needs-info':
      phase = 'awaiting_documents'
      break
    case 'posted':
      phase = 'settled'
      break
    case 'ready':
      phase = 'ready_for_settlement'
      break
    case 'rejected':
      phase = 'rejected'
      break
    case 'submitted':
      phase = 'submitted'
      break
    default:
      phase = 'submitted'
  }

  return { branch, caseType, phase }
}

function branchToPhase(branch: WorkflowBranch): WorkflowPhase {
  switch (branch) {
    case 'adverse_claim':
      return 'pending_adverse_claim'
    case 'deceased_owner':
    case 'estate_succession':
      return 'pending_deceased_validation'
    case 'issuer_legal_opinion':
      return 'pending_issuer_legal_review'
    case 'restriction_review':
      return 'pending_restriction_review'
    case 'stop_transfer_order':
      return 'pending_stop_order_resolution'
    default:
      return 'manual_review'
  }
}
