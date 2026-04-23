export type PaginatedResponse<T> = {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  sortBy?: string
  sortDir: 'asc' | 'desc'
}

export type IssuerStatus = 'ACTIVE' | 'ONBOARDING' | 'SUSPENDED' | 'TERMINATED'

export interface Issuer {
  id: string
  name: string
  legalName: string
  cik?: string
  jurisdiction: string
  status: IssuerStatus
  contactEmail?: string
  website?: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type SecurityStatus = 'ACTIVE' | 'DELISTED' | 'SUSPENDED'

export interface ShareClass {
  id: string
  securityId: string
  code: string
  name: string
  parValueCents: number
  votesPerShare: number
  dividendEligible: boolean
  transferRestricted: boolean
  metadata: Record<string, unknown>
}

export interface Security {
  id: string
  issuerId: string
  ticker?: string
  name: string
  cusip?: string
  isin?: string
  status: SecurityStatus
  currency: string
  authorizedShares: number
  outstandingShares: number
  shareClasses: ShareClass[]
  metadata: Record<string, unknown>
}

export type HolderKind = 'BENEFICIAL' | 'REGISTERED' | 'STREET_NAME'
export type HolderClassification = 'FUND' | 'INSIDER' | 'INSTITUTION' | 'RETAIL' | 'TREASURY'
export type KycStatus = 'APPROVED' | 'PENDING' | 'REJECTED' | 'REVIEW'
export type ShareholderStatus = 'ACTIVE' | 'ARCHIVED' | 'SUSPENDED'

export interface Shareholder {
  id: string
  issuerId: string
  holderKind: HolderKind
  legalName: string
  classification: HolderClassification
  jurisdiction?: string
  riskTier: 'HIGH' | 'LOW' | 'MEDIUM'
  email?: string
  status: ShareholderStatus
  kycStatus: KycStatus
  metadata: Record<string, unknown>
}

export type AccountStatus = 'ACTIVE' | 'CLOSED' | 'RESTRICTED'
export type RegistrationType = 'CUSTODIAN' | 'ENTITY' | 'INDIVIDUAL' | 'JOINT' | 'TRUST'

export interface ShareholderAccount {
  id: string
  shareholderId: string
  issuerId: string
  accountNumber: string
  registrationType: RegistrationType
  status: AccountStatus
  primaryEmail?: string
  address: Record<string, unknown>
  metadata: Record<string, unknown>
}

export type LedgerEventType = 'ADJUSTMENT' | 'CANCEL' | 'ISSUE' | 'TRANSFER'

export interface LedgerEvent {
  id: number
  type: LedgerEventType
  securityId: string
  holderId?: string
  fromHolderId?: string
  toHolderId?: string
  quantity: number
  timestamp: string
  reason?: string
  metadata: Record<string, unknown>
}

export interface Holding {
  securityId: string
  holderId: string
  quantity: number
  shareholderId?: string
  shareholderName?: string
}

export type DividendStatus = 'CANCELLED' | 'DECLARED' | 'DRAFT' | 'PAID' | 'SNAPSHOTTED'
export type DividendKind = 'CASH' | 'STOCK'
export type EntitlementStatus = 'PAID' | 'PENDING' | 'VOIDED'

export interface DividendEvent {
  id: string
  issuerId: string
  securityId: string
  shareClassId?: string
  status: DividendStatus
  kind: DividendKind
  ratePerShareCents: number
  currency: string
  declarationDate: string
  recordDate: string
  paymentDate: string
  totalDistributionCents: number
  description?: string
  metadata: Record<string, unknown>
}

export interface DividendEntitlement {
  id: string
  dividendEventId: string
  accountId: string
  shareholderId: string
  sharesHeld: number
  amountCents: number
  status: EntitlementStatus
  paidAt?: string
  paymentReference?: string
}

export type MeetingKind = 'ANNUAL' | 'COURT' | 'SPECIAL'
export type MeetingStatus = 'CERTIFIED' | 'CLOSED' | 'DRAFT' | 'OPEN'
export type ProposalStatus = 'DRAFT' | 'FAILED' | 'OPEN' | 'PASSED' | 'WITHDRAWN'
export type VoteChoice = 'ABSTAIN' | 'AGAINST' | 'FOR'

export interface Meeting {
  id: string
  issuerId: string
  kind: MeetingKind
  title: string
  status: MeetingStatus
  scheduledAt: string
  recordDate: string
  quorumPct: number
  location?: string
  virtualUrl?: string
}

export interface Proposal {
  id: string
  meetingId: string
  code: string
  title: string
  kind: 'ORDINARY' | 'SHAREHOLDER' | 'SPECIAL'
  requiredPct: number
  status: ProposalStatus
  sortOrder: number
  boardRecommendation?: VoteChoice
}

export interface Ballot {
  id: string
  meetingId: string
  shareholderId: string
  accountId: string
  sharesEligible: number
  status: 'INVALID' | 'ISSUED' | 'REVOKED' | 'SUBMITTED'
  controlNumber: string
  submittedAt?: string
}

export interface ProposalTally {
  proposalId: string
  for: number
  against: number
  abstain: number
  totalShares: number
  totalCastShares: number
  quorumMet: boolean
  passed: boolean
  requiredPct: number
  approvalPct: number
}

export type NoticeKind = 'COMPLIANCE' | 'DIVIDEND' | 'GENERAL' | 'MEETING' | 'SHAREHOLDER' | 'TRANSFER'
export type NoticeStatus = 'ARCHIVED' | 'DRAFT' | 'PUBLISHED'

export interface Notice {
  id: string
  issuerId: string
  kind: NoticeKind
  subject: string
  body: string
  audience: 'ALL' | 'BOARD' | 'HOLDERS' | 'REGULATORS' | 'TRANSFER_AGENTS'
  status: NoticeStatus
  publishedAt?: string
}

export type TaskStatus = 'BLOCKED' | 'CANCELLED' | 'IN_REVIEW' | 'OPEN' | 'RESOLVED'
export type TaskPriority = 'CRITICAL' | 'HIGH' | 'LOW' | 'MEDIUM'

export interface Task {
  id: string
  issuerId?: string
  type: string
  priority: TaskPriority
  severity: 'CRITICAL' | 'ERROR' | 'INFO' | 'WARN'
  status: TaskStatus
  title: string
  description?: string
  assigneeId?: string
  dueAt?: string
  resolvedAt?: string
  recommendedActions: Array<{ label: string; action: string; url?: string }>
}

export interface AuditEvent {
  id: number
  occurredAt: string
  actorId: string
  actorRole?: string
  action: string
  severity: 'CRITICAL' | 'HIGH' | 'INFO' | 'LOW' | 'MEDIUM'
  entityType: string
  entityId: string
  issuerId?: string
  metadata: Record<string, unknown>
}

export type TransferState =
  | 'APPROVED'
  | 'EVIDENCE_PENDING'
  | 'EXCEPTION'
  | 'IN_REVIEW'
  | 'PROCESSING'
  | 'REJECTED'
  | 'SETTLED'
  | 'SUBMITTED'

export type CaseType = 'CANCEL' | 'ISSUE' | 'TRANSFER'

export interface TransferSummary {
  id: number
  type: CaseType
  state: TransferState
  securityId: string
  quantity: number
  fromHolderId?: string
  toHolderId?: string
  holderId?: string
  assignedReviewerId?: string
  aiConfidence?: number
  aiSummary?: string
  evidenceComplete: boolean
  missingEvidenceCount: number
  hasBlockingRestrictions: boolean
  ledgerEventId?: number
  createdAt: string
  updatedAt: string
}

export interface TransferStats {
  byState: Record<TransferState, number>
  byType: Record<CaseType, number>
  total: number
}

export type InsightKind =
  | 'ACTIVITY_SEARCH'
  | 'ANOMALY_FLAGS'
  | 'DIVIDEND_READINESS'
  | 'ISSUER_SUMMARY'
  | 'MEETING_TURNOUT'
  | 'OPERATIONAL_COPILOT'
  | 'SHAREHOLDER_SUMMARY'
  | 'TASK_FOCUS'
  | 'TRANSFER_SUMMARY'

export type InsightSeverity = 'CRITICAL' | 'INFO' | 'SUCCESS' | 'WARN'
export type InsightGenerator = 'HEURISTIC' | 'LLM' | 'MIXED'

export interface InsightSignal {
  code: string
  label: string
  detail?: string
  severity: InsightSeverity
  metadata?: Record<string, unknown>
}

export interface InsightAction {
  label: string
  action: string
  url?: string
  params?: Record<string, unknown>
}

export interface InsightReference {
  kind: string
  id: string
  label?: string
}

export interface Insight {
  kind: InsightKind
  subject: { type: string; id: string; label?: string }
  generatedAt: string
  generator: InsightGenerator
  headline: string
  summary: string
  signals: InsightSignal[]
  recommendedActions: InsightAction[]
  references: InsightReference[]
  data?: Record<string, unknown>
  llmError?: string
}
