import type { Prisma, TransferRequest, TransferState } from '@prisma/client'

import type { Branch, CasePhase, CaseType, DocRequirement, RuleResult, SettlementStep, WorkflowCaseEnvelope } from './case-types.js'
import { BRANCH_PRIORITY, CURRENT_CASE_VERSION } from './case-types.js'

/**
 * Parse / serialize helpers for `TransferRequest.canonicalData`.
 *
 * We store the whole `WorkflowCaseEnvelope` inside the pre-existing JSON
 * column rather than migrating the schema for every new piece of state.
 * This keeps the MVP extensible — adding a new flag or settlement step
 * is a `readEnvelope` / `writeEnvelope` change, nothing else.
 *
 * `readEnvelope` is defensive: legacy rows (with `{}`) get a usable
 * default envelope, and an invalid payload never crashes the workflow.
 */

const EMPTY_ENVELOPE: WorkflowCaseEnvelope = {
  autoRouted: false,
  branch: 'normal',
  caseType: 'standard_individual',
  completeness: 0,
  confidence: 0.6,
  extracted: {},
  flags: {},
  intakeSource: 'portal',
  narratives: {},
  phase: 'draft',
  phaseEnteredAt: new Date(0).toISOString(),
  requirements: [],
  rules: [],
  settlementPlan: [],
  version: CURRENT_CASE_VERSION,
}

export function readEnvelope(row: Pick<TransferRequest, 'canonicalData' | 'createdAt'>): WorkflowCaseEnvelope {
  const raw = row.canonicalData as Prisma.JsonValue
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...EMPTY_ENVELOPE, phaseEnteredAt: row.createdAt.toISOString() }
  }
  const obj = raw as Record<string, unknown>
  if (obj.version !== CURRENT_CASE_VERSION) {
    // Future migrations branch here. Today we fall back to defaults for
    // any row we don't recognize, preserving whatever primitives we can.
    return {
      ...EMPTY_ENVELOPE,
      ...coerceLegacy(obj),
      phaseEnteredAt: row.createdAt.toISOString(),
    }
  }
  return { ...EMPTY_ENVELOPE, ...(obj as unknown as Partial<WorkflowCaseEnvelope>) } as WorkflowCaseEnvelope
}

export function writeEnvelope(env: WorkflowCaseEnvelope): Prisma.InputJsonValue {
  return env as unknown as Prisma.InputJsonValue
}

function coerceLegacy(obj: Record<string, unknown>): Partial<WorkflowCaseEnvelope> {
  const out: Partial<WorkflowCaseEnvelope> = {}
  if (typeof obj.caseType === 'string') out.caseType = obj.caseType as CaseType
  if (typeof obj.branch === 'string') out.branch = obj.branch as Branch
  if (typeof obj.phase === 'string') out.phase = obj.phase as CasePhase
  if (typeof obj.confidence === 'number') out.confidence = obj.confidence
  if (typeof obj.completeness === 'number') out.completeness = obj.completeness
  if (Array.isArray(obj.requirements)) out.requirements = obj.requirements as DocRequirement[]
  if (Array.isArray(obj.rules)) out.rules = obj.rules as RuleResult[]
  if (Array.isArray(obj.settlementPlan)) out.settlementPlan = obj.settlementPlan as SettlementStep[]
  return out
}

// ----------------------------------------------------------------------
// Phase derivation
// ----------------------------------------------------------------------

/**
 * Fine-grained phase derivation.
 *
 * Single source of truth for "what lane is this case in?". Combines the
 * Prisma state (coarse) with the case branch + flags (fine) to yield an
 * operator-facing phase used by queue lanes, SLAs, and banners.
 */
export function derivePhase(state: TransferState, env: WorkflowCaseEnvelope): CasePhase {
  switch (state) {
    case 'DRAFT':
      return 'draft'
    case 'SUBMITTED':
      return env.requirements.length > 0 && env.requirements.some(r => r.state === 'required') ? 'awaiting_documents' : 'intake_in_progress'
    case 'NEEDS_INFO':
      return 'awaiting_documents'
    case 'UNDER_REVIEW':
      if (env.branch === 'stop_transfer_order') return 'pending_stop_order_resolution'
      if (env.branch === 'adverse_claim') return 'pending_adverse_claim_review'
      if (env.branch === 'deceased_owner') return 'pending_deceased_validation'
      if (env.branch === 'issuer_legal_review') return 'pending_issuer_legal_review'
      if (env.branch === 'restriction_review') return 'pending_restriction_review'
      return env.autoRouted ? 'automated_review_passed' : 'manual_review_required'
    case 'APPROVED':
      return env.settlementPlan.length
        ? env.settlementPlan.every(s => s.status === 'completed')
          ? 'approved'
          : 'ready_for_settlement'
        : 'approved'
    case 'SETTLED':
      return 'settled'
    case 'REJECTED':
      return 'rejected'
    case 'CANCELLED':
      return 'cancelled'
    default:
      return 'draft'
  }
}

/**
 * Given fresh rule results, compute the winning branch. Branches are
 * mutually exclusive so we pick by priority — stop orders > adverse
 * claims > deceased > restricted, and a clean run stays `normal`.
 */
export function resolveBranch(env: WorkflowCaseEnvelope): Branch {
  const active: Branch[] = []
  if (env.flags.stopTransferOrder && !env.flags.stopTransferOrder.resolvedAt) {
    active.push('stop_transfer_order')
  }
  if (env.flags.adverseClaim && !env.flags.adverseClaim.resolvedAt) {
    active.push('adverse_claim')
  }
  if (env.flags.deceasedOwner && !env.flags.deceasedOwner.resolvedAt) {
    active.push('deceased_owner')
  }
  if (env.caseType === 'restricted_shares' || (env.flags.restriction && !env.flags.restriction.resolvedAt)) {
    active.push('restriction_review')
  }
  if (env.flags.legalOpinion && !env.flags.legalOpinion.providedAt) {
    active.push('issuer_legal_review')
  }
  if (env.requirements.some(r => r.state === 'required' || r.state === 'rejected')) {
    active.push('supplemental_info')
  }
  if (!active.length) return 'normal'
  return active.sort((a, b) => BRANCH_PRIORITY[b] - BRANCH_PRIORITY[a])[0]
}

/** Humanize a phase into the copy admin UIs render. */
export const PHASE_LABEL: Record<CasePhase, string> = {
  approved: 'Approved',
  automated_review_passed: 'AI review passed',
  awaiting_documents: 'Awaiting documents',
  cancelled: 'Cancelled',
  draft: 'Draft',
  failed: 'Failed',
  intake_in_progress: 'Intake in progress',
  manual_review_required: 'Manual review',
  pending_adverse_claim_review: 'Pending adverse-claim review',
  pending_deceased_validation: 'Pending estate validation',
  pending_issuer_legal_review: 'Pending issuer legal review',
  pending_restriction_review: 'Pending restriction review',
  pending_stop_order_resolution: 'Stop transfer order',
  ready_for_review: 'Ready for review',
  ready_for_settlement: 'Ready for settlement',
  rejected: 'Rejected',
  settled: 'Settled',
}
