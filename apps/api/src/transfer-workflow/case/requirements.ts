import type { CaseType, DocRequirement } from './case-types.js'

/**
 * Transfer-type-driven document checklist.
 *
 * Each case type declares its own required doc codes plus optional
 * destination-dependent additions. Missing items immediately route the
 * case to `awaiting_documents` in the workflow engine — there is no
 * special-cased branch logic outside this file.
 *
 * Codes are stable machine-readable strings stored alongside the
 * transfer request, so adding a new required doc later is O(1) and does
 * not require a migration.
 */

export type DestinationKind = 'individual' | 'joint' | 'trust' | 'entity' | 'broker' | 'certificate'

export interface RequirementInput {
  caseType: CaseType
  destinationKind?: DestinationKind
  quantity?: number
  hasRestriction?: boolean
  /** If the jurisdiction uses an inheritance/tax waiver. */
  needsInheritanceWaiver?: boolean
  /** Rough USD value of the transfer, used for medallion threshold logic. */
  estimatedValueUsd?: number
}

const DEFS: Record<string, { label: string; category?: string }> = {
  account_statement: { category: 'destination', label: 'Destination account statement' },
  affidavit_of_domicile: { category: 'estate', label: 'Affidavit of domicile' },
  court_order: { category: 'estate', label: 'Court order' },
  death_certificate: { category: 'estate', label: 'Certified death certificate' },
  entity_authorization: { category: 'entity', label: 'Entity authorization / resolution' },
  fiduciary_appointment: { category: 'fiduciary', label: 'Letters of appointment' },
  gift_letter: { category: 'gift', label: 'Gift letter' },
  gov_id_transferee: { category: 'identity', label: 'Government ID (transferee)' },
  gov_id_transferor: { category: 'identity', label: 'Government ID (transferor)' },
  inheritance_waiver: { category: 'estate', label: 'Inheritance / state tax waiver' },
  issuer_approval: { category: 'restriction', label: 'Issuer approval' },
  legal_opinion: { category: 'restriction', label: 'Legal opinion (Rule 144 / legend)' },
  liveness: { category: 'identity', label: 'Liveness capture' },
  medallion: { category: 'authorization', label: 'Medallion signature guarantee' },
  representation_letter: { category: 'restriction', label: 'Seller representation letter' },
  stock_power: { category: 'authorization', label: 'Stock power / transfer instruction' },
  trust_certificate: { category: 'trust', label: 'Certificate of trust' },
  w8ben: { category: 'tax', label: 'IRS Form W-8BEN' },
  w9: { category: 'tax', label: 'IRS Form W-9' },
}

/** Threshold above which a medallion signature is always required. */
const MEDALLION_THRESHOLD_USD = 25_000

export function buildRequirements(input: RequirementInput): DocRequirement[] {
  const codes: string[] = ['stock_power', 'gov_id_transferor']

  switch (input.caseType) {
    case 'standard_individual':
      codes.push('w9')
      break
    case 'gift':
      codes.push('gift_letter', 'gov_id_transferee')
      break
    case 'estate':
      codes.push('death_certificate', 'affidavit_of_domicile', 'fiduciary_appointment', 'gov_id_transferee')
      if (input.needsInheritanceWaiver) codes.push('inheritance_waiver')
      break
    case 'fiduciary':
      codes.push('fiduciary_appointment', 'court_order', 'gov_id_transferee')
      break
    case 'restricted_shares':
      codes.push('representation_letter', 'legal_opinion')
      break
    case 'special_situation':
      codes.push('gov_id_transferee', 'issuer_approval')
      break
    case 'issuance':
      codes.push('issuer_approval')
      break
    case 'cancellation':
      // The cert being cancelled is proof enough for MVP.
      break
    case 'adjustment':
      break
  }

  switch (input.destinationKind) {
    case 'trust':
      codes.push('trust_certificate')
      break
    case 'entity':
      codes.push('entity_authorization')
      break
    case 'broker':
      codes.push('account_statement')
      break
    default:
      break
  }

  const threshold = input.estimatedValueUsd ?? 0
  if (threshold >= MEDALLION_THRESHOLD_USD || input.caseType === 'restricted_shares') {
    codes.push('medallion')
  }

  if (input.hasRestriction && !codes.includes('legal_opinion')) {
    codes.push('legal_opinion')
  }

  // Dedupe while preserving insertion order so the UI checklist reads
  // top-down in the order requirements were added.
  const seen = new Set<string>()
  const ordered = codes.filter(c => (seen.has(c) ? false : (seen.add(c), true)))

  return ordered.map(code => {
    const def = DEFS[code] ?? { label: code }
    return {
      category: def.category,
      code,
      label: def.label,
      state: 'required' as const,
    }
  })
}

/**
 * Reconcile an existing checklist against incoming submitted codes and
 * rejections. Preserves state transitions (`accepted` stays `accepted`
 * unless explicitly rejected; new uploads become `received` awaiting
 * review).
 */
export function reconcileRequirements(
  current: DocRequirement[],
  submitted: readonly string[] = [],
  rejected: readonly string[] = [],
  accepted: readonly string[] = [],
): DocRequirement[] {
  const submittedSet = new Set(submitted)
  const rejectedSet = new Set(rejected)
  const acceptedSet = new Set(accepted)

  return current.map(req => {
    if (rejectedSet.has(req.code)) return { ...req, state: 'rejected' }
    if (acceptedSet.has(req.code)) return { ...req, state: 'accepted' }
    if (submittedSet.has(req.code) && req.state === 'required') return { ...req, state: 'received' }
    return req
  })
}

export function missingRequirementCodes(reqs: readonly DocRequirement[]): string[] {
  return reqs.filter(r => r.state === 'required' || r.state === 'rejected').map(r => r.code)
}

export function allRequirementsSatisfied(reqs: readonly DocRequirement[]): boolean {
  return reqs.every(r => r.state === 'accepted' || r.state === 'waived' || r.state === 'received')
}
