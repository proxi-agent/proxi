import type { DestinationKind, DocumentType, TransferStage, TransferStatus, TransferType } from './types'

export const TRANSFER_TYPE_LABEL: Record<TransferType, string> = {
  'cert-to-drs': 'Certificate → DRS',
  'drs-to-broker': 'DRS → Broker (DWAC/DRS withdrawal)',
  'drs-to-cert': 'DRS → Certificate issuance',
  'drs-to-drs': 'DRS → DRS re-registration',
  'internal-family': 'Family / gift transfer',
  'restricted-removal': 'Restricted legend removal',
}

export const TRANSFER_TYPE_SUB: Record<TransferType, string> = {
  'cert-to-drs': 'Deposit a paper or electronic certificate into book-entry DRS.',
  'drs-to-broker': 'Move book-entry shares from Proxi DRS to a brokerage account.',
  'drs-to-cert': 'Issue a physical or electronic certificate from a DRS position.',
  'drs-to-drs': 'Re-register DRS shares under a new name, trust, or entity.',
  'internal-family': 'Transfer to a spouse, child, or family trust.',
  'restricted-removal': 'Remove Rule 144 or lock-up legend from restricted shares.',
}

export const DESTINATION_LABEL: Record<DestinationKind, string> = {
  broker: 'Brokerage account',
  certificate: 'Physical certificate',
  entity: 'Entity / LLC / corporation',
  individual: 'Individual',
  joint: 'Joint tenants',
  trust: 'Trust',
}

export type StageDef = {
  description: string
  id: TransferStage
  ownedBy: 'agent' | 'compliance' | 'proxi' | 'shareholder'
  title: string
}

export const STAGES: StageDef[] = [
  {
    description: 'Shareholder submits the request and supporting evidence.',
    id: 'intake',
    ownedBy: 'shareholder',
    title: 'Intake',
  },
  {
    description: 'Textract + structured extraction · field-level confidence.',
    id: 'ai-extraction',
    ownedBy: 'proxi',
    title: 'AI extraction',
  },
  {
    description: 'Government ID, liveness, OFAC / sanctions screening.',
    id: 'kyc',
    ownedBy: 'proxi',
    title: 'Identity & KYC',
  },
  {
    description: 'Medallion stamp validation or alternative path check.',
    id: 'medallion',
    ownedBy: 'proxi',
    title: 'Signature guarantee',
  },
  {
    description: 'Transfer agent reviews low-confidence or exception cases.',
    id: 'reviewer',
    ownedBy: 'agent',
    title: 'Reviewer',
  },
  {
    description: 'Dual-control approval · permanently logged.',
    id: 'approval',
    ownedBy: 'agent',
    title: 'Approval',
  },
  {
    description: 'Ledger post, DTC / DWAC instruction, confirmations sent.',
    id: 'posting',
    ownedBy: 'proxi',
    title: 'Posting',
  },
  {
    description: 'Transfer is final. Immutable record retained.',
    id: 'complete',
    ownedBy: 'proxi',
    title: 'Complete',
  },
]

export function stageIndex(stage: TransferStage): number {
  return STAGES.findIndex(s => s.id === stage)
}

type StatusMeta = {
  label: string
  tone: 'brand' | 'danger' | 'info' | 'neutral' | 'positive' | 'warning'
}

export const STATUS_META: Record<TransferStatus, StatusMeta> = {
  'ai-review': { label: 'AI review', tone: 'info' },
  approved: { label: 'Approved', tone: 'positive' },
  blocked: { label: 'Blocked', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  draft: { label: 'Draft', tone: 'neutral' },
  escalated: { label: 'Escalated', tone: 'warning' },
  failed: { label: 'Failed', tone: 'danger' },
  'in-review': { label: 'In review', tone: 'brand' },
  'needs-info': { label: 'Needs info', tone: 'warning' },
  posted: { label: 'Posted', tone: 'positive' },
  ready: { label: 'Ready for approval', tone: 'brand' },
  rejected: { label: 'Rejected', tone: 'danger' },
  submitted: { label: 'Submitted', tone: 'info' },
}

export const DOCUMENT_LABEL: Record<DocumentType, string> = {
  'account-statement': 'Destination account statement',
  'court-order': 'Court order',
  'gov-id': 'Government-issued ID',
  liveness: 'Liveness capture',
  medallion: 'Medallion signature guarantee',
  notary: 'Notarized statement',
  'stock-power': 'Stock power / transfer instruction',
  'trust-certificate': 'Certificate of trust',
  w8ben: 'IRS Form W-8BEN',
  w9: 'IRS Form W-9',
}

export function requirementsFor(type: TransferType, destination: DestinationKind): DocumentType[] {
  const base: DocumentType[] = ['stock-power', 'gov-id', 'liveness']
  const needsTax: DocumentType[] = type === 'cert-to-drs' ? ['w9'] : []
  const needsMedallion: DocumentType[] = type === 'drs-to-broker' || type === 'restricted-removal' ? ['medallion'] : []
  const perDestination: DocumentType[] =
    destination === 'trust' ? ['trust-certificate'] : destination === 'broker' ? ['account-statement'] : []
  return [...base, ...needsMedallion, ...needsTax, ...perDestination]
}

// Expected turnaround (business hours) by path
export function turnaroundHours(type: TransferType, hasExceptions: boolean, confidence: number): number {
  if (hasExceptions) return 48
  if (confidence >= 90) return 6
  if (confidence >= 70) return 12
  return 24
}

export const MEDALLION_WAIVER_THRESHOLD_USD = 25_000

export function confidenceBand(value: number): 'high' | 'low' | 'medium' {
  if (value >= 85) return 'high'
  if (value >= 65) return 'medium'
  return 'low'
}
