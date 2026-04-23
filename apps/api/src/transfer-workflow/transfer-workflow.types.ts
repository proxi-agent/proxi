import type {
  LedgerEntryType,
  TransferIntakeMethod,
  TransferKind,
  TransferLifecycleStage,
  TransferPriority,
  TransferReviewAction,
  TransferState,
} from '@prisma/client'

/**
 * A read-shaped transfer request. BigInt columns are serialized as `number`
 * so the wire format stays JSON-friendly; the MVP's realistic share counts
 * comfortably fit in a JS number. Swap to `string` if we ever need >2^53.
 */
export interface TransferRequestSummary {
  id: string
  reference: string
  issuerId: string
  securityId: string
  shareClassId: string
  fromAccountId?: string
  toAccountId?: string
  quantity: number
  kind: TransferKind
  intakeMethod: TransferIntakeMethod
  state: TransferState
  lifecycleStage: TransferLifecycleStage
  priority: TransferPriority
  submittedById?: string
  assignedReviewerId?: string
  aiConfidence?: number
  aiSummary?: string
  evidenceRequired: string[]
  evidenceSubmitted: string[]
  missingEvidence: string[]
  blockingReasons: string[]
  failureReason?: string
  submittedAt?: Date
  settledAt?: Date
  createdAt: Date
  updatedAt: Date
}

export interface TransferReviewEntry {
  id: string
  action: TransferReviewAction
  reviewerId: string
  reason?: string
  notes?: string
  createdAt: Date
}

export interface TransferTimelineEntry {
  id: string
  kind: 'REVIEW' | 'AUDIT'
  at: Date
  actorId?: string
  actorRole?: string
  action: string
  message?: string
  metadata?: Record<string, unknown>
}

/**
 * Ledger impact preview — pure projection of how settlement would affect the
 * ledger. Not persisted; consumed by the UI to show before-vs-after
 * balances on the transfer detail page.
 */
export interface LedgerImpactLeg {
  accountId?: string
  accountLabel?: string
  entryType: LedgerEntryType
  quantityDelta: number
  balanceBefore: number
  balanceAfter: number
}

export interface LedgerImpactPreview {
  securityId: string
  shareClassId: string
  quantity: number
  legs: LedgerImpactLeg[]
  /// Reasons settlement would fail if attempted right now. Empty array means
  /// settlement is currently safe.
  blockers: string[]
}

export interface TransferDetail extends TransferRequestSummary {
  reviews: TransferReviewEntry[]
  timeline: TransferTimelineEntry[]
  ledgerImpactPreview: LedgerImpactPreview
}
