import type { CaseType, SettlementStep, SettlementStepCode, TaxFollowUp, WorkflowCaseEnvelope } from './case-types.js'
import { SETTLEMENT_STEP_LABEL } from './case-types.js'

/**
 * Generate the initial settlement plan the moment a case moves to
 * `APPROVED`. The plan is a concrete ordered list of sub-steps so ops
 * can track partial progress (e.g. old position cancelled, new
 * position pending).
 *
 * Step composition rules:
 *
 *   • Every TRANSFER gets: validate → cancel → issue → DRS.
 *   • Restricted shares also get FAST + tax withholding.
 *   • Cross-border / W-8BEN holders get tax-doc validation.
 *   • ISSUANCE / CANCELLATION skip the legs that don't apply.
 */
export function buildSettlementPlan(input: {
  caseType: CaseType
  kind: 'TRANSFER' | 'ISSUANCE' | 'CANCELLATION' | 'ADJUSTMENT'
  needsTaxDocs?: boolean
  hasWithholding?: boolean
  needsFastUpdate?: boolean
}): SettlementStep[] {
  const codes: SettlementStepCode[] = []

  codes.push('validate_registration')
  if (input.needsTaxDocs || input.caseType === 'standard_individual' || input.caseType === 'restricted_shares') {
    codes.push('validate_tax_docs')
  }
  if (input.kind === 'TRANSFER' || input.kind === 'CANCELLATION') {
    codes.push('cancel_old_position')
  }
  if (input.kind === 'TRANSFER' || input.kind === 'ISSUANCE') {
    codes.push('issue_new_position')
  }
  if (input.kind === 'TRANSFER' || input.kind === 'ISSUANCE') {
    codes.push('generate_drs_statement')
  }
  if (input.needsFastUpdate || input.caseType === 'restricted_shares' || input.kind !== 'TRANSFER') {
    codes.push('update_fast_position')
  }
  if (input.kind === 'TRANSFER' || input.kind === 'CANCELLATION') {
    codes.push('confirm_prior_cancellation')
  }
  if (input.hasWithholding) {
    codes.push('record_tax_withholding')
  }

  return codes.map(code => ({
    code,
    label: SETTLEMENT_STEP_LABEL[code],
    status: 'pending',
  }))
}

/**
 * Apply an update to the plan, returning a *new* array so callers don't
 * have to worry about mutation aliasing.
 */
export function advanceStep(plan: readonly SettlementStep[], code: SettlementStepCode, patch: Partial<SettlementStep>): SettlementStep[] {
  return plan.map(s => (s.code === code ? { ...s, ...patch } : s))
}

export function allStepsComplete(plan: readonly SettlementStep[]): boolean {
  return plan.every(s => s.status === 'completed' || s.status === 'skipped')
}

export function nextPendingStep(plan: readonly SettlementStep[]): SettlementStep | undefined {
  return plan.find(s => s.status === 'pending' || s.status === 'in_progress')
}

/**
 * Seed a tax follow-up record from the case type. `W-9` is the standard
 * domestic path; non-US holders would swap to W-8BEN during intake.
 */
export function initialTaxFollowUps(caseType: CaseType): TaxFollowUp[] {
  if (caseType === 'standard_individual' || caseType === 'restricted_shares') {
    return [{ form: 'W-9', status: 'pending' }]
  }
  return []
}

/**
 * Compose a human-readable settlement summary — used in notifications +
 * AI narratives. Keeps copy centralized.
 */
export function summarizeSettlement(env: WorkflowCaseEnvelope): string {
  const completed = env.settlementPlan.filter(s => s.status === 'completed').length
  const total = env.settlementPlan.length
  if (total === 0) return 'Awaiting settlement plan.'
  if (completed === total) return `Settlement complete — ${total} of ${total} steps finalized.`
  return `${completed} of ${total} settlement steps complete.`
}
