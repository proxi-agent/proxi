export type TransferStatus =
  | 'ai-review'
  | 'approved'
  | 'blocked'
  | 'cancelled'
  | 'draft'
  | 'escalated'
  | 'failed'
  | 'in-review'
  | 'needs-info'
  | 'posted'
  | 'ready'
  | 'rejected'
  | 'submitted'

export type TransferType = 'cert-to-drs' | 'drs-to-broker' | 'drs-to-cert' | 'drs-to-drs' | 'internal-family' | 'restricted-removal'

export type DestinationKind = 'broker' | 'certificate' | 'entity' | 'individual' | 'joint' | 'trust'

export type ConfidenceBand = 'high' | 'low' | 'medium'

export type Holder = {
  accountNumber: string
  id: string
  initials: string
  kycExpiresAt?: string
  mailingCity?: string
  mailingState?: string
  name: string
  registration: string
  taxProfile: 'missing' | 'W-8BEN' | 'W-9'
}

export type Holding = {
  availableShares: number
  cusip: string
  issuer: string
  lockUpExpiresAt?: string
  marketValuePerShare?: number
  restrictedShares?: number
  restrictionNote?: string
  ticker: string
  type: 'Cert (electronic)' | 'Cert (paper)' | 'DRS' | 'ESPP'
}

export type Destination = {
  accountNumber?: string
  accountTitle?: string
  brokerName?: string
  dtcParticipant?: string
  kind: DestinationKind
  label: string
  mailingAddress?: string
  registrationType?: string
  trusteeNames?: string[]
}

export type ExtractedFieldSection = 'authorizations' | 'compliance' | 'destination' | 'parties' | 'transfer'

export type ExtractedField = {
  approved?: boolean
  confidence: number
  edited?: boolean
  key: string
  label: string
  ledgerValue?: string
  note?: string
  section?: ExtractedFieldSection
  sourceDoc: string
  sourcePage: number
  sourceSnippet?: string
  value: string
  warning?: string
}

export type MissingBlocker = {
  action?: { href: string; label: string }
  howToFix?: string
  label: string
  severity: 'high' | 'low' | 'medium'
}

export type DocumentState = 'accepted' | 'missing' | 'needs-reupload' | 'pending' | 'received' | 'rejected'

export type DocumentType =
  | 'account-statement'
  | 'court-order'
  | 'gov-id'
  | 'liveness'
  | 'medallion'
  | 'notary'
  | 'stock-power'
  | 'trust-certificate'
  | 'w8ben'
  | 'w9'

export type TransferDocument = {
  aiConfidence?: number
  hash?: string
  id: string
  issueNote?: string
  name: string
  pages?: number
  required: boolean
  size?: string
  state: DocumentState
  type: DocumentType
  uploadedAt?: string
}

export type KycResult = {
  addressMatch: null | number
  idMatch: null | number
  lastRunAt?: string
  liveness: 'failed' | null | 'passed' | 'pending'
  ofac: 'cleared' | null | 'pending' | 'review'
  status: 'attention' | 'failed' | 'passed' | 'pending'
}

export type MedallionStatus = 'cropped' | 'expired' | 'missing' | 'ok' | 'unknown-guarantor' | 'waived-affidavit' | 'waived-under-threshold'

export type MedallionPath = {
  affidavitOfLossUsed?: boolean
  amount?: string
  belowThreshold?: boolean
  guarantor?: string
  note?: string
  status: MedallionStatus
  thresholdUsd?: number
}

export type ExceptionSeverity = 'high' | 'low' | 'medium'

export type TransferException = {
  blocking: boolean
  code: string
  description: string
  id: string
  openedAt: string
  severity: ExceptionSeverity
  suggestedAction?: string
  title: string
}

export type ReviewerNote = {
  at: string
  author: string
  authorRole: string
  body: string
  id: string
  tag?: string
}

export type AuditActor = 'compliance' | 'issuer' | 'proxi-ai' | 'reviewer' | 'shareholder' | 'system'

export type AuditKind =
  | 'ai-extracted'
  | 'ai-flagged'
  | 'ai-suggested'
  | 'approved'
  | 'assigned'
  | 'cancelled'
  | 'created'
  | 'document-received'
  | 'document-uploaded'
  | 'escalated'
  | 'info-requested'
  | 'message'
  | 'override'
  | 'posted'
  | 'reassigned'
  | 'rejected'

export type AuditEvent = {
  actor: AuditActor
  actorName: string
  at: string
  detail?: string
  id: string
  kind: AuditKind
  meta?: Record<string, string>
  title: string
  tone?: 'danger' | 'info' | 'ok' | 'warn'
}

export type TransferStage = 'ai-extraction' | 'approval' | 'complete' | 'intake' | 'kyc' | 'medallion' | 'posting' | 'reviewer'

export type SlaState = 'at-risk' | 'on-track' | 'overdue'

export type Sla = {
  agingState: SlaState
  dueAt: string
  expectedTurnaroundHours: number
  pausedReason?: string
  submittedAt: string
}

export type TransferRequest = {
  aiRecommendation?: string
  assignedReviewer?: { initials: string; name: string }
  auditEvents: AuditEvent[]
  confidence: number
  confidenceBand: ConfidenceBand
  createdAt: string
  destination: Destination
  documents: TransferDocument[]
  exceptions: TransferException[]
  extractedFields: ExtractedField[]
  holder: Holder
  holding: Holding
  id: string
  issuerName: string
  kyc: KycResult
  medallion: MedallionPath
  missingBlockers?: MissingBlocker[]
  missingItems: string[]
  nextStepForReviewer?: string
  nextStepForShareholder?: string
  partial: boolean
  reviewerNotes: ReviewerNote[]
  shareCount: number
  shareValue?: number
  sla: Sla
  stage: TransferStage
  status: TransferStatus
  transferType: TransferType
}
