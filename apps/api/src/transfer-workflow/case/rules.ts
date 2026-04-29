import type { TransferRequest } from '../../generated/prisma/client.js'

import type { CaseFlags, CaseType, DocRequirement, ExtractedFields, RuleCode, RuleResult } from './case-types.js'
import { allRequirementsSatisfied } from './requirements.js'

/**
 * Deterministic rules engine.
 *
 * Each rule is a pure function of (transfer, case JSON fields). The
 * engine returns a `RuleResult[]` keyed by `RuleCode` that downstream
 * services use to:
 *
 *   1. Route to manual review vs auto-pass (confidence/completeness)
 *   2. Detect special-condition branches (stop order, adverse claim, …)
 *   3. Power machine-readable task payloads + AI summaries
 *
 * Rules *never* throw — a failure becomes an `outcome: 'fail'` result so
 * we can always show operators why a case was routed a certain way.
 *
 * Thresholds live at the top so policy tweaks are a one-line change.
 */

export const AUTO_PASS_CONFIDENCE_THRESHOLD = 0.85
export const MANUAL_REVIEW_CONFIDENCE_THRESHOLD = 0.65
export const AUTO_PASS_COMPLETENESS_THRESHOLD = 0.9

export interface RuleInput {
  transfer: Pick<
    TransferRequest,
    'fromAccountId' | 'id' | 'issuerId' | 'kind' | 'missingEvidence' | 'quantity' | 'securityId' | 'shareClassId' | 'toAccountId'
  > & { quantity: bigint }
  caseType: CaseType
  requirements: readonly DocRequirement[]
  flags: CaseFlags
  extracted: ExtractedFields
  /** Current holding on the source account, in shares. */
  sourceHolding?: bigint
  /** Registered holder name pulled from the ledger/account of record. */
  registeredHolderName?: string
  /** Account registered owner name (usually === transferor for standard). */
  registeredAccountOwner?: string
}

type Rule = (input: RuleInput) => RuleResult

export function result(code: RuleCode, outcome: RuleResult['outcome'], opts: Omit<RuleResult, 'code' | 'outcome'> = {}): RuleResult {
  return { code, outcome, ...opts }
}

// ---------- Individual rules ---------------------------------------------

const holderIdentityMatch: Rule = input => {
  const expected = input.registeredHolderName?.trim().toLowerCase()
  const actual = input.extracted.transferorName?.trim().toLowerCase()
  if (!expected || !actual) {
    return result('holder_identity_match', 'warn', {
      message: 'Could not confirm transferor identity against the registered holder.',
      reason: 'identity_unverified',
      score: 0.5,
    })
  }
  const score = nameSimilarity(expected, actual)
  if (score >= 0.9) {
    return result('holder_identity_match', 'pass', { score })
  }
  if (score >= 0.75) {
    return result('holder_identity_match', 'warn', {
      details: { actual, expected },
      message: 'Holder name differs slightly from ledger registration.',
      reason: 'identity_name_variant',
      score,
    })
  }
  return result('holder_identity_match', 'fail', {
    details: { actual, expected },
    message: 'Transferor name does not match the registered holder of record.',
    reason: 'identity_mismatch',
    score,
  })
}

const accountOwnershipMatch: Rule = input => {
  if (!input.transfer.fromAccountId) {
    return result('account_ownership_match', 'skip', { reason: 'no_source_account' })
  }
  const expected = input.registeredAccountOwner?.trim().toLowerCase()
  const actual = input.extracted.transferorName?.trim().toLowerCase()
  if (!expected || !actual) {
    return result('account_ownership_match', 'warn', {
      message: 'Account ownership could not be independently confirmed.',
      reason: 'ownership_unverified',
    })
  }
  const score = nameSimilarity(expected, actual)
  if (score >= 0.85) return result('account_ownership_match', 'pass', { score })
  return result('account_ownership_match', 'fail', {
    details: { actual, expected },
    message: 'Transferor is not the registered owner of the source account.',
    reason: 'ownership_mismatch',
    score,
  })
}

const completenessScore: Rule = input => {
  const required = input.requirements.filter(r => r.state !== 'waived')
  if (required.length === 0) return result('completeness_score', 'pass', { score: 1 })
  const satisfied = required.filter(r => r.state === 'received' || r.state === 'accepted').length
  const score = satisfied / required.length
  if (allRequirementsSatisfied(input.requirements)) {
    return result('completeness_score', 'pass', { details: { required: required.length, satisfied }, score })
  }
  if (score >= AUTO_PASS_COMPLETENESS_THRESHOLD) {
    return result('completeness_score', 'warn', {
      details: { required: required.length, satisfied },
      message: `${required.length - satisfied} requirement(s) still missing.`,
      reason: 'near_complete',
      score,
    })
  }
  return result('completeness_score', 'fail', {
    details: { missing: input.requirements.filter(r => r.state === 'required').map(r => r.code) },
    message: `${required.length - satisfied} of ${required.length} requirements outstanding.`,
    reason: 'incomplete',
    score,
  })
}

const confidenceScoreRule: Rule = input => {
  const fieldConfidences = Object.values(input.extracted.fieldConfidence ?? {}).filter((x): x is number => typeof x === 'number')
  const avg = fieldConfidences.length ? fieldConfidences.reduce((a, b) => a + b, 0) / fieldConfidences.length : 0.6
  if (avg >= AUTO_PASS_CONFIDENCE_THRESHOLD) {
    return result('confidence_score', 'pass', { score: avg })
  }
  if (avg >= MANUAL_REVIEW_CONFIDENCE_THRESHOLD) {
    return result('confidence_score', 'warn', {
      message: `Overall extraction confidence ${(avg * 100).toFixed(0)}% — below auto-pass threshold.`,
      reason: 'borderline_confidence',
      score: avg,
    })
  }
  return result('confidence_score', 'fail', {
    message: `Overall extraction confidence ${(avg * 100).toFixed(0)}% — requires manual review.`,
    reason: 'low_confidence',
    score: avg,
  })
}

const stopTransferOrderCheck: Rule = input => {
  if (input.flags.stopTransferOrder && !input.flags.stopTransferOrder.resolvedAt) {
    return result('stop_transfer_order_check', 'fail', {
      details: { referenceCode: input.flags.stopTransferOrder.referenceCode },
      message: input.flags.stopTransferOrder.reason,
      reason: 'stop_order_present',
    })
  }
  return result('stop_transfer_order_check', 'pass')
}

const adverseClaimCheck: Rule = input => {
  if (input.flags.adverseClaim && !input.flags.adverseClaim.resolvedAt) {
    return result('adverse_claim_check', 'fail', {
      message: input.flags.adverseClaim.reason,
      reason: 'adverse_claim_present',
    })
  }
  return result('adverse_claim_check', 'pass')
}

const deceasedOwnerCheck: Rule = input => {
  if (input.flags.deceasedOwner && !input.flags.deceasedOwner.resolvedAt) {
    return result('deceased_owner_check', 'fail', {
      message: input.flags.deceasedOwner.reason,
      reason: 'deceased_owner_suspected',
    })
  }
  return result('deceased_owner_check', 'pass')
}

const restrictionFlagCheck: Rule = input => {
  if (input.caseType === 'restricted_shares') {
    return result('restriction_flag_check', 'warn', {
      message: 'Restricted-shares case requires legend / Rule 144 analysis.',
      reason: 'restriction_expected',
    })
  }
  if (input.flags.restriction && !input.flags.restriction.resolvedAt) {
    return result('restriction_flag_check', 'fail', {
      details: { category: input.flags.restriction.category },
      message: input.flags.restriction.reason,
      reason: 'restriction_present',
    })
  }
  return result('restriction_flag_check', 'pass')
}

const legalOpinionRequired: Rule = input => {
  const needs = input.caseType === 'restricted_shares' || Boolean(input.flags.restriction && !input.flags.restriction.resolvedAt)
  const provided = Boolean(input.flags.legalOpinion?.providedAt)
  if (!needs) return result('legal_opinion_required', 'skip')
  if (provided) return result('legal_opinion_required', 'pass', { reason: 'legal_opinion_on_file' })
  return result('legal_opinion_required', 'fail', {
    message: 'Issuer legal opinion required before transfer can settle.',
    reason: 'legal_opinion_missing',
  })
}

const repLetterRequired: Rule = input => {
  if (input.caseType !== 'restricted_shares') return result('rep_letter_required', 'skip')
  const present = input.requirements.find(r => r.code === 'representation_letter')
  if (present && (present.state === 'received' || present.state === 'accepted')) {
    return result('rep_letter_required', 'pass')
  }
  return result('rep_letter_required', 'fail', {
    message: 'Seller representation letter is required for restricted shares.',
    reason: 'rep_letter_missing',
  })
}

const taxWithholdingRule: Rule = input => {
  const pendingTax = input.flags.taxFollowUps?.some(t => t.status === 'pending') ?? false
  const needsTaxForm = input.caseType === 'standard_individual' || input.caseType === 'restricted_shares'
  if (!needsTaxForm) return result('tax_withholding_required', 'skip')
  if (pendingTax) {
    return result('tax_withholding_required', 'warn', {
      message: 'Follow-up tax form required before settlement can finalize.',
      reason: 'tax_form_pending',
    })
  }
  return result('tax_withholding_required', 'pass')
}

const fastReconciliationRule: Rule = input => {
  // MVP policy: any case involving broker destination or restricted
  // shares requires a FAST position adjustment.
  const kind = input.transfer.kind
  const needs = input.caseType === 'restricted_shares' || kind === 'ISSUANCE' || kind === 'CANCELLATION'
  return result('fast_reconciliation_required', needs ? 'warn' : 'skip', {
    message: needs ? 'FAST inventory reconciliation will be generated at settlement.' : undefined,
    reason: needs ? 'fast_reconciliation_needed' : undefined,
  })
}

const sufficientHoldings: Rule = input => {
  if (!input.transfer.fromAccountId) return result('sufficient_holdings', 'skip')
  if (input.sourceHolding == null) {
    return result('sufficient_holdings', 'warn', {
      reason: 'holding_unknown',
    })
  }
  if (input.sourceHolding < input.transfer.quantity) {
    return result('sufficient_holdings', 'fail', {
      details: {
        available: Number(input.sourceHolding),
        requested: Number(input.transfer.quantity),
      },
      message: `Source account holds ${input.sourceHolding} shares, needs ${input.transfer.quantity}.`,
      reason: 'insufficient_holdings',
    })
  }
  return result('sufficient_holdings', 'pass')
}

const medallionRule: Rule = input => {
  const req = input.requirements.find(r => r.code === 'medallion')
  if (!req || req.state === 'waived') return result('medallion_signature', 'skip')
  if (req.state === 'accepted' || req.state === 'received') {
    return result('medallion_signature', 'pass')
  }
  return result('medallion_signature', 'fail', {
    message: 'Medallion signature guarantee is required.',
    reason: 'medallion_missing',
  })
}

// ---------- Engine --------------------------------------------------------

const REGISTRY: Rule[] = [
  holderIdentityMatch,
  accountOwnershipMatch,
  completenessScore,
  confidenceScoreRule,
  stopTransferOrderCheck,
  adverseClaimCheck,
  deceasedOwnerCheck,
  restrictionFlagCheck,
  legalOpinionRequired,
  repLetterRequired,
  taxWithholdingRule,
  fastReconciliationRule,
  sufficientHoldings,
  medallionRule,
]

export interface RulesVerdict {
  results: RuleResult[]
  overallConfidence: number
  completeness: number
  autoPassCandidate: boolean
  blockingFailures: RuleResult[]
  warnings: RuleResult[]
  /** Branch to route into based on the highest-severity failure. */
  suggestedBranch?: import('./case-types.js').Branch
}

export function runRules(input: RuleInput): RulesVerdict {
  const results = REGISTRY.map(rule => rule(input))

  const confidence = findScore(results, 'confidence_score') ?? 0.6
  const completeness = findScore(results, 'completeness_score') ?? 0

  const blockingFailures = results.filter(r => r.outcome === 'fail')
  const warnings = results.filter(r => r.outcome === 'warn')

  const autoPassCandidate =
    blockingFailures.length === 0 && confidence >= AUTO_PASS_CONFIDENCE_THRESHOLD && completeness >= AUTO_PASS_COMPLETENESS_THRESHOLD

  return {
    autoPassCandidate,
    blockingFailures,
    completeness,
    overallConfidence: confidence,
    results,
    suggestedBranch: pickBranch(results),
    warnings,
  }
}

function findScore(results: readonly RuleResult[], code: RuleCode): number | undefined {
  const r = results.find(x => x.code === code)
  return r?.score
}

function pickBranch(results: readonly RuleResult[]): import('./case-types.js').Branch | undefined {
  // Highest-severity branch wins. Keyed by rule code so the mapping is
  // exhaustive and trivially extendable.
  const codeToBranch: Partial<Record<RuleCode, import('./case-types.js').Branch>> = {
    adverse_claim_check: 'adverse_claim',
    deceased_owner_check: 'deceased_owner',
    legal_opinion_required: 'issuer_legal_review',
    rep_letter_required: 'restriction_review',
    restriction_flag_check: 'restriction_review',
    stop_transfer_order_check: 'stop_transfer_order',
  }
  const priority: Record<import('./case-types.js').Branch, number> = {
    adverse_claim: 90,
    deceased_owner: 70,
    issuer_legal_review: 60,
    normal: 0,
    restriction_review: 50,
    stop_transfer_order: 100,
    supplemental_info: 10,
  }
  let best: import('./case-types.js').Branch | undefined
  for (const r of results) {
    if (r.outcome !== 'fail') continue
    const branch = codeToBranch[r.code]
    if (!branch) continue
    if (!best || priority[branch] > priority[best]) best = branch
  }
  return best
}

// ---------- Helpers -------------------------------------------------------

/**
 * Cheap normalized name-similarity metric for MVP: Jaccard similarity on
 * token sets. Good enough to catch typos and re-orderings; a proper
 * fuzzy matcher can slot in here later.
 */
function nameSimilarity(a: string, b: string): number {
  const tokens = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(Boolean),
    )
  const A = tokens(a)
  const B = tokens(b)
  if (A.size === 0 && B.size === 0) return 1
  const inter = [...A].filter(t => B.has(t)).length
  const union = new Set([...A, ...B]).size
  return union === 0 ? 0 : inter / union
}
