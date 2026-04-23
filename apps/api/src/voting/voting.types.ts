export type MeetingKind = 'ANNUAL' | 'COURT' | 'SPECIAL'
export type MeetingStatus = 'CERTIFIED' | 'CLOSED' | 'DRAFT' | 'OPEN'

export interface Meeting {
  id: string
  issuerId: string
  kind: MeetingKind
  title: string
  status: MeetingStatus
  scheduledAt: Date
  recordDate: string
  quorumPct: number
  location?: string
  virtualUrl?: string
  description?: string
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export type ProposalKind = 'ORDINARY' | 'SHAREHOLDER' | 'SPECIAL'
export type ProposalStatus = 'DRAFT' | 'FAILED' | 'OPEN' | 'PASSED' | 'WITHDRAWN'
export type BoardRecommendation = 'ABSTAIN' | 'AGAINST' | 'FOR'

export interface Proposal {
  id: string
  meetingId: string
  code: string
  title: string
  description?: string
  kind: ProposalKind
  requiredPct: number
  status: ProposalStatus
  sortOrder: number
  boardRecommendation?: BoardRecommendation
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export type BallotStatus = 'ISSUED' | 'INVALID' | 'REVOKED' | 'SUBMITTED'

export interface Ballot {
  id: string
  meetingId: string
  shareholderId: string
  accountId: string
  sharesEligible: number
  status: BallotStatus
  controlNumber: string
  submittedAt?: Date
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export type VoteChoice = 'ABSTAIN' | 'AGAINST' | 'FOR'

export interface Vote {
  id: string
  ballotId: string
  proposalId: string
  choice: VoteChoice
  sharesCast: number
  castAt: Date
  metadata: Record<string, unknown>
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
