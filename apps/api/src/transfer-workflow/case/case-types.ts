/**
 * Stock-transfer case domain vocabulary.
 *
 * These constants describe *what kind* of transfer a case is and *what
 * branch* of the workflow it has landed in. They are layered *on top of*
 * the coarse Prisma `TransferState` enum so we don't have to migrate the
 * database to express rich ops semantics:
 *
 *   Prisma.TransferState   → DRAFT | SUBMITTED | UNDER_REVIEW | NEEDS_INFO | APPROVED | SETTLED | REJECTED | CANCELLED
 *   CasePhase (derived)    → intake / awaiting_documents / manual_review / pending_stop_order / …
 *   CaseType / Branch      → business classification + the special-condition branch the case is in
 *
 * Every constant is a lower-cased machine-readable code so it is safe to
 * store in Postgres JSON, filter on in the admin queue, and surface in AI
 * summaries without re-mapping.
 */

export const CASE_TYPES = [
  'standard_individual',
  'gift',
  'estate',
  'fiduciary',
  'restricted_shares',
  'special_situation',
  'issuance',
  'cancellation',
  'adjustment',
] as const
export type CaseType = (typeof CASE_TYPES)[number]

/**
 * Branches are *mutually exclusive* special-condition paths.
 *
 * Ordering matters — when multiple flags apply, the highest-severity
 * branch wins per `BRANCH_PRIORITY`. This keeps the UI deterministic
 * (one banner, not a stack) and makes routing predictable.
 */
export const BRANCHES = [
  'normal',
  'stop_transfer_order',
  'adverse_claim',
  'deceased_owner',
  'restriction_review',
  'issuer_legal_review',
  'supplemental_info',
] as const
export type Branch = (typeof BRANCHES)[number]

export const BRANCH_PRIORITY: Record<Branch, number> = {
  adverse_claim: 90,
  deceased_owner: 70,
  issuer_legal_review: 60,
  normal: 0,
  restriction_review: 50,
  stop_transfer_order: 100,
  supplemental_info: 10,
}

export const BRANCH_LABEL: Record<Branch, string> = {
  adverse_claim: 'Adverse claim',
  deceased_owner: 'Deceased owner',
  issuer_legal_review: 'Issuer legal review',
  normal: 'Standard',
  restriction_review: 'Restriction review',
  stop_transfer_order: 'Stop transfer order',
  supplemental_info: 'Supplemental info requested',
}

/**
 * Derived operational phase — finer-grained than `TransferState`.
 *
 * Always a function of `(state, branch, flags)`; never stored directly.
 * Used by the admin UI for queue lanes, badges, and SLA display.
 */
export const CASE_PHASES = [
  'draft',
  'intake_in_progress',
  'awaiting_documents',
  'ready_for_review',
  'automated_review_passed',
  'manual_review_required',
  'pending_stop_order_resolution',
  'pending_adverse_claim_review',
  'pending_deceased_validation',
  'pending_issuer_legal_review',
  'pending_restriction_review',
  'approved',
  'ready_for_settlement',
  'settled',
  'failed',
  'rejected',
  'cancelled',
] as const
export type CasePhase = (typeof CASE_PHASES)[number]

/**
 * Deterministic rule codes emitted by the checks engine. Scoring uses
 * these as keys so downstream consumers (copilot, AI summarizer, queue
 * filters) can reason about results without re-parsing sentences.
 */
export const RULE_CODES = [
  'holder_identity_match',
  'account_ownership_match',
  'completeness_score',
  'confidence_score',
  'stop_transfer_order_check',
  'adverse_claim_check',
  'deceased_owner_check',
  'restriction_flag_check',
  'legal_opinion_required',
  'rep_letter_required',
  'tax_withholding_required',
  'fast_reconciliation_required',
  'sufficient_holdings',
  'medallion_signature',
] as const
export type RuleCode = (typeof RULE_CODES)[number]

export type RuleOutcome = 'pass' | 'fail' | 'warn' | 'skip'

export interface RuleResult {
  code: RuleCode
  outcome: RuleOutcome
  /** 0–1 machine-readable score when the rule is probabilistic; optional otherwise. */
  score?: number
  /** Stable machine-readable reason code, e.g. `insufficient_holdings`. */
  reason?: string
  /** Human-readable summary suitable for the admin UI. */
  message?: string
  details?: Record<string, unknown>
}

/**
 * Checklist item status — mirrors evidenceRequired/evidenceSubmitted but
 * adds visibility for rejected uploads ("needs_reupload"). Missing items
 * move the case into `awaiting_documents` automatically.
 */
export const DOC_REQUIREMENT_STATES = ['required', 'received', 'accepted', 'rejected', 'waived'] as const
export type DocRequirementState = (typeof DOC_REQUIREMENT_STATES)[number]

export interface DocRequirement {
  code: string
  label: string
  state: DocRequirementState
  reason?: string
  dueAt?: string
  waiverReason?: string
  /** Free-form tag like `'medallion'`, `'court_order'` used by UI. */
  category?: string
}

/**
 * Settlement sub-step statuses. Settlement is a multi-step procedure
 * (validate → cancel-old → issue-new → DRS statement → FAST → tax) and
 * each step is tracked independently so partial progress is auditable.
 */
export const SETTLEMENT_STEP_CODES = [
  'validate_registration',
  'validate_tax_docs',
  'cancel_old_position',
  'issue_new_position',
  'generate_drs_statement',
  'update_fast_position',
  'confirm_prior_cancellation',
  'record_tax_withholding',
] as const
export type SettlementStepCode = (typeof SETTLEMENT_STEP_CODES)[number]

export type SettlementStepStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'failed'

export interface SettlementStep {
  code: SettlementStepCode
  label: string
  status: SettlementStepStatus
  startedAt?: string
  completedAt?: string
  reference?: string
  notes?: string
}

export const SETTLEMENT_STEP_LABEL: Record<SettlementStepCode, string> = {
  cancel_old_position: 'Cancel old position',
  confirm_prior_cancellation: 'Confirm prior cancellation',
  generate_drs_statement: 'Generate DRS statement',
  issue_new_position: 'Issue new position',
  record_tax_withholding: 'Record tax withholding',
  update_fast_position: 'Update FAST position',
  validate_registration: 'Validate new registration',
  validate_tax_docs: 'Validate transferor / transferee tax docs',
}

/**
 * Branch-specific flag metadata stored inside the case JSON.
 *
 * Storing timestamps + the originating actor lets the UI render an
 * accurate "raised X ago by Y" in the banner and feeds AI summaries.
 */
export interface StopTransferOrderFlag {
  referenceCode?: string
  reason: string
  raisedAt: string
  raisedBy?: string
  resolvedAt?: string
  resolvedBy?: string
}

export interface AdverseClaimFlag {
  claimantName?: string
  reason: string
  raisedAt: string
  raisedBy?: string
  resolvedAt?: string
  resolvedBy?: string
}

export interface DeceasedOwnerFlag {
  reason: string
  raisedAt: string
  raisedBy?: string
  dateOfDeath?: string
  waiverRequired?: boolean
  resolvedAt?: string
  resolvedBy?: string
}

export interface RestrictionFlag {
  category: 'legend' | 'rule_144' | 'representation_letter' | 'lock_up' | 'other'
  reason: string
  raisedAt: string
  raisedBy?: string
  resolvedAt?: string
  resolvedBy?: string
}

export interface LegalOpinionFlag {
  requestedAt: string
  requestedBy?: string
  providedAt?: string
  provider?: string
  opinionDocId?: string
}

export interface IssuerReviewFlag {
  requestedAt: string
  requestedBy?: string
  respondedAt?: string
  decision?: 'approved' | 'rejected' | 'info_requested'
  reason?: string
}

export interface TaxFollowUp {
  form: 'W-9' | 'W-8BEN' | 'W-8BEN-E' | '1099-B' | '1042-S'
  status: 'pending' | 'received' | 'not_applicable' | 'waived'
  dueAt?: string
  withholdingCents?: number
  notes?: string
}

export interface CaseFlags {
  stopTransferOrder?: StopTransferOrderFlag
  adverseClaim?: AdverseClaimFlag
  deceasedOwner?: DeceasedOwnerFlag
  restriction?: RestrictionFlag
  legalOpinion?: LegalOpinionFlag
  issuerReview?: IssuerReviewFlag
  taxFollowUps?: TaxFollowUp[]
}

/**
 * Structured extraction from submitted documents. The extractor is
 * intentionally *additive* — fields not extracted remain undefined and
 * are inferred from the Prisma row instead.
 */
export interface ExtractedFields {
  transferorName?: string
  transfereeName?: string
  registration?: string
  sharesRequested?: number
  caseTypeHint?: CaseType
  notes?: string
  /** Field-level confidence (0–1) keyed by the field name above. */
  fieldConfidence?: Partial<Record<keyof ExtractedFields, number>>
}

/**
 * The *complete* case envelope persisted as `TransferRequest.canonicalData`.
 * `version` lets us migrate the shape later without breaking older rows.
 */
export interface WorkflowCaseEnvelope {
  version: 1
  caseType: CaseType
  branch: Branch
  phase: CasePhase
  intakeSource: 'portal' | 'form_upload' | 'api' | 'manual'
  intakeAt?: string
  completeness: number
  confidence: number
  autoRouted: boolean
  narratives: {
    summary?: string
    nextAction?: string
    failureReason?: string
  }
  requirements: DocRequirement[]
  rules: RuleResult[]
  flags: CaseFlags
  settlementPlan: SettlementStep[]
  extracted: ExtractedFields
  /** Timestamps for individual branch entry — useful for SLA/aging views. */
  phaseEnteredAt: string
}

export const CURRENT_CASE_VERSION = 1 as const
